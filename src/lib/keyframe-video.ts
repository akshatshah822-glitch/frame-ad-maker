import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function createLockedKeyframeClip({ imageUrl, duration, width, height }: { imageUrl: string; duration: number; width: number; height: number }) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("The approved frame could not be loaded.");
  const directory = await mkdtemp(join(tmpdir(), "frame-keyframe-"));
  const imagePath = join(directory, "approved-frame.png");
  const outputPath = join(directory, "locked-shot.mp4");
  await writeFile(imagePath, Buffer.from(await response.arrayBuffer()));
  const ffmpeg = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  await exec(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-i", imagePath,
    "-t", String(duration), "-vf", `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=24,format=yuv420p`,
    "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-movflags", "+faststart", outputPath,
  ], { maxBuffer: 2_000_000, timeout: 120_000 });
  return new Uint8Array(await readFile(outputPath));
}
