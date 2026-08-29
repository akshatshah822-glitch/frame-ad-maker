import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import type { TreatmentData, VideoProduction } from "@/lib/types";
import { generateVoiceSegments } from "@/lib/voice";
import { getVideoConfig } from "@/lib/video-config";
import { probeFinalVideo } from "@/lib/video-qa";

const exec = promisify(execFile);

async function runFfmpeg(args: string[]) {
  if (!ffmpegPath) throw new Error("FFmpeg is unavailable");
  await exec(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 4_000_000, timeout: 240_000 });
}

function drawtextEscape(value: string) { return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/%/g, "\\%"); }

export async function assembleVideo(treatment: TreatmentData, production: VideoProduction) {
  const directory = await mkdtemp(join(tmpdir(), "frame-video-"));
  const config = getVideoConfig(treatment.brief.platform);
  const normalized: string[] = [];
  for (const clip of production.clips) {
    if (!clip.videoUrl) throw new Error(`Shot ${clip.shotNumber} has no durable video`);
    const source = join(directory, `source-${clip.shotNumber}.mp4`);
    const output = join(directory, `shot-${clip.shotNumber}.mp4`);
    const response = await fetch(clip.videoUrl); if (!response.ok) throw new Error(`Shot ${clip.shotNumber} could not be downloaded`);
    await writeFile(source, Buffer.from(await response.arrayBuffer()));
    await runFfmpeg(["-i", source, "-t", String(clip.duration), "-vf", `scale=${config.width}:${config.height}:force_original_aspect_ratio=increase,crop=${config.width}:${config.height},fps=24,format=yuv420p`, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-movflags", "+faststart", output]);
    normalized.push(output);
  }
  const concatFile = join(directory, "concat.txt");
  await writeFile(concatFile, normalized.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join("\n"));
  const picture = join(directory, "picture.mp4");
  await runFfmpeg(["-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", picture]);

  const voiceSegments = await generateVoiceSegments(treatment.generation.shots, treatment.brief);
  const voicePaths: Array<{ path: string; delay: number }> = [];
  for (const segment of voiceSegments) { const path = join(directory, `voice-${segment.shotNumber}.mp3`); await writeFile(path, segment.bytes); voicePaths.push({ path, delay: segment.startTime * 1000 }); }
  const finalPath = join(directory, "frame-final.mp4");
  const brand = treatment.generation.brandBible?.brandName || treatment.brief.brandProduct.split(/[—,:]/)[0].trim();
  const tagline = treatment.brief.proposition;
  const inputs = ["-i", picture, "-f", "lavfi", "-t", "30", "-i", "anullsrc=r=48000:cl=stereo", ...voicePaths.flatMap((voice) => ["-i", voice.path])];
  const audioParts = voicePaths.map((voice, index) => `[${index + 2}:a]adelay=${voice.delay}|${voice.delay},aresample=48000,volume=1[vo${index}]`);
  const audioInputs = ["[1:a]", ...voicePaths.map((_, index) => `[vo${index}]`)].join("");
  const audioFilter = `${audioParts.length ? `${audioParts.join(";")};` : ""}${audioInputs}amix=inputs=${voicePaths.length + 1}:duration=longest:normalize=0,alimiter=limit=0.95[a]`;
  const videoFilter = `[0:v]drawtext=font='Sans':text='${drawtextEscape(brand.toUpperCase())}':fontcolor=white:fontsize=${Math.round(config.width * .055)}:x=(w-text_w)/2:y=h*0.76:enable='between(t,27.4,30)',drawtext=font='Sans':text='${drawtextEscape(tagline)}':fontcolor=white:fontsize=${Math.round(config.width * .022)}:x=(w-text_w)/2:y=h*0.84:enable='between(t,27.7,30)',format=yuv420p[v]`;
  await runFfmpeg([...inputs, "-filter_complex", `${audioFilter};${videoFilter}`, "-map", "[v]", "-map", "[a]", "-t", "30", "-r", "24", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", finalPath]);
  const qa = await probeFinalVideo(finalPath, { width: config.width, height: config.height, duration: 30 });
  if (!qa.passed) throw new Error(`Final technical QA failed: ${JSON.stringify(qa)}`);
  return { bytes: new Uint8Array(await readFile(finalPath)), qa };
}
