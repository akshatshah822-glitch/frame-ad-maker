import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { chromium } from "playwright";
import OpenAI from "openai";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const exec = promisify(execFile);
const ROOT = process.cwd();
const OUT = `${ROOT}/artifacts/frame-launch`;
const TMP = `${OUT}/work`;
const BASE = "https://frame-ad-maker.vercel.app";
const TREATMENT_ID = "j578ghnpfa9dwjdtypjks1f6tx8dd3n5";
const CONVEX_URL = "https://valiant-cod-559.convex.cloud";
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const FFPROBE = "/opt/homebrew/bin/ffprobe";
const selectedShots = [1, 4, 6];

function envFile(text) {
  return Object.fromEntries(text.split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }));
}

async function run(binary, args, options = {}) {
  return exec(binary, args, { maxBuffer: 20_000_000, timeout: 300_000, ...options });
}

async function download(url, path) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}

function studioHtml(body, extra = "") {
  return `<!doctype html><html><head><style>
  *{box-sizing:border-box}html,body{margin:0;width:720px;height:1280px;overflow:hidden;background:#f4f0e7;color:#101b36;font-family:Arial,sans-serif}body{padding:58px} .mark{font:900 24px Arial;letter-spacing:-1px}.mark i{font-style:normal;color:#ff6b4a} .eyebrow{color:#ff6b4a;font-size:12px;font-weight:900;letter-spacing:2.5px;text-transform:uppercase}.rule{height:1px;background:#101b36;margin:28px 0}.big{font-family:'Arial Narrow',Arial,sans-serif;font-size:78px;line-height:.92;letter-spacing:-5px;text-transform:uppercase}.blue{color:#264eb5}.panel{border:1px solid #101b36;background:#fff;padding:28px;box-shadow:8px 8px 0 #264eb5}.coral{background:#ff6b4a}.muted{color:#687086}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:70px} ${extra}</style></head><body><div class="top"><div class="mark">FRAME<i>///</i></div><small>AI CREATIVE DIRECTOR</small></div>${body}</body></html>`;
}

async function screenshotHtml(page, name, body, extra = "") {
  await page.setContent(studioHtml(body, extra), { waitUntil: "load" });
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: `${TMP}/${name}.png` });
  return `${TMP}/${name}.png`;
}

async function stillVideo(image, output, duration, zoom = 1) {
  const frames = Math.round(duration * 24);
  const vf = zoom === 1 ? "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=24,format=yuv420p" : `scale=1440:2560,zoompan=z='min(zoom+0.0005,${zoom})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=720x1280:fps=24,format=yuv420p`;
  await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-i", image, "-t", String(duration), "-vf", vf, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", output]);
}

async function clipVideo(input, output, start, duration) {
  await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(start), "-i", input, "-t", String(duration), "-vf", "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=24,eq=contrast=1.03:saturation=.96,format=yuv420p", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", output]);
}

async function main() {
  const productionStartedAt = Date.now();
  await mkdir(TMP, { recursive: true });
  const localEnv = envFile(await readFile(`${ROOT}/.env.local`, "utf8"));
  const openaiKey = process.env.OPENAI_API_KEY || localEnv.OPENAI_API_KEY;

  const productionResponse = await fetch(`${BASE}/api/video/status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ generationId: TREATMENT_ID }) });
  const { production } = await productionResponse.json();
  if (production?.status !== "ready") throw new Error("The source production is not ready");
  const selected = production.clips.filter((clip) => selectedShots.includes(clip.shotNumber));
  if (selected.length !== 3 || selected.some((clip) => !clip.videoUrl)) throw new Error("Three durable source clips are required");
  for (const clip of selected) await download(clip.videoUrl, `${TMP}/source-${clip.shotNumber}.mp4`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByLabel("What are we advertising?").fill("Premium jewellery for women who don't want what everyone else has.");
  await page.getByLabel("Who specifically needs to care?").fill("Women choosing jewellery as a mark of personal taste.");
  await page.getByLabel("What one thing should they remember?").fill("Distinctive jewellery should feel unmistakably yours.");
  await page.getByRole("button", { name: "Instagram / Reels" }).click();
  await page.getByRole("button", { name: "Cinematic" }).click();
  await page.locator(".brief-section").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${TMP}/brief.png` });

  await page.goto(`${BASE}/treatment/${TREATMENT_ID}`, { waitUntil: "networkidle" });
  for (const image of await page.locator(".shot-frame img").all()) await image.scrollIntoViewIfNeeded();
  const keyframes = await page.locator(".shot-frame img").evaluateAll((images) => images.map((image) => image.currentSrc || image.src));
  if (keyframes.length !== 6) throw new Error("Six storyboard keyframes were not found");
  await page.locator(".final-ad").scrollIntoViewIfNeeded();
  await page.locator(".final-ad video").evaluate(async (video) => {
    video.currentTime = 1;
    await new Promise((resolve) => video.addEventListener("seeked", resolve, { once: true }));
  });
  await page.screenshot({ path: `${TMP}/ready.png` });

  const opening = [];
  const requirements = ["SCRIPT", "DIRECTOR", "CAST", "LOCATION", "CAMERA", "EDIT", "MUSIC"];
  for (let i = 0; i < requirements.length; i++) opening.push(await screenshotHtml(page, `open-${i}`, `<p class="eyebrow">TRADITIONAL PRODUCTION</p><div class="rule"></div><div class="req">${requirements.slice(0, i + 1).map((item) => `<strong>${item}</strong>`).join("")}</div>`, `.req{display:grid;gap:18px}.req strong{font:900 64px/1 'Arial Narrow',Arial;color:${i > 4 ? "#ff6b4a" : "#101b36"};letter-spacing:-3px}`));
  const simple = await screenshotHtml(page, "open-simple", `<div style="height:310px"></div><p class="eyebrow">OR</p><h1 class="big">START WITH<br>A <span class="blue">BRIEF.</span></h1>`);
  const concept = await screenshotHtml(page, "concepts", `<p class="eyebrow">THREE CREATIVE TERRITORIES</p><h1 class="big">FRAME FINDS<br>THE IDEA.</h1><div class="territories"><section><b>01</b><strong>HUMAN / EMOTIONAL</strong></section><section class="selected"><b>02</b><strong>PRODUCT / CRAFT</strong></section><section><b>03</b><strong>UNEXPECTED</strong></section></div>`, `.territories{display:grid;gap:14px;margin-top:70px}.territories section{display:flex;align-items:center;gap:24px;border:1px solid #101b36;padding:24px}.territories b{color:#ff6b4a}.territories strong{font-size:20px}.territories .selected{background:#101b36;color:#fff;box-shadow:7px 7px 0 #ff6b4a}`);
  const storyboardCards = keyframes.map((url, index) => `<figure><img src="${url}"><figcaption><b>0${index + 1}</b><span>${["HOOK","TENSION","PRODUCT","PROOF","PAYOFF","BRAND"][index]}</span></figcaption></figure>`).join("");
  const storyboard = await screenshotHtml(page, "storyboard", `<p class="eyebrow">THE FILM / SIX SHOTS</p><h1 class="big" style="font-size:58px">DIRECTS EVERY SHOT.</h1><div class="boards">${storyboardCards}</div>`, `.boards{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:40px}.boards figure{margin:0;background:#101b36}.boards img{display:block;width:100%;height:300px;object-fit:cover}.boards figcaption{display:flex;justify-content:space-between;padding:12px;color:#fff;font-size:10px;letter-spacing:1.5px}.boards b{color:#ff6b4a}`);
  const end = await screenshotHtml(page, "end", `<div style="height:255px"></div><h1 class="big" style="font-size:120px">FRAME<span style="color:#ff6b4a">///</span></h1><div class="rule"></div><h2 style="font-size:38px;letter-spacing:-1px">BRIEF <span class="blue">→</span> FILM</h2><p style="margin-top:180px;font-size:24px;font-weight:800">Make the ad.</p>`);
  await browser.close();

  const segments = [];
  for (let i = 0; i < opening.length; i++) { const output = `${TMP}/seg-open-${i}.mp4`; await stillVideo(opening[i], output, .3); segments.push(output); }
  const simpleVideo = `${TMP}/seg-simple.mp4`; await stillVideo(simple, simpleVideo, .9); segments.push(simpleVideo);
  const briefVideo = `${TMP}/seg-brief.mp4`; await stillVideo(`${TMP}/brief.png`, briefVideo, 3, 1.06); segments.push(briefVideo);
  const conceptVideo = `${TMP}/seg-concept.mp4`; await stillVideo(concept, conceptVideo, 3, 1.035); segments.push(conceptVideo);
  const boardVideo = `${TMP}/seg-board.mp4`; await stillVideo(storyboard, boardVideo, 4, 1.04); segments.push(boardVideo);
  const staticFrame = `${TMP}/seg-static.mp4`;

  await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-ss", "0.05", "-i", `${TMP}/source-1.mp4`, "-frames:v", "1", `${TMP}/source-1.jpg`]);
  await stillVideo(`${TMP}/source-1.jpg`, staticFrame, .4); segments.push(staticFrame);
  for (const [index, clip] of selected.entries()) { const output = `${TMP}/seg-clip-${clip.shotNumber}.mp4`; await clipVideo(`${TMP}/source-${clip.shotNumber}.mp4`, output, index === 0 ? 0.05 : 0.35, 2.2); segments.push(output); }
  const readyVideo = `${TMP}/seg-ready.mp4`; await stillVideo(`${TMP}/ready.png`, readyVideo, 1.8, 1.025); segments.push(readyVideo);
  const endVideo = `${TMP}/seg-end.mp4`; await stillVideo(end, endVideo, 3); segments.push(endVideo);

  const concat = `${TMP}/concat.txt`;
  await writeFile(concat, segments.map((path) => `file '${path}'`).join("\n"));
  const picture = `${TMP}/picture.mp4`;
  await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", concat, "-c", "copy", picture]);

  const voText = "Start with what you want to say. FRAME finds the idea. Directs every shot. And brings the film to life. From brief to finished ad.";
  if (openaiKey) {
    const speech = await new OpenAI({ apiKey: openaiKey }).audio.speech.create({ model: "tts-1-hd", voice: "onyx", input: voText, response_format: "mp3", speed: .92 });
    await writeFile(`${TMP}/voice.mp3`, Buffer.from(await speech.arrayBuffer()));
  } else {
    await run("/usr/bin/say", ["-v", "Daniel", "-r", "158", "-o", `${TMP}/voice.aiff`, voText]);
    await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", `${TMP}/voice.aiff`, "-c:a", "libmp3lame", "-b:a", "192k", `${TMP}/voice.mp3`]);
  }
  const music = `${TMP}/music.wav`;
  await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=110:duration=25:sample_rate=48000", "-f", "lavfi", "-i", "sine=frequency=220:duration=25:sample_rate=48000", "-f", "lavfi", "-i", "sine=frequency=440:duration=25:sample_rate=48000", "-filter_complex", "[0:a]volume=.18,afade=t=in:st=0:d=2[a0];[1:a]tremolo=f=2:d=.72,volume=.055[a1];[2:a]volume=.022,afade=t=in:st=12:d=3,afade=t=out:st=23:d=2[a2];[a0][a1][a2]amix=inputs=3:normalize=0,highpass=f=70,lowpass=f=5000,alimiter=limit=.7[m]", "-map", "[m]", music]);

  const finalPath = `${OUT}/frame-launch-ad.mp4`;
  const sfx = "aevalsrc='if(between(t,0,.05)+between(t,.3,.35)+between(t,.6,.65)+between(t,.9,.95)+between(t,1.2,1.25)+between(t,1.5,1.55)+between(t,1.8,1.85),0.12*sin(2*PI*1300*t),0)':s=48000:d=25";
  await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", picture, "-i", music, "-i", `${TMP}/voice.mp3`, "-f", "lavfi", "-i", sfx, "-filter_complex", "[1:a]volume=.55[m];[2:a]adelay=3200|3200,volume=1.15[vo];[3:a]volume=.7[s];[m][vo][s]amix=inputs=3:duration=longest:normalize=0,alimiter=limit=.92,afade=t=out:st=24:d=1[a]", "-map", "0:v", "-map", "[a]", "-t", "25", "-r", "24", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", finalPath]);

  const { stdout: probe } = await run(FFPROBE, ["-v", "error", "-show_streams", "-show_format", "-of", "json", finalPath]);
  const metadata = JSON.parse(probe);
  const convex = new ConvexHttpClient(CONVEX_URL);
  const uploadUrl = await convex.mutation(api.generations.generateImageUploadUrl, {});
  const bytes = await readFile(finalPath);
  const upload = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "video/mp4" }, body: bytes });
  if (!upload.ok) throw new Error(`Convex upload failed: ${upload.status}`);
  const { storageId } = await upload.json();
  const durableUrl = await convex.query(api.generations.getImageUrl, { storageId });
  const report = { productionStartedAt: new Date(productionStartedAt).toISOString(), producedAt: new Date().toISOString(), productionSeconds: Math.round((Date.now() - productionStartedAt) / 1000), duration: 25, format: "9:16", selectedPaidClips: selectedShots, newVideoGenerations: 0, videoRetries: 0, reusedRunwayCredits: 360, incrementalRunwayCredits: 0, voiceGenerations: 1, music: "Original deterministic procedural bed", sfx: "Original deterministic UI accents", provider: `Runway Gen-4.5 source clips / ${openaiKey ? "OpenAI tts-1-hd" : "macOS Daniel studio voice"}`, storageId, durableUrl, metadata };
  await writeFile(`${OUT}/production-report.json`, JSON.stringify(report, null, 2));
  await writeFile(`${OUT}/source-manifest.json`, JSON.stringify({ treatmentId: TREATMENT_ID, selectedClips: selected.map(({ shotNumber, duration, videoUrl, finalCredits }) => ({ shotNumber, duration, videoUrl, finalCredits })), storyboardKeyframes: keyframes }, null, 2));
  console.log(JSON.stringify({ finalPath, durableUrl, report: `${OUT}/production-report.json` }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
