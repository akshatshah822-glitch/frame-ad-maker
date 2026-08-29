import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";

const exec = promisify(execFile);
const path = process.argv[2] || "artifacts/frame-launch/frame-launch-ad.mp4";
const url = process.argv[3];
const { stdout } = await exec("/opt/homebrew/bin/ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path]);
const data = JSON.parse(stdout);
const video = data.streams.find((stream) => stream.codec_type === "video");
const audio = data.streams.find((stream) => stream.codec_type === "audio");
const checks = {
  duration: Math.abs(Number(data.format.duration) - 25) < .1,
  orientation: video?.width === 720 && video?.height === 1280,
  fps: video?.avg_frame_rate === "24/1",
  video: video?.codec_name === "h264" && video?.pix_fmt === "yuv420p",
  audio: audio?.codec_name === "aac" && Number(audio?.sample_rate) === 48000,
};
if (url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent("<video></video>");
  checks.browserPlayback = await page.locator("video").evaluate(async (element, source) => {
    element.src = source; element.load();
    await new Promise((resolve, reject) => { if (element.readyState >= 1) resolve(); else { element.onloadedmetadata = resolve; element.onerror = reject; } });
    return element.duration === 25 && element.videoWidth === 720 && element.videoHeight === 1280;
  }, url);
  await browser.close();
}
console.log(JSON.stringify(checks, null, 2));
if (Object.values(checks).some((passed) => !passed)) process.exit(1);
