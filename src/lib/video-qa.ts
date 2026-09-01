import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const exec = promisify(execFile);

export type TechnicalQa = { duration: number; width: number; height: number; fps: number; videoCodec: string; pixelFormat: string; audioCodec: string; audioSampleRate: number; passed: boolean };

export async function probeFinalVideo(path: string, expected: { width: number; height: number; duration: number }): Promise<TechnicalQa> {
  const executable = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  const { stderr } = await exec(executable, ["-hide_banner", "-i", path, "-f", "null", "-"], { maxBuffer: 4_000_000 });
  const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const videoLine = stderr.split("\n").find((line) => /Video:\s*h264\b/.test(line)) ?? "";
  const audioLine = stderr.split("\n").find((line) => /Audio:\s*aac\b/.test(line)) ?? "";
  const sizeMatch = videoLine.match(/\b(\d{2,5})x(\d{2,5})\b/);
  const fpsMatch = videoLine.match(/([\d.]+)\s*fps\b/);
  const duration = durationMatch ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]) : 0;
  const qa = { duration, width: Number(sizeMatch?.[1] ?? 0), height: Number(sizeMatch?.[2] ?? 0), fps: Number(fpsMatch?.[1] ?? 0), videoCodec: videoLine ? "h264" : "", pixelFormat: videoLine.match(/\b(yuv\w+)\b/)?.[1] ?? "", audioCodec: audioLine ? "aac" : "", audioSampleRate: Number(audioLine.match(/(\d+)\s*Hz\b/)?.[1] ?? 0), passed: false };
  qa.passed = Math.abs(qa.duration - expected.duration) < 0.35 && qa.width === expected.width && qa.height === expected.height && Math.abs(qa.fps - 24) < 0.1 && qa.videoCodec === "h264" && qa.pixelFormat === "yuv420p" && qa.audioCodec === "aac" && qa.audioSampleRate === 48000;
  return qa;
}
