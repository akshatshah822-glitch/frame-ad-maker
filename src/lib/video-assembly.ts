import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { TreatmentData, VideoProduction } from "@/lib/types";
import { generateNarrationTrack } from "@/lib/voice";
import { getVideoConfig } from "@/lib/video-config";
import { probeFinalVideo } from "@/lib/video-qa";
import { createScreenCopyOverlay } from "@/lib/render-graphics";

const exec = promisify(execFile);

async function runFfmpeg(args: string[]) {
  const executable = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  await exec(executable, ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 4_000_000, timeout: 180_000 });
}

async function probeDuration(path: string) {
  const executable = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  const { stderr } = await exec(executable, ["-hide_banner", "-i", path, "-f", "null", "-"], { maxBuffer: 1_000_000 });
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("The generated narration has no readable duration.");
  return duration;
}

async function download(url: string, path: string, label: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label} could not be downloaded (${response.status})`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}

export async function assembleVideoStep(treatment: TreatmentData, production: VideoProduction, position: number) {
  const directory = await mkdtemp(join(tmpdir(), "frame-video-"));
  const config = getVideoConfig(treatment.brief.platform);
  const orderedClips = [...production.clips].sort((a, b) => a.shotNumber - b.shotNumber);
  if (!Number.isInteger(position) || position < 1 || position > orderedClips.length) throw new Error(`Invalid assembly position ${position}`);
  const clip = orderedClips[position - 1];
  if (!clip.videoUrl) throw new Error(`Shot ${clip.shotNumber} has no durable video`);
  const shot = treatment.generation.shots.find((item) => item.shotNumber === clip.shotNumber);
  if (!shot?.imageUrl) throw new Error(`Shot ${clip.shotNumber} has no approved keyframe`);

  const running = join(directory, "running.mp4");
  const source = join(directory, `source-${clip.shotNumber}.mp4`);
  const keyframe = join(directory, `keyframe-${clip.shotNumber}.png`);
  const output = join(directory, `assembly-${position}.mp4`);
  if (position > 1) {
    if (!production.assemblyUrl || production.assemblyPosition !== position - 1) throw new Error(`Assembly position ${position - 1} is not stored`);
    await download(production.assemblyUrl, running, "The running assembly");
  }
  await Promise.all([download(clip.videoUrl, source, `Shot ${clip.shotNumber}`), download(shot.imageUrl, keyframe, `Shot ${clip.shotNumber} keyframe`)]);

  const inputs = position > 1 ? ["-i", running] : [];
  const sourceIndex = position > 1 ? 1 : 0;
  const keyframeIndex = sourceIndex + 1;
  inputs.push("-i", source, "-loop", "1", "-i", keyframe);
  const shotText = [shot.visualDescription, shot.subjectAction, shot.locationAndProps, shot.productPresence].join(" ");
  const containsScreen = /\b(screen|display|monitor|phone|interface|console|dashboard)\b/i.test(shotText);
  let nextInputIndex = keyframeIndex + 1;
  let overlayIndex: number | undefined;
  if (containsScreen) {
    const overlay = join(directory, `screen-copy-${clip.shotNumber}.png`);
    await writeFile(overlay, await createScreenCopyOverlay(config.width, config.height, treatment.brief.proposition));
    overlayIndex = nextInputIndex++;
    inputs.push("-loop", "1", "-i", overlay);
  }
  const silenceIndex = nextInputIndex++;
  inputs.push("-f", "lavfi", "-t", String(clip.duration), "-i", "anullsrc=r=48000:cl=stereo");

  const scale = `scale=${config.width}:${config.height}:force_original_aspect_ratio=increase,crop=${config.width}:${config.height},fps=24,format=yuv420p,setsar=1`;
  const lockDuration = Math.min(0.25, Math.max(0.12, clip.duration * 0.05));
  const motionDuration = Math.max(0.1, clip.duration - lockDuration);
  const filters = [
    `[${keyframeIndex}:v]${scale},trim=duration=${lockDuration},setpts=PTS-STARTPTS[still]`,
    `[${sourceIndex}:v]${scale},trim=start=${lockDuration}:duration=${motionDuration},setpts=PTS-STARTPTS[motion]`,
    `[still][motion]concat=n=2:v=1:a=0[locked]`,
  ];
  const newVideo = overlayIndex === undefined ? "locked" : "newv";
  if (overlayIndex !== undefined) filters.push(`[locked][${overlayIndex}:v]overlay=0:0:format=auto[newv]`);
  filters.push(`[${silenceIndex}:a]atrim=duration=${clip.duration},asetpts=PTS-STARTPTS[silence]`);
  if (position > 1) {
    filters.push(`[0:v]${scale},setpts=PTS-STARTPTS[previousv]`);
    filters.push(`[0:a]volume=0,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[previousa]`);
    filters.push(`[previousv][previousa][${newVideo}][silence]concat=n=2:v=1:a=1[outv][silentout]`);
  } else {
    filters.push(`[${newVideo}]setpts=PTS-STARTPTS[outv]`);
    filters.push(`[silence]asetpts=PTS-STARTPTS[silentout]`);
  }
  const expectedDuration = orderedClips.slice(0, position).reduce((total, item) => total + item.duration, 0);
  let audioOutput = "silentout";
  if (position === orderedClips.length) {
    const narrationPath = join(directory, "narration.mp3");
    await writeFile(narrationPath, await generateNarrationTrack(treatment.generation.script ?? ""));
    const narrationDuration = await probeDuration(narrationPath);
    if (narrationDuration > expectedDuration + 0.05) {
      throw new Error(`Narration is ${narrationDuration.toFixed(3)} seconds, longer than the ${expectedDuration.toFixed(3)}-second film. Shorten the saved script so narration is not cut off.`);
    }
    const narrationIndex = nextInputIndex;
    inputs.push("-i", narrationPath);
    filters.push(`[${narrationIndex}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS,apad=whole_dur=${expectedDuration},atrim=duration=${expectedDuration}[narration]`);
    filters.push(`[silentout][narration]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[outa]`);
    audioOutput = "outa";
  }
  await runFfmpeg([...inputs, "-filter_complex", filters.join(";"), "-map", "[outv]", "-map", `[${audioOutput}]`, "-t", String(expectedDuration), "-r", "24", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", output]);
  if (position < orderedClips.length) return { bytes: new Uint8Array(await readFile(output)), qa: undefined };
  const qa = await probeFinalVideo(output, { width: config.width, height: config.height, duration: expectedDuration });
  if (!qa.passed) throw new Error(`Final technical QA failed: ${JSON.stringify(qa)}`);
  return { bytes: new Uint8Array(await readFile(output)), qa };
}
