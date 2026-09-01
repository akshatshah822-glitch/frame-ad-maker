import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { path as ffprobePath } from "ffprobe-static";

const exec = promisify(execFile);

export type TechnicalQa = { duration: number; width: number; height: number; fps: number; videoCodec: string; pixelFormat: string; audioCodec: string; audioSampleRate: number; passed: boolean };

export async function probeFinalVideo(path: string, expected: { width: number; height: number; duration: number }): Promise<TechnicalQa> {
  const { stdout } = await exec(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], { maxBuffer: 2_000_000 });
  const result = JSON.parse(stdout) as { streams: Array<Record<string, string | number>>; format: Record<string, string> };
  const video = result.streams.find((stream) => stream.codec_type === "video") ?? {};
  const audio = result.streams.find((stream) => stream.codec_type === "audio") ?? {};
  const [num, den] = String(video.avg_frame_rate ?? "0/1").split("/").map(Number);
  const qa = { duration: Number(result.format.duration), width: Number(video.width), height: Number(video.height), fps: den ? num / den : 0, videoCodec: String(video.codec_name ?? ""), pixelFormat: String(video.pix_fmt ?? ""), audioCodec: String(audio.codec_name ?? ""), audioSampleRate: Number(audio.sample_rate), passed: false };
  qa.passed = Math.abs(qa.duration - expected.duration) < 0.35 && qa.width === expected.width && qa.height === expected.height && Math.abs(qa.fps - 24) < 0.1 && qa.videoCodec === "h264" && qa.pixelFormat === "yuv420p" && qa.audioCodec === "aac" && qa.audioSampleRate === 48000;
  return qa;
}
