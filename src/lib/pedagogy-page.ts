// Flipbook page slides (visual = page), exam-question (pedagogy) path only.
// A whole booklet page sits on a blurred, darkened copy of itself. The camera frames the part being read (the row's
// box): rows on the same page glide from the previous box to the new one; a new page slides in from the right while the
// old one slides out. One caption sits at the bottom (labels in Gujarati when the caption is Gujarati). While a row holds,
// the camera drifts in slowly, the caption's highlight sweeps in, and a thin bar at the top shows how far the video is. Every frame is composed with sharp from the page itself.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { pedagogyLogoDirectory } from "@/lib/pedagogy-look-slide";

export type PageBox = [number, number, number, number];
export type PagePicture = { full: Buffer; blurred: Buffer; width: number; height: number };
export type PageState = { file: string; box: PageBox; caption: string };

const WIDTH = 1920;
const HEIGHT = 1080;
/** Space kept clear at the bottom for the caption band, and the margin around the framed part. */
const CAPTION_BAND = 190;
const MARGIN = 40;
/** Padding (screen pixels) shown around the framed part of the page. */
const PAD = 22;
const FPS = 12;
const TRANSITION_SECONDS = 1.2;
const FONT = "Inter, 'Noto Sans Gujarati', 'Gujarati Sangam MN', 'Noto Sans', Arial, sans-serif";
/** Hold frames per second (the slow drift), how far in the drift starts (fraction of the full fit), and the highlight sweep. */
const HOLD_FPS = 6;
const DRIFT = 0.965;
const SWEEP_SECONDS = 0.6;
const GUJARATI = /[\u0A80-\u0AFF]/;
/** A label in Gujarati when the text it sits with is Gujarati. */
const label = (text: string, english: string, gujarati: string) => (GUJARATI.test(text) ? gujarati : english);
/** Where a row sits in the whole video (0–1), for the progress bar. */
export type PageProgress = { from: number; to: number };
export type PageFrameOptions = { zoom?: number; sweep?: number; progress?: number };
const WHOLE: PageBox = [0, 0, 1, 1];

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const escapeXml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Loads each page once: the page itself (kept sharp, at most 2600 px tall) and its blurred, darkened background. */
export async function loadPagePictures(files: Iterable<string>, directory = pedagogyLogoDirectory()) {
  const pages = new Map<string, PagePicture | null>();
  for (const file of new Set(files)) {
    const data = await readFile(join(directory, file)).catch(() => null);
    if (!data) { pages.set(file, null); continue; }
    const full = await sharp(data).rotate().resize({ height: 2600, withoutEnlargement: true }).flatten({ background: "#ffffff" }).png().toBuffer();
    const { width = 1, height = 1 } = await sharp(full).metadata();
    const blurred = await sharp(full).resize(WIDTH, HEIGHT, { fit: "cover" }).blur(38).modulate({ brightness: 0.42, saturation: 0.8 }).png().toBuffer();
    pages.set(file, { full, blurred, width, height });
  }
  return pages;
}

/** Where the page sits for a box: the scale and top-left that fit the box inside the view above the caption band. */
export function pageCamera(page: { width: number; height: number }, box: PageBox, zoom = 1) {
  const viewW = WIDTH - 2 * MARGIN;
  const viewH = HEIGHT - CAPTION_BAND - 2 * MARGIN;
  const boxW = (box[2] - box[0]) * page.width;
  const boxH = (box[3] - box[1]) * page.height;
  const scale = Math.min(viewW / boxW, viewH / boxH) * zoom;
  const centerX = ((box[0] + box[2]) / 2) * page.width;
  const centerY = ((box[1] + box[3]) / 2) * page.height;
  return { scale, x: WIDTH / 2 - centerX * scale, y: MARGIN + viewH / 2 - centerY * scale };
}

const mixBox = (a: PageBox, b: PageBox, t: number): PageBox => [0, 1, 2, 3].map((i) => a[i] + (b[i] - a[i]) * t) as PageBox;

/** The framed part of the page (the box, plus a little padding), drawn at a camera as a rounded card with a shadow.
 * Only the box is shown, so no line of the page is ever cut half-way at the edge of the view. */
async function pageLayer(page: PagePicture, camera: { scale: number; x: number; y: number }, box: PageBox, shiftX = 0) {
  const pad = PAD / camera.scale;
  const px0 = clamp(box[0] * page.width - pad, 0, page.width), py0 = clamp(box[1] * page.height - pad, 0, page.height);
  const px1 = clamp(box[2] * page.width + pad, 0, page.width), py1 = clamp(box[3] * page.height + pad, 0, page.height);
  const left = camera.x + shiftX + px0 * camera.scale, top = camera.y + py0 * camera.scale;
  const shownW = (px1 - px0) * camera.scale, shownH = (py1 - py0) * camera.scale;
  const x0 = Math.max(0, left), y0 = Math.max(0, top);
  const x1 = Math.min(WIDTH, left + shownW), y1 = Math.min(HEIGHT, top + shownH);
  if (x1 - x0 < 2 || y1 - y0 < 2) return [];
  const sx = px0 + (x0 - left) / camera.scale, sy = py0 + (y0 - top) / camera.scale;
  const sw = (x1 - x0) / camera.scale, sh = (y1 - y0) / camera.scale;
  const region = { left: Math.floor(clamp(sx, 0, page.width - 1)), top: Math.floor(clamp(sy, 0, page.height - 1)), width: 0, height: 0 };
  region.width = Math.max(1, Math.min(page.width - region.left, Math.ceil(sw)));
  region.height = Math.max(1, Math.min(page.height - region.top, Math.ceil(sh)));
  const w = Math.round(x1 - x0), h = Math.round(y1 - y0);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="18" fill="#fff"/></svg>`);
  const input = await sharp(page.full).extract(region).resize(w, h, { fit: "fill" }).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const shadow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter></defs><rect x="${Math.round(x0) + 6}" y="${Math.round(y0) + 14}" width="${w}" height="${h}" rx="18" fill="#000" fill-opacity="0.55" filter="url(#s)"/></svg>`);
  return [{ input: shadow, left: 0, top: 0 }, { input, left: Math.round(x0), top: Math.round(y0) }];
}

const widths = new Map<string, number>();
/** The drawn width of a piece of text (rendered once and trimmed), so highlight markers sit exactly under the words. */
export async function textWidth(text: string, size: number, weight: number) {
  const key = `${size}|${weight}|${text}`;
  const known = widths.get(key);
  if (known !== undefined) return known;
  let width = 0;
  if (text.trim()) {
    const probe = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(text.length * size + 200)}" height="${size * 2}"><rect width="100%" height="100%" fill="#fff"/><text x="0" y="${size * 1.4}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" xml:space="preserve">|${escapeXml(text)}|</text></svg>`;
    const bar = `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 4}" height="${size * 2}"><rect width="100%" height="100%" fill="#fff"/><text x="0" y="${size * 1.4}" font-family="${FONT}" font-size="${size}" font-weight="${weight}">||</text></svg>`;
    const full = (await sharp(Buffer.from(probe)).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true })).info.width;
    const bars = (await sharp(Buffer.from(bar)).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true })).info.width;
    width = Math.max(0, full - bars);
  }
  widths.set(key, width);
  return width;
}

/** Text runs drawn left to right with *starred* runs on a highlighter mark; returns the SVG. */
let clipId = 0;
/** `sweep` (0–1) draws the highlighter across the starred words: covered letters turn dark, the rest stay in marker colour. */
async function markedText(text: string, x: number, baseline: number, size: number, colors: { plain: string; mark: string; marker: string; markerOpacity: number }, weights = { plain: 700, mark: 800 }, sweep = 1) {
  let cursor = x;
  const marks: string[] = [];
  const spans: string[] = [];
  for (const run of keyPointRuns(text)) {
    const weight = run.mark ? weights.mark : weights.plain;
    const width = await textWidth(run.text, size, weight);
    // The marker covers the whole height of the words, so dark highlighted text never sits on the dark band.
    const span = (fill: string, extra = "") => `<text x="${cursor.toFixed(1)}" y="${baseline}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" xml:space="preserve"${extra}>${escapeXml(run.text)}</text>`;
    if (run.mark && sweep < 1) {
      const id = `m${clipId++}`, w = Math.max(0, (width + 16) * sweep);
      const rect = `x="${(cursor - 8).toFixed(1)}" y="${(baseline - size * 0.86).toFixed(1)}" width="${w.toFixed(1)}" height="${(size * 1.12).toFixed(1)}"`;
      marks.push(`<clipPath id="${id}"><rect ${rect}/></clipPath><rect ${rect} rx="8" fill="${colors.marker}" fill-opacity="${colors.markerOpacity}"/>`);
      spans.push(span(colors.marker), span(colors.mark, ` clip-path="url(#${id})"`));
    } else {
      if (run.mark) marks.push(`<rect x="${(cursor - 8).toFixed(1)}" y="${(baseline - size * 0.86).toFixed(1)}" width="${(width + 16).toFixed(1)}" height="${(size * 1.12).toFixed(1)}" rx="8" fill="${colors.marker}" fill-opacity="${colors.markerOpacity}"/>`);
      spans.push(span(run.mark ? colors.mark : colors.plain));
    }
    cursor += width;
  }
  return marks.join("") + spans.join("");
}

/** "*starred*" words of a key point, split into plain and highlighted runs. */
export function keyPointRuns(text: string) {
  return text.split("*").map((part, index) => ({ text: part, mark: index % 2 === 1 })).filter((run) => run.text);
}

/** The bottom band: a KEY POINT (મુખ્ય મુદ્દો) label and the row's point, its *starred* words highlighted. */
async function captionSvg(caption: string, opacity: number, sweep = 1) {
  const text = caption.trim();
  const band = `<rect x="0" y="${HEIGHT - CAPTION_BAND}" width="${WIDTH}" height="${CAPTION_BAND}" fill="#0b1020" fill-opacity="0.88"/>`;
  if (!text) return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${band}</svg>`);
  const size = text.replaceAll("*", "").length > 48 ? 46 : 54;
  const pill = `<rect x="80" y="${HEIGHT - CAPTION_BAND + 22}" width="170" height="38" rx="19" fill="#ffd166"/><text x="165" y="${HEIGHT - CAPTION_BAND + 48}" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="800" letter-spacing="${GUJARATI.test(text) ? 0 : 2}" fill="#0b1020">${label(text, "KEY POINT", "મુખ્ય મુદ્દો")}</text>`;
  const line = await markedText(text, 84, HEIGHT - 34, size, { plain: "#f4f6fb", mark: "#0b1020", marker: "#ffd166", markerOpacity: 1 }, undefined, sweep);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${band}<g opacity="${opacity.toFixed(3)}">${pill}${line}</g></svg>`);
}

/** A thin bar along the top edge: how far into the video this frame is. */
function progressBar(progress: number) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="8"><rect width="${WIDTH}" height="8" fill="#ffffff" fill-opacity="0.14"/><rect width="${(WIDTH * clamp(progress)).toFixed(1)}" height="8" fill="#ffd166"/></svg>`);
}

/** One frame. `previous` (another page sliding out) is only set while a new page comes in. */
export async function pageFrame(pages: Map<string, PagePicture | null>, state: PageState, box: PageBox, captionOpacity: number, slide?: { previous: PageState; t: number }, options: PageFrameOptions = {}) {
  const bar: OverlayOptions[] = options.progress === undefined ? [] : [{ input: progressBar(options.progress), left: 0, top: 0 }];
  const page = pages.get(state.file);
  if (!page) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="100%" height="100%" fill="#0b1020"/><text x="960" y="520" text-anchor="middle" font-family="${FONT}" font-size="40" fill="#8a96ad">Missing page: ${escapeXml(state.file)}</text></svg>`;
    return sharp(Buffer.from(svg)).composite([{ input: await captionSvg(state.caption, 1) }, ...bar]).png().toBuffer();
  }
  const layers: OverlayOptions[] = [];
  const t = slide ? easeInOut(slide.t) : 1;
  const outgoing = slide ? pages.get(slide.previous.file) : null;
  if (slide && outgoing) {
    layers.push(...await pageLayer(outgoing, pageCamera(outgoing, slide.previous.box), slide.previous.box, -t * WIDTH));
  }
  layers.push(...await pageLayer(page, pageCamera(page, box, options.zoom ?? 1), box, slide ? (1 - t) * WIDTH : 0));
  layers.push({ input: await captionSvg(state.caption, captionOpacity, options.sweep ?? 1), left: 0, top: 0 }, ...bar);
  return sharp(page.blurred).composite(layers).png().toBuffer();
}

/** All frames of one row: a ~1.2 s move (glide on the same page, slide for a new page), then a hold in which the camera
 * drifts in slowly (from 96.5% to 100% of the fit, so nothing is ever cut) and the caption's highlight sweeps in. */
export async function createPageFrames(pages: Map<string, PagePicture | null>, state: PageState, previous: PageState | null, allocatedDuration: number, progress?: PageProgress) {
  const samePage = previous?.file === state.file;
  const fromBox = samePage ? previous!.box : WHOLE;
  const at = (seconds: number) => (progress ? progress.from + (progress.to - progress.from) * clamp(seconds / Math.max(allocatedDuration, 1e-6)) : undefined);
  // Always a move: even on the same box the previous hold ended fully drifted in, so the camera eases back out first.
  const seconds = Math.min(TRANSITION_SECONDS, allocatedDuration * 0.5);
  const count = Math.max(1, Math.round(seconds * FPS));
  const frames: { png: Buffer; duration: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = (index + 1) / count;
    const progressNow = at(frames.length / FPS);
    // A new page arrives showing the whole page, then the camera moves into the box during the second half.
    const png = samePage
      ? await pageFrame(pages, state, mixBox(fromBox, state.box, easeInOut(t)), 1, undefined, { zoom: 1 + (DRIFT - 1) * easeInOut(t), sweep: 0, progress: progressNow })
      : previous
        ? await pageFrame(pages, state, mixBox(WHOLE, state.box, easeInOut(clamp(t * 2 - 1))), clamp(t * 2 - 1), t < 0.5 ? { previous, t: t * 2 } : undefined, { zoom: DRIFT, sweep: 0, progress: progressNow })
        : await pageFrame(pages, state, mixBox(WHOLE, state.box, easeInOut(t)), t, undefined, { zoom: DRIFT, sweep: 0, progress: progressNow });
    frames.push({ png, duration: 1 / FPS });
  }
  const start = frames.length / FPS;
  const held = Math.max(1 / FPS, allocatedDuration - start);
  const holdCount = Math.max(1, Math.round(held * HOLD_FPS));
  for (let index = 0; index < holdCount; index += 1) {
    const elapsed = (index / holdCount) * held;
    const zoom = DRIFT + (1 - DRIFT) * easeInOut(holdCount === 1 ? 1 : index / (holdCount - 1));
    const sweep = clamp((elapsed + 1 / HOLD_FPS) / SWEEP_SECONDS);
    frames.push({ png: await pageFrame(pages, state, state.box, 1, undefined, { zoom, sweep, progress: at(start + elapsed) }), duration: held / holdCount });
  }
  return frames;
}

/** Recap board (visual = keypoints): a notebook card over the last page's blurred background; points appear one by one. */
export async function keyPointsFrame(background: PagePicture | null | undefined, title: string, points: string[], shown: number, progress?: number) {
  const cardX = 140, cardY = 50, cardW = WIDTH - 280, cardH = HEIGHT - 100;
  const top = cardY + 250;
  const step = Math.min(118, (cardY + cardH - 70 - top) / Math.max(1, points.length - 1));
  const size = points.some((point) => point.replaceAll("*", "").length > 50) ? 42 : 46;
  const rows: string[] = [];
  for (const [index, point] of points.entries()) {
    const opacity = clamp(shown - index);
    if (opacity <= 0) continue;
    const y = top + index * step;
    const text = await markedText(point, cardX + 160, y, size, { plain: "#1d2433", mark: "#1d2433", marker: "#ffd166", markerOpacity: 0.85 }, { plain: 600, mark: 800 });
    rows.push(`<g opacity="${opacity.toFixed(3)}"><circle cx="${cardX + 112}" cy="${y - size * 0.34}" r="20" fill="#2e7d4f"/><path d="M${cardX + 102} ${y - size * 0.34} l8 8 l14 -16" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${text}</g>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    <defs><filter id="s" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="20"/></filter></defs>
    <rect x="${cardX + 8}" y="${cardY + 18}" width="${cardW}" height="${cardH}" rx="26" fill="#000" fill-opacity="0.55" filter="url(#s)"/>
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="26" fill="#fbf7ec"/>
    <rect x="${cardX + 66}" y="${cardY}" width="3" height="${cardH}" fill="#e8a0a0" fill-opacity="0.7"/>
    <rect x="${cardX + 96}" y="${cardY + 44}" width="200" height="42" rx="21" fill="#ffd166"/>
    <text x="${cardX + 196}" y="${cardY + 72}" text-anchor="middle" font-family="${FONT}" font-size="23" font-weight="800" letter-spacing="${GUJARATI.test(title) ? 0 : 2}" fill="#0b1020">${label(title, "REMEMBER", "યાદ રાખો")}</text>
    <text x="${cardX + 96}" y="${cardY + 160}" font-family="${FONT}" font-size="60" font-weight="800" fill="#0b1020">${escapeXml(title)}</text>
    ${rows.join("")}</svg>`;
  const base = background ? sharp(background.blurred) : sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: "#0b1020" } });
  return base.composite([{ input: Buffer.from(svg), left: 0, top: 0 }, ...(progress === undefined ? [] : [{ input: progressBar(progress), left: 0, top: 0 }])]).png().toBuffer();
}

/** All frames of a recap row: the points appear one by one over at most 60% of the line, then the full board holds. */
export async function createKeyPointsFrames(background: PagePicture | null | undefined, title: string, points: string[], allocatedDuration: number, progress?: PageProgress) {
  const at = (seconds: number) => (progress ? progress.from + (progress.to - progress.from) * clamp(seconds / Math.max(allocatedDuration, 1e-6)) : undefined);
  const seconds = Math.min(points.length * 0.6, allocatedDuration * 0.6);
  const count = Math.max(1, Math.round(seconds * FPS));
  const frames: { png: Buffer; duration: number }[] = [];
  for (let index = 0; index < count; index += 1) frames.push({ png: await keyPointsFrame(background, title, points, ((index + 1) / count) * points.length, at(index / FPS)), duration: 1 / FPS });
  frames.push({ png: await keyPointsFrame(background, title, points, points.length, at(count / FPS)), duration: Math.max(1 / FPS, allocatedDuration - count / FPS) });
  return frames;
}
