import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { TreatmentData, VideoProduction } from "@/lib/types";
import { generateVoiceSegments } from "@/lib/voice";
import { getVideoConfig } from "@/lib/video-config";
import { probeFinalVideo } from "@/lib/video-qa";
import { createScreenCopyOverlay } from "@/lib/render-graphics";

const exec = promisify(execFile);

async function runFfmpeg(args: string[]) {
  const executable = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  await exec(executable, ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 4_000_000, timeout: 240_000 });
}

export async function assembleVideo(treatment: TreatmentData, production: VideoProduction, narration?: string[]) {
  const directory = await mkdtemp(join(tmpdir(), "frame-video-"));
  const config = getVideoConfig(treatment.brief.platform);
  const normalized: string[] = [];
  const orderedClips = [...production.clips].sort((a, b) => a.shotNumber - b.shotNumber);
  for (const clip of orderedClips) {
    if (!clip.videoUrl) throw new Error(`Shot ${clip.shotNumber} has no durable video`);
    const source = join(directory, `source-${clip.shotNumber}.mp4`);
    const output = join(directory, `shot-${clip.shotNumber}.mp4`);
    const response = await fetch(clip.videoUrl); if (!response.ok) throw new Error(`Shot ${clip.shotNumber} could not be downloaded`);
    await writeFile(source, Buffer.from(await response.arrayBuffer()));
    const shot = treatment.generation.shots.find((item) => item.shotNumber === clip.shotNumber);
    if (!shot?.imageUrl) throw new Error(`Shot ${clip.shotNumber} has no approved keyframe`);
    const keyframe = join(directory, `keyframe-${clip.shotNumber}.png`);
    const keyframeResponse = await fetch(shot.imageUrl);
    if (!keyframeResponse.ok) throw new Error(`Shot ${clip.shotNumber} keyframe could not be downloaded`);
    await writeFile(keyframe, Buffer.from(await keyframeResponse.arrayBuffer()));
    const shotText = shot ? [shot.visualDescription, shot.subjectAction, shot.locationAndProps, shot.productPresence].join(" ") : "";
    const containsScreen = /\b(screen|display|monitor|phone|interface|console|dashboard)\b/i.test(shotText);
    const scale = `scale=${config.width}:${config.height}:force_original_aspect_ratio=increase,crop=${config.width}:${config.height},fps=24,format=yuv420p,setsar=1`;
    const lockDuration = Math.min(0.25, Math.max(0.12, clip.duration * 0.05));
    const motionDuration = Math.max(0.1, clip.duration - lockDuration);
    const lockedFilter = `[1:v]${scale},trim=duration=${lockDuration},setpts=PTS-STARTPTS[still];[0:v]${scale},trim=start=${lockDuration}:duration=${motionDuration},setpts=PTS-STARTPTS[motion];[still][motion]concat=n=2:v=1:a=0[locked]`;
    if (containsScreen) {
      const overlay = join(directory, `screen-copy-${clip.shotNumber}.png`);
      await writeFile(overlay, await createScreenCopyOverlay(config.width, config.height, treatment.brief.proposition));
      await runFfmpeg(["-i", source, "-loop", "1", "-i", keyframe, "-loop", "1", "-i", overlay, "-t", String(clip.duration), "-filter_complex", `${lockedFilter};[locked][2:v]overlay=0:0:format=auto[v]`, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-movflags", "+faststart", output]);
    } else {
      await runFfmpeg(["-i", source, "-loop", "1", "-i", keyframe, "-t", String(clip.duration), "-filter_complex", lockedFilter, "-map", "[locked]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-movflags", "+faststart", output]);
    }
    normalized.push(output);
  }
  const voiceSegments = await generateVoiceSegments(treatment.generation.shots, treatment.brief, narration);
  const voicePaths: Array<{ path: string; delay: number }> = [];
  for (const segment of voiceSegments) { const path = join(directory, `voice-${segment.shotNumber}.mp3`); await writeFile(path, segment.bytes); voicePaths.push({ path, delay: segment.startTime * 1000 }); }
  const finalPath = join(directory, "frame-final.mp4");
  const silentAudioIndex = normalized.length;
  const inputs = [...normalized.flatMap((path) => ["-i", path]), "-f", "lavfi", "-t", "30", "-i", "anullsrc=r=48000:cl=stereo", ...voicePaths.flatMap((voice) => ["-i", voice.path])];
  const audioParts = voicePaths.map((voice, index) => `[${silentAudioIndex + index + 1}:a]adelay=${voice.delay}|${voice.delay},aresample=48000,volume=1[vo${index}]`);
  const audioInputs = [`[${silentAudioIndex}:a]`, ...voicePaths.map((_, index) => `[vo${index}]`)].join("");
  const audioFilter = `${audioParts.length ? `${audioParts.join(";")};` : ""}${audioInputs}amix=inputs=${voicePaths.length + 1}:duration=longest:normalize=0,alimiter=limit=0.95[a]`;
  const uniformClips = normalized.map((_, index) => `[${index}:v]scale=${config.width}:${config.height}:force_original_aspect_ratio=increase,crop=${config.width}:${config.height},fps=24,format=yuv420p,setsar=1,setpts=PTS-STARTPTS[join${index}]`);
  const joinedClips = normalized.map((_, index) => `[join${index}]`).join("");
  const videoFilter = `${uniformClips.join(";")};${joinedClips}concat=n=${normalized.length}:v=1:a=0,trim=duration=30,setpts=PTS-STARTPTS,format=yuv420p[v]`;
  await runFfmpeg([...inputs, "-filter_complex", `${audioFilter};${videoFilter}`, "-map", "[v]", "-map", "[a]", "-t", "30", "-r", "24", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", finalPath]);
  const qa = await probeFinalVideo(finalPath, { width: config.width, height: config.height, duration: 30 });
  if (!qa.passed) throw new Error(`Final technical QA failed: ${JSON.stringify(qa)}`);
  return { bytes: new Uint8Array(await readFile(finalPath)), qa };
}
