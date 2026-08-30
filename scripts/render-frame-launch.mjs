import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const exec = promisify(execFile);
const root = process.cwd();
const assets = join(root, "artifacts", "frame-launch", "source");
const work = join(root, ".frame-render");
const width = 1080;
const height = 1920;
const ffmpeg = "ffmpeg";
await mkdir(work, { recursive: true });

async function run(args) {
  await exec(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 8_000_000, timeout: 300_000 });
}

function cardSvg({ eyebrow = "", headline, body = "", footer = "FRAME///", dark = false }) {
  const background = dark ? "#101b36" : "#f5f7f8";
  const foreground = dark ? "#f5f7f8" : "#101b36";
  const bodyLines = body.split("\n").map((line, index) => `<text x="96" y="${1090 + index * 74}" fill="${foreground}" font-family="Arial" font-size="48" font-weight="700">${line}</text>`).join("");
  const headlineLines = headline.split("\n").map((line, index) => `<text x="96" y="${620 + index * 142}" fill="${foreground}" font-family="Arial" font-size="118" font-weight="900" letter-spacing="-6">${line}</text>`).join("");
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${background}"/><rect x="96" y="270" width="888" height="4" fill="#ff5c46"/><text x="96" y="220" fill="#ff5c46" font-family="Arial" font-size="25" font-weight="800" letter-spacing="6">${eyebrow}</text>${headlineLines}${bodyLines}<text x="96" y="1780" fill="${foreground}" font-family="Arial" font-size="34" font-weight="900">${footer.replace("///", "")}<tspan fill="#ff5c46">///</tspan></text></svg>`;
}

async function card(name, spec) {
  const path = join(work, `${name}.png`);
  await sharp(Buffer.from(cardSvg(spec))).png().toFile(path);
  return path;
}

async function fitImage(source, name, background = "#f5f7f8") {
  const path = join(work, `${name}.png`);
  await sharp({ create: { width, height, channels: 4, background } }).composite([{ input: await sharp(source).resize({ width: 1000, height: 1690, fit: "contain", background }).png().toBuffer(), gravity: "center" }]).png().toFile(path);
  return path;
}

async function stillSegment(source, seconds, name) {
  const output = join(work, `${name}.mp4`);
  await run(["-loop", "1", "-i", source, "-t", String(seconds), "-vf", `scale=${width}:${height},fps=24,format=yuv420p`, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", output]);
  return output;
}

async function clipSegment(source, seconds, name, overlay) {
  const output = join(work, `${name}.mp4`);
  if (overlay) await run(["-stream_loop", "-1", "-i", source, "-loop", "1", "-i", overlay, "-t", String(seconds), "-filter_complex", `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=24,format=yuv420p[base];[base][1:v]overlay=0:0:format=auto[v]`, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", output]);
  else await run(["-stream_loop", "-1", "-i", source, "-t", String(seconds), "-vf", `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=24,format=yuv420p`, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", output]);
  return output;
}

const deadline = await card("deadline", { eyebrow: "MONDAY / 09:00", headline: "LAUNCH\nMONDAY.", body: "The campaign is ready." });
const deadlineMiss = await card("deadline-miss", { eyebrow: "TODAY / 18:42", headline: "STILL\nNO AD.", body: "And the clock is moving.", dark: true });
const production = await card("production", { eyebrow: "THE USUAL PRODUCTION", headline: "SCRIPT. CAST.\nCREW. LOCATION.\nSHOOT. EDIT.\nAPPROVALS.", dark: true });
const concepts = await card("concepts", { eyebrow: "FRAME DEVELOPS THE IDEA", headline: "THREE\nCREATIVE\nDIRECTIONS.", body: "HUMAN / EMOTIONAL\nPRODUCT / CRAFT\nUNEXPECTED / CONCEPTUAL" });
const proofOverlay = join(work, "proof-overlay.png");
await sharp(Buffer.from(`<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><rect x="70" y="1375" width="940" height="360" fill="#101b36" fill-opacity=".94" stroke="#ff5c46" stroke-width="4"/><text x="120" y="1490" fill="#ff5c46" font-family="Arial" font-size="28" font-weight="800" letter-spacing="5">FROM BRIEF TO FINISHED AD</text><text x="120" y="1605" fill="#f5f7f8" font-family="Arial" font-size="76" font-weight="900">ONE BRIEF.</text><text x="120" y="1695" fill="#f5f7f8" font-family="Arial" font-size="52" font-weight="800">THIRTY SECONDS. NO CREW.</text></svg>`)).png().toFile(proofOverlay);
const endOverlay = join(work, "end-overlay.png");
await sharp(Buffer.from(`<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><rect width="1080" height="1920" fill="#101b36" fill-opacity=".78"/><rect x="96" y="405" width="888" height="4" fill="#ff5c46"/><text x="96" y="355" fill="#ff5c46" font-family="Arial" font-size="30" font-weight="900" letter-spacing="7">FRAME</text><text x="96" y="720" fill="#f5f7f8" font-family="Arial" font-size="118" font-weight="900" letter-spacing="-6">YOUR BRIEF</text><text x="96" y="860" fill="#f5f7f8" font-family="Arial" font-size="118" font-weight="900" letter-spacing="-6">BECOMES</text><text x="96" y="1000" fill="#f5f7f8" font-family="Arial" font-size="118" font-weight="900" letter-spacing="-6">THE AD.</text><text x="96" y="1350" fill="#f5f7f8" font-family="Arial" font-size="48" font-weight="800">One brief. Thirty seconds. No crew.</text><text x="96" y="1540" fill="#f5f7f8" font-family="Arial" font-size="43" font-weight="800">frame-ad-maker.vercel.app</text></svg>`)).png().toFile(endOverlay);
const brief = await fitImage(join(assets, "frame-brief-card.png"), "brief-ui");
const storyboard = join(work, "storyboard-board.png");
const storyboardBackground = await sharp(Buffer.from(`<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f5f7f8"/><text x="80" y="150" fill="#ff5c46" font-family="Arial" font-size="24" font-weight="800" letter-spacing="5">FRAME DIRECTS THE FILM</text><text x="80" y="285" fill="#101b36" font-family="Arial" font-size="105" font-weight="900">SIX SHOTS.</text><text x="80" y="365" fill="#101b36" font-family="Arial" font-size="42" font-weight="700">ONE SCOOTER COMMERCIAL.</text><text x="80" y="1015" fill="#101b36" font-family="Arial" font-size="24" font-weight="800">01 HOOK</text><text x="400" y="1015" fill="#101b36" font-family="Arial" font-size="24" font-weight="800">02 TENSION</text><text x="720" y="1015" fill="#101b36" font-family="Arial" font-size="24" font-weight="800">03 PRODUCT</text><text x="80" y="1585" fill="#101b36" font-family="Arial" font-size="24" font-weight="800">04 PROOF</text><text x="400" y="1585" fill="#101b36" font-family="Arial" font-size="24" font-weight="800">05 PAYOFF</text><text x="720" y="1585" fill="#101b36" font-family="Arial" font-size="24" font-weight="800">06 BRAND</text><text x="80" y="1810" fill="#101b36" font-family="Arial" font-size="30" font-weight="900">FRAME<tspan fill="#ff5c46">///</tspan></text></svg>`)).png().toBuffer();
const storyboardSources = ["scooter-shot-1.png", "scooter-shot-2.png", "scooter-shot-3.png", "scooter-shot-4-fast-charge.png", "scooter-shot-5-savings.png", "scooter-shot-6.png"];
const storyboardFrames = await Promise.all(storyboardSources.map(async (source, index) => ({ input: await sharp(join(assets, source)).resize(260, 462, { fit: "cover" }).extend({ top: 4, bottom: 4, left: 4, right: 4, background: "#101b36" }).png().toBuffer(), left: 80 + (index % 3) * 320, top: 480 + Math.floor(index / 3) * 570 })));
await sharp(storyboardBackground).composite(storyboardFrames).png().toFile(storyboard);

const segments = [
  await stillSegment(deadline, 1, "01-deadline"),
  await stillSegment(deadlineMiss, 1, "01b-deadline-miss"),
  await stillSegment(production, 4, "02-production"),
  await stillSegment(brief, 6, "03-brief"),
  await stillSegment(concepts, 3, "04-concepts"),
  await stillSegment(storyboard, 3, "05-storyboard"),
  await clipSegment(join(assets, "mobility-clip.mp4"), 6.5, "06-mobility"),
  await clipSegment(join(assets, "mobility-clip.mp4"), 2.5, "07-proof", proofOverlay),
  await clipSegment(join(assets, "mobility-clip.mp4"), 3, "08-end", endOverlay),
];

const concatPath = join(work, "concat.txt");
await writeFile(concatPath, segments.map((segment) => `file '${segment.replaceAll("'", "'\\''")}'`).join("\n"));
const silent = join(work, "silent.mp4");
await run(["-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", silent]);

const voiceFiles = [1, 2, 3, 4, 5, 6].map((number) => join(assets, `vo-${number}.aiff`));
const delays = [200, 2250, 7200, 13500, 24200, 27600];
const voiceInputs = voiceFiles.flatMap((path) => ["-i", path]);
const voiceFilters = delays.map((delay, index) => `[${index + 1}:a]adelay=${delay}|${delay},aresample=48000,volume=1[vo${index}]`).join(";");
const voiceLabels = delays.map((_, index) => `[vo${index}]`).join("");
const output = join(root, "public", "frame-launch-ad.mp4");
await run(["-i", silent, ...voiceInputs, "-f", "lavfi", "-t", "30", "-i", "sine=frequency=55:sample_rate=48000", "-f", "lavfi", "-t", "30", "-i", "sine=frequency=220:sample_rate=48000", "-filter_complex", `${voiceFilters};[7:a]volume=.035,tremolo=f=2:d=.8[low];[8:a]volume=.009,tremolo=f=4:d=.9[high];[low][high]amix=inputs=2:normalize=0[music];[music]${voiceLabels}amix=inputs=7:duration=longest:normalize=0,alimiter=limit=.92[a]`, "-map", "0:v", "-map", "[a]", "-t", "30", "-c:v", "libx264", "-preset", "slow", "-crf", "34", "-maxrate", "800k", "-bufsize", "1600k", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-ar", "48000", "-movflags", "+faststart", output]);
console.log(output);
