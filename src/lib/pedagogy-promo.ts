// Portrait promo scenes (Nov 5 2026), exam-question (pedagogy) path only: visual = clip, poster or kinetic.
// Everything moves: clips play (cut in with a short flash), poster parts punch in and keep pushing in with a shine sweep
// over the moving festive background, and kinetic text drops and slides in over turning light rays and rising sparks.
// Frames are 1080 × 1920 at 24 fps and are handed to `emit` one at a time, so long clips never sit in memory.
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp, { type OverlayOptions } from "sharp";
import { pedagogyLogoDirectory } from "@/lib/pedagogy-look-slide";
import { keyPointRuns } from "@/lib/pedagogy-page";

const run = promisify(execFile);
const W = 1080;
const H = 1920;
const FPS = 24;
const FONT = "'Noto Sans Gujarati', 'Gujarati Sangam MN', 'Gujarati MT', Inter, Arial, sans-serif";
const MAROON = "#6e0d16";
const GOLD = "#f7c548";
const CREAM = "#fff4dc";
const INK = "#2a0a0e";

export type PromoEmit = (png: Buffer, duration: number) => Promise<void>;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeOut = (t: number) => 1 - (1 - clamp(t)) ** 3;
const backOut = (t: number) => { const c = 1.6; const x = clamp(t) - 1; return 1 + (c + 1) * x ** 3 + c * x ** 2; };
const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const ffmpegPath = () => join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");

/** Deterministic sparks rising through the frame (gold dots that twinkle). */
function sparks(t: number, count = 26, seed = 7) {
  let s = "";
  for (let i = 0; i < count; i += 1) {
    const r = (k: number) => { const v = Math.sin((i + 1) * 12.9898 * (k + seed) + seed * 78.233) * 43758.5453; return v - Math.floor(v); };
    const speed = 40 + r(1) * 90, x = r(2) * W + Math.sin(t * (0.6 + r(3)) + i) * 26;
    const y = H - ((r(4) * H + t * speed) % (H + 80)) + 40;
    const size = 2 + r(5) * 5, alpha = 0.25 + 0.6 * Math.abs(Math.sin(t * (1.5 + r(6) * 2) + i));
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size.toFixed(1)}" fill="${GOLD}" fill-opacity="${alpha.toFixed(2)}"/>`;
  }
  return s;
}

/** The festive moving background: deep maroon, slowly turning gold light rays, rising sparks. */
function festive(t: number, cy = 820) {
  const angle = t * 9;
  const ray = (i: number) => { const a = ((i * 30 + angle) * Math.PI) / 180, b = ((i * 30 + 12 + angle) * Math.PI) / 180; return `<polygon points="540,${cy} ${540 + 1700 * Math.cos(a)},${cy + 1700 * Math.sin(a)} ${540 + 1700 * Math.cos(b)},${cy + 1700 * Math.sin(b)}" fill="${GOLD}" fill-opacity="0.07"/>`; };
  return `<defs><radialGradient id="r" cx="50%" cy="${((cy / H) * 100).toFixed(0)}%" r="75%"><stop offset="0" stop-color="#a3182a"/><stop offset="1" stop-color="#36050b"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#r)"/>${Array.from({ length: 12 }, (_, i) => ray(i)).join("")}${sparks(t, 30, 3)}`;
}

const measured = new Map<string, number>();
/** Drawn width of text in this file's own font (rendered between two bars and trimmed), so spaces at the ends count. */
async function textWidth(text: string, size: number, weight: number) {
  const key = `${size}|${weight}|${text}`;
  const known = measured.get(key);
  if (known !== undefined) return known;
  const draw = async (value: string) => (await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(value.length * size * 1.2 + 200)}" height="${size * 2}"><rect width="100%" height="100%" fill="#fff"/><text x="10" y="${size * 1.4}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" xml:space="preserve">${esc(value)}</text></svg>`)).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true })).info.width;
  const width = text ? Math.max(0, (await draw(`|${text}|`)) - (await draw("||"))) : 0;
  measured.set(key, width);
  return width;
}

/** Text that fits a width: the measured width at `size`, scaled down when wider than `max`. */
async function fit(text: string, size: number, weight: number, max: number) {
  const width = await textWidth(text, size, weight);
  return width > max ? { size: Math.floor((size * max) / width), width: max } : { size, width };
}

/** The caption at the bottom: a cream card sliding up, its *starred* words getting a gold marker that sweeps in. */
async function captionSvg(caption: string, t: number) {
  const plain = caption.replaceAll("*", "").trim();
  if (!plain) return "";
  const { size } = await fit(plain, 66, 800, W - 180);
  const runs = keyPointRuns(caption);
  const show = easeOut(t / 0.35), sweep = clamp((t - 0.3) / 0.5);
  const total = await textWidth(plain, size, 800);
  const cardW = total + 100, cardH = size * 1.9, cardX = (W - cardW) / 2, cardY = H - 330 + (1 - show) * 120;
  const x0 = (W - total) / 2, baseline = cardY + cardH / 2 + size * 0.36;
  // One text line (spaces drawn by the font itself); each starred run's marker starts at the measured width of what precedes it.
  let marks = "", spans = "", before = "";
  for (const run of runs) {
    if (run.mark) {
      const left = x0 + (await textWidth(before, size, 800)), width = await textWidth(run.text, size, 800);
      marks += `<rect x="${(left - 8).toFixed(1)}" y="${(baseline - size * 0.9).toFixed(1)}" width="${((width + 16) * sweep).toFixed(1)}" height="${(size * 1.15).toFixed(1)}" rx="10" fill="${GOLD}"/>`;
    }
    spans += `<tspan fill="${run.mark ? INK : MAROON}">${esc(run.text)}</tspan>`;
    before += run.text;
  }
  spans = `<text x="${x0.toFixed(1)}" y="${baseline.toFixed(1)}" font-family="${FONT}" font-size="${size}" font-weight="800" xml:space="preserve">${spans}</text>`;
  return `<g opacity="${show.toFixed(3)}"><rect x="${(cardX + 6).toFixed(1)}" y="${(cardY + 12).toFixed(1)}" width="${cardW.toFixed(1)}" height="${cardH.toFixed(1)}" rx="${(cardH / 2).toFixed(1)}" fill="#000" fill-opacity="0.35"/><rect x="${cardX.toFixed(1)}" y="${cardY.toFixed(1)}" width="${cardW.toFixed(1)}" height="${cardH.toFixed(1)}" rx="${(cardH / 2).toFixed(1)}" fill="${CREAM}" stroke="${GOLD}" stroke-width="5"/>${marks}${spans}</g>`;
}

const svg = (body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${body}</svg>`);

/** A real clip: the span is cut from the file at 24 fps. Portrait sources fill the frame; wider sources sit on a blurred fill
 * of themselves. The cut opens with a short white flash; the caption slides up. If the span is shorter than the row, the
 * last frame holds (logged), so the narration never runs over a black frame. */
export async function createClipFrames(visual: { file: string; start: number; end: number; caption: string }, allocatedDuration: number, emit: PromoEmit) {
  const source = join(pedagogyLogoDirectory(), visual.file);
  const directory = await mkdtemp(join(tmpdir(), "frame-clip-"));
  try {
    const probe = await run(ffmpegPath(), ["-hide_banner", "-i", source], { maxBuffer: 1 << 20 }).catch((error: { stderr?: string }) => ({ stdout: "", stderr: error.stderr ?? "" }));
    const size = /, (\d{2,5})x(\d{2,5})[, ]/.exec(probe.stderr);
    const wide = size ? Number(size[1]) / Number(size[2]) > 0.7 : false;
    const length = Math.min(visual.end - visual.start, allocatedDuration);
    const filter = wide
      ? `[0:v]split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=30:2,eq=brightness=-0.12[bg];[b]scale=${W}:-2[fg];[bg][fg]overlay=0:(H-h)/2,fps=${FPS}`
      : `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS}`;
    await run(ffmpegPath(), ["-v", "error", "-ss", String(visual.start), "-t", length.toFixed(3), "-i", source, "-filter_complex", filter, "-an", join(directory, "f%05d.png")], { maxBuffer: 1 << 24 });
    const files = (await readdir(directory)).filter((name) => name.endsWith(".png")).sort();
    if (!files.length) throw new Error(`clip ${visual.file} gave no frames for ${visual.start}-${visual.end}`);
    const needed = Math.max(1, Math.round(allocatedDuration * FPS));
    console.info("Pedagogy clip", { file: visual.file, layout: wide ? "wide-on-blur" : "portrait-fill", frames: files.length, needed, path: files.length < needed ? "last-frame-held" : "clip-plays" });
    for (let index = 0; index < needed; index += 1) {
      const t = index / FPS;
      const frame = await readFile(join(directory, files[Math.min(index, files.length - 1)]));
      const flash = index < 4 ? `<rect width="${W}" height="${H}" fill="#fff" fill-opacity="${(0.7 - index * 0.18).toFixed(2)}"/>` : "";
      const layers: OverlayOptions[] = [{ input: svg(`<rect y="${H - 520}" width="${W}" height="520" fill="url(#g)"/><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></linearGradient></defs>${await captionSvg(visual.caption, t)}${flash}`), left: 0, top: 0 }];
      await emit(await sharp(frame).composite(layers).png().toBuffer(), 1 / FPS);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

type Poster = { full: Buffer; width: number; height: number };
const posters = new Map<string, Poster>();
async function loadPoster(file: string) {
  const known = posters.get(file);
  if (known) return known;
  const data = await readFile(join(pedagogyLogoDirectory(), file));
  const full = await sharp(data).rotate().flatten({ background: "#ffffff" }).png().toBuffer();
  const { width = 1, height = 1 } = await sharp(full).metadata();
  const poster = { full, width, height };
  posters.set(file, poster);
  return poster;
}

/** A part of the poster: it punches in (overshoot, then settles), keeps pushing in slowly and floats, and a gold shine
 * sweeps across it once; the blurred poster drifts behind with rising sparks; the caption slides up. */
export async function createPosterFrames(visual: { file: string; box: [number, number, number, number]; caption: string }, allocatedDuration: number, emit: PromoEmit) {
  const poster = await loadPoster(visual.file);
  const [x0, y0, x1, y1] = visual.box;
  const region = { left: Math.round(x0 * poster.width), top: Math.round(y0 * poster.height), width: Math.max(2, Math.round((x1 - x0) * poster.width)), height: Math.max(2, Math.round((y1 - y0) * poster.height)) };
  const crop = await sharp(poster.full).extract(region).png().toBuffer();
  const fitScale = Math.min(1010 / region.width, 1150 / region.height);
  const baseW = region.width * fitScale, baseH = region.height * fitScale;
  const frames = Math.max(1, Math.round(allocatedDuration * FPS));
  for (let index = 0; index < frames; index += 1) {
    const t = index / FPS, u = frames === 1 ? 1 : index / (frames - 1);
    const pop = backOut(t / 0.45), push = 1 + 0.07 * easeOut(u);
    const scale = (0.55 + 0.45 * pop) * push;
    const w = Math.max(4, Math.round(baseW * scale)), h = Math.max(4, Math.round(baseH * scale));
    const left = Math.round((W - w) / 2), top = Math.round(820 - h / 2 + Math.sin(t * 1.6) * 8);
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="26" fill="#fff"/></svg>`);
    // Shine: a soft diagonal band crossing the card between 0.5 s and 1.2 s.
    const s = clamp((t - 0.5) / 0.7), sx = -0.4 * w + s * 1.8 * w;
    const shine = s > 0 && s < 1 ? `<polygon points="${sx},0 ${sx + w * 0.18},0 ${sx - w * 0.12},${h} ${sx - w * 0.3},${h}" fill="#fff" fill-opacity="0.45"/>` : "";
    const card = await sharp(crop).resize(w, h, { fit: "fill" }).composite([...(shine ? [{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${shine}</svg>`), left: 0, top: 0 }] : []), { input: mask, blend: "dest-in" as const }]).png().toBuffer();
    const glow = `<rect x="${left - 10}" y="${top - 10}" width="${w + 20}" height="${h + 20}" rx="34" fill="none" stroke="${GOLD}" stroke-width="6" stroke-opacity="${(0.9 * clamp(pop)).toFixed(2)}"/>`;
    const shadow = `<rect x="${left + 10}" y="${top + 26}" width="${w}" height="${h}" rx="26" fill="#000" fill-opacity="${(0.5 * clamp(pop)).toFixed(2)}" filter="url(#b)"/><defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="22"/></filter></defs>`;
    const under = svg(`${festive(t)}${shadow}`);
    const over = svg(`${glow}${await captionSvg(visual.caption, t)}`);
    // The card may grow past the frame edge while punching in: keep only its visible part.
    const vx = Math.max(0, -left), vy = Math.max(0, -top), vw = Math.min(w - vx, W - Math.max(0, left)), vh = Math.min(h - vy, H - Math.max(0, top));
    const visible = vw < w || vh < h ? await sharp(card).extract({ left: vx, top: vy, width: Math.max(1, vw), height: Math.max(1, vh) }).png().toBuffer() : card;
    const png = await sharp(under).composite([{ input: visible, left: Math.max(0, left), top: Math.max(0, top) }, { input: over, left: 0, top: 0 }]).png().toBuffer();
    await emit(png, 1 / FPS);
  }
}

/** Kinetic text: the title drops in with a bounce, then each line slides in from the right, one after another, over a maroon
 * background with slowly turning light rays and rising sparks. "a > b" lines are a gold pill (a) and a label (b). */
export async function createKineticFrames(visual: { title: string; lines: string[] }, allocatedDuration: number, emit: PromoEmit) {
  const title = visual.title.replaceAll("*", "");
  const titleFit = await fit(title, visual.lines.length ? 112 : 140, 800, W - 120);
  const lines = await Promise.all(visual.lines.map(async (line) => {
    const [pill, label] = line.includes(">") ? line.split(">").map((part) => part.trim()) : ["", line.trim()];
    const pillFit = pill ? await fit(pill, 56, 800, 380) : { size: 0, width: 0 };
    const labelFit = await fit(label, 64, 800, pill ? W - 190 - pillFit.width - 90 : W - 190);
    return { pill, label, pillFit, labelFit };
  }));
  const step = Math.min(176, 1000 / Math.max(1, lines.length));
  // The title and the lines are centred as one block around the middle of the frame.
  const titleY = lines.length ? Math.round(900 - (150 + (lines.length - 1) * step) / 2) : 960;
  const frames = Math.max(1, Math.round(allocatedDuration * FPS));
  for (let index = 0; index < frames; index += 1) {
    const t = index / FPS;
    const drop = backOut(t / 0.5);
    let body = festive(t, 900);
    body += `<g transform="translate(540 ${(titleY - (1 - drop) * 260).toFixed(1)}) scale(${(0.7 + 0.3 * drop).toFixed(3)})" opacity="${clamp(t / 0.25).toFixed(3)}"><text x="0" y="0" text-anchor="middle" font-family="${FONT}" font-size="${titleFit.size}" font-weight="800" fill="${GOLD}" stroke="${INK}" stroke-width="3" paint-order="stroke">${esc(title)}</text></g>`;
    if (lines.length) body += `<rect x="${540 - 140 * easeOut((t - 0.3) / 0.4)}" y="${titleY + 50}" width="${280 * easeOut((t - 0.3) / 0.4)}" height="8" rx="4" fill="${GOLD}"/>`;
    for (const [i, line] of lines.entries()) {
      // Lines arrive spread over the first 80% of the row, so they keep pace with the narration reading them.
      const gap = Math.min(2.4, Math.max(0.3, (allocatedDuration * 0.8 - 0.45) / Math.max(1, lines.length)));
      const start = 0.45 + i * gap, k = backOut((t - start) / 0.4);
      if (t < start) continue;
      const y = titleY + 150 + i * step, dx = (1 - k) * 700;
      const rowW = (line.pill ? line.pillFit.width + 70 + 30 : 0) + line.labelFit.width + 80;
      const x = (W - rowW) / 2 + dx;
      let g = `<rect x="${x}" y="${y - 74}" width="${rowW}" height="120" rx="60" fill="${CREAM}" fill-opacity="0.97" stroke="${GOLD}" stroke-width="5"/>`;
      let cx = x + 40;
      if (line.pill) {
        g += `<rect x="${cx - 16}" y="${y - 60}" width="${line.pillFit.width + 60}" height="92" rx="46" fill="${MAROON}"/><text x="${cx + 14}" y="${y + 3}" font-family="${FONT}" font-size="${line.pillFit.size}" font-weight="800" fill="#fff">${esc(line.pill)}</text>`;
        cx += line.pillFit.width + 70 + 20;
      }
      g += `<text x="${cx}" y="${y + 6}" font-family="${FONT}" font-size="${line.labelFit.size}" font-weight="800" fill="${MAROON}">${esc(line.label)}</text>`;
      body += `<g opacity="${clamp((t - start) / 0.2).toFixed(3)}">${g}</g>`;
    }
    await emit(await sharp(svg(body)).png().toBuffer(), 1 / FPS);
  }
}
