// Flipbook page slides (visual = page), exam-question (pedagogy) path only.
// A whole booklet page sits on a blurred, darkened copy of itself. The camera frames the part being read (the row's
// box) and the page fills the whole screen: rows on the same page glide from the previous box to the new one; a new page slides in from the right while the
// old one slides out. One caption sits at the bottom (labels in Gujarati when the caption is Gujarati). While a row holds,
// the camera drifts in slowly, the caption's highlight sweeps in, and a thin bar at the top shows how far the video is. Every frame is composed with sharp from the page itself.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { pedagogyLogoDirectory } from "@/lib/pedagogy-look-slide";

export type PageBox = [number, number, number, number];
/** Where the page has ink: edge counts on a small grey copy, summed along rows and columns (for placing frame edges in gaps). */
export type PageInk = { scale: number; w: number; h: number; rows: Uint32Array; cols: Uint32Array };
export type PagePicture = { full: Buffer; blurred: Buffer; width: number; height: number; ink?: PageInk };
export type PageState = { file: string; box: PageBox; caption: string };

const WIDTH = 1920;
const HEIGHT = 1080;
/** The caption band over the bottom of the screen; the box being read always sits whole above it. */
const CAPTION_BAND = 190;
const SAFE_HEIGHT = HEIGHT - CAPTION_BAND;
/** Height of the running-track bar along the top; the box sits whole below it too. */
const TOP_BAR = 58;
/** Padding around the box (fraction of the page width). */
const BOX_PAD = 0.02;

const FPS = 12;
const TRANSITION_SECONDS = 1.2;
const FONT = "Inter, 'Noto Sans Gujarati', 'Gujarati Sangam MN', 'Noto Sans', Arial, sans-serif";
/** Hold frames per second (the slow drift), how far in the drift starts (fraction of the full fit), and the highlight sweep. */
const HOLD_FPS = 6;
const SWEEP_SECONDS = 0.6;
const GUJARATI = /[\u0A80-\u0AFF]/;
/** A label in Gujarati when the text it sits with is Gujarati. */
const label = (text: string, english: string, gujarati: string) => (GUJARATI.test(text) ? gujarati : english);
/** Where a row sits in the whole video (0–1), for the progress bar. */
export type PageProgress = { from: number; to: number };
export type PageFrameOptions = { sweep?: number; spotlight?: number; progress?: number };

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
    pages.set(file, { full, blurred, width, height, ink: await inkMap(full, width) });
  }
  return pages;
}

/** Edge pixels of a page (on a 600 px wide grey copy), as running sums along each row and each column. */
async function inkMap(full: Buffer, pageWidth: number): Promise<PageInk> {
  const { data, info } = await sharp(full).resize({ width: 600 }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const rows = new Uint32Array(h * (w + 1)), cols = new Uint32Array(w * (h + 1));
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const v = data[y * w + x];
      const edge = (x ? Math.abs(v - data[y * w + x - 1]) : 0) + (y ? Math.abs(v - data[(y - 1) * w + x]) : 0) > 40 ? 1 : 0;
      rows[y * (w + 1) + x + 1] = rows[y * (w + 1) + x] + edge;
      cols[x * (h + 1) + y + 1] = cols[x * (h + 1) + y] + edge;
    }
  }
  return { scale: w / pageWidth, w, h, rows, cols };
}

/** How much a frame edge along page column `x` (from y0 to y1) would cut through ink: 0 = a clean gap. Page edges cost 0. */
function colCut(ink: PageInk, x: number, y0: number, y1: number) {
  const c = Math.round(x * ink.scale), a = Math.max(0, Math.round(y0 * ink.scale)), b = Math.min(ink.h, Math.round(y1 * ink.scale));
  if (c <= 1 || c >= ink.w - 2 || b - a < 2) return 0;
  let sum = 0;
  for (let k = c - 2; k <= c + 2; k += 1) sum += ink.cols[k * (ink.h + 1) + b] - ink.cols[k * (ink.h + 1) + a];
  return sum / ((b - a) * 5);
}
const steps = (lo: number, hi: number, n: number) => (hi <= lo ? [(lo + hi) / 2] : Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1)));

/** A camera view on a page, in page pixels: top-left and width (its height follows the 16:9 screen). */
export type PageView = { x: number; y: number; w: number };
const viewHeight = (view: PageView) => (view.w * HEIGHT) / WIDTH;
const mixView = (a: PageView, b: PageView, t: number): PageView => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t });

/** Where the camera starts and ends for a box. The page fills the whole screen; the box (plus a little padding) always sits
 * whole in the part above the caption band. Among the views that hold it (a little wider is allowed), the one whose four
 * edges cut through the least ink is chosen, so no neighbouring line is shown cut in half. The view holds still. When the box
 * is too tall to fit even at the full page width, the camera pans down it, starting and ending on a gap. */
const viewCache = new WeakMap<object, Map<string, ReturnType<typeof computeViews>>>();
export function pageViews(page: { width: number; height: number; ink?: PageInk }, box: PageBox) {
  let known = viewCache.get(page);
  if (!known) { known = new Map(); viewCache.set(page, known); }
  const key = box.join(",");
  let views = known.get(key);
  if (!views) { views = computeViews(page, box); known.set(key, views); }
  return views;
}
function computeViews(page: { width: number; height: number; ink?: PageInk }, box: PageBox) {
  // Worked out for the visible part (below the top bar, above the caption band); `y` is its top, turned into the view top at the end.
  const ratio = WIDTH / (SAFE_HEIGHT - TOP_BAR);
  const toView = (v: PageView): PageView => ({ ...v, y: v.y - (TOP_BAR * v.w) / WIDTH });
  const pad = page.width * BOX_PAD;
  const x0 = clamp(box[0] * page.width - pad, 0, page.width), x1 = clamp(box[2] * page.width + pad, 0, page.width);
  let y0 = clamp(box[1] * page.height - pad, 0, page.height), y1 = clamp(box[3] * page.height + pad, 0, page.height);
  const ink = page.ink;
  // Ink along every row of the small copy between x and x + w (fraction of edge pixels); rows at the page edge count as clean.
  const rowInk = (x: number, w: number) => {
    if (!ink) return null;
    const a = Math.max(0, Math.round(x * ink.scale)), b = Math.min(ink.w, Math.round((x + w) * ink.scale)), out = new Float64Array(ink.h);
    for (let r = 0; r < ink.h; r += 1) out[r] = b - a < 2 ? 0 : (ink.rows[r * (ink.w + 1) + b] - ink.rows[r * (ink.w + 1) + a]) / (b - a);
    return out;
  };
  // An edge at page row y: the worst of the rows it touches (y ± 1 on the small copy), so it must sit in a real gap.
  const edgeAt = (rows: Float64Array | null, y: number) => {
    if (!rows || !ink) return 0;
    const r = Math.round(y * ink.scale);
    if (r <= 1 || r >= ink.h - 2) return 0;
    return Math.max(rows[r - 1], rows[r], rows[r + 1]);
  };
  // The box's own top and bottom move to the nearest clean gap (mostly outward), so the spotlight never crosses a line.
  if (ink) {
    const rows = rowInk(x0, x1 - x0), step = 1 / ink.scale;
    const snap = (from: number, lo: number, hi: number) => { let best = from, cost = edgeAt(rows, from) + 1e-9; for (let y = lo; y <= hi; y += step) { const c = edgeAt(rows, y) + 0.00002 * Math.abs(y - from); if (c < cost) { cost = c; best = y; } } return best; };
    y0 = snap(y0, Math.max(0, y0 - page.height * 0.03), Math.min(y1, y0 + page.height * 0.008));
    y1 = snap(y1, Math.max(y0, y1 - page.height * 0.008), Math.min(page.height, y1 + page.height * 0.03));
  }
  const boxW = x1 - x0, boxH = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const frame = { x0, y0, x1, y1 };
  const fit = Math.max(boxW, boxH * ratio);
  if (fit <= page.width) {
    let best: PageView = { x: clamp(cx - fit / 2, 0, page.width - fit), y: clamp(cy - fit / ratio / 2, 0, Math.max(0, page.height - fit / ratio)), w: fit };
    if (ink) {
      let bestCost = Infinity;
      const rowStep = 1 / ink.scale;
      for (let k = 0; k <= 10; k += 1) {
        const w = Math.min(page.width, fit * (1 + 0.04 * k)), safe = w / ratio;
        for (const x of steps(Math.max(0, x1 - w), Math.min(x0, page.width - w), 7)) {
          const rows = rowInk(x, w);
          const side = colCut(ink, x, y0, y1) + colCut(ink, x + w, y0, y1);
          const lo = Math.max(0, y1 - safe), hi = Math.min(y0, Math.max(0, page.height - safe));
          for (let y = lo; y <= Math.max(lo, hi) + 1e-6; y += rowStep) {
            const cut = edgeAt(rows, y) + edgeAt(rows, y + safe) + side;
            const cost = cut + 0.004 * k + 0.001 * (Math.abs(x + w / 2 - cx) + Math.abs(y + safe / 2 - cy)) / safe;
            if (cost < bestCost) { bestCost = cost; best = { x, y, w }; }
          }
        }
        if (w >= page.width) break;
      }
    }
    return { start: toView(best), end: toView(best), pan: false, frame };
  }
  const w = page.width, safe = w / ratio, rows = rowInk(0, w);
  const pick = (lo: number, hi: number) => { let bestY = (lo + hi) / 2, bestCost = Infinity; for (let y = lo; y <= hi; y += ink ? 1 / ink.scale : hi - lo + 1) { const c = edgeAt(rows, y); if (c < bestCost - 1e-9) { bestCost = c; bestY = y; } } return bestY; };
  const top = pick(Math.max(0, y0 - safe * 0.15), y0);
  const bottom = pick(y1, Math.min(page.height, y1 + safe * 0.15));
  return { start: toView({ x: 0, y: top, w }), end: toView({ x: 0, y: Math.max(top, bottom - safe), w }), pan: true, frame };
}

/** The framed part (page pixels, already padded and snapped) on screen for a view, for the spotlight. */
function boxOnScreen(view: PageView, frame: { x0: number; y0: number; x1: number; y1: number }) {
  const scale = WIDTH / view.w;
  return { x0: (frame.x0 - view.x) * scale, y0: (frame.y0 - view.y) * scale, x1: (frame.x1 - view.x) * scale, y1: (frame.y1 - view.y) * scale };
}

/** Spotlight on the part being read: the rest of the page dims a little and a highlighter line frames the box. */
function spotlightSvg(rect: { x0: number; y0: number; x1: number; y1: number }, strength: number) {
  const x0 = Math.max(-20, rect.x0), y0 = Math.max(-20, rect.y0), x1 = Math.min(WIDTH + 20, rect.x1), y1 = Math.min(HEIGHT + 20, rect.y1);
  if (strength <= 0 || x1 - x0 < 4 || y1 - y0 < 4) return null;
  const hole = `M${x0.toFixed(1)} ${y0.toFixed(1)}h${(x1 - x0).toFixed(1)}v${(y1 - y0).toFixed(1)}h${(x0 - x1).toFixed(1)}z`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><path d="M0 0H${WIDTH}V${HEIGHT}H0z ${hole}" fill="#05070d" fill-opacity="${(0.42 * strength).toFixed(3)}" fill-rule="evenodd"/><rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${(y1 - y0).toFixed(1)}" rx="14" fill="none" stroke="#ffd166" stroke-width="6" stroke-opacity="${(0.95 * strength).toFixed(3)}"/></svg>`);
}

/** The page seen through a view, filling the screen; anything beyond the page edge shows the blurred page behind. */
async function viewImage(page: PagePicture, view: PageView, box?: PageBox, spotlight = 0) {
  const scale = WIDTH / view.w, height = viewHeight(view);
  const px0 = clamp(view.x, 0, page.width), py0 = clamp(view.y, 0, page.height);
  const px1 = clamp(view.x + view.w, 0, page.width), py1 = clamp(view.y + height, 0, page.height);
  const left = Math.round((px0 - view.x) * scale), top = Math.round((py0 - view.y) * scale);
  const w = Math.min(WIDTH - left, Math.round((px1 - px0) * scale)), h = Math.min(HEIGHT - top, Math.round((py1 - py0) * scale));
  const light = box ? spotlightSvg(boxOnScreen(view, pageViews(page, box).frame), spotlight) : null;
  const extra: OverlayOptions[] = light ? [{ input: light, left: 0, top: 0 }] : [];
  if (w < 2 || h < 2) return sharp(page.blurred).composite(extra).png().toBuffer();
  const region = { left: Math.floor(px0), top: Math.floor(py0), width: 0, height: 0 };
  region.width = Math.max(1, Math.min(page.width - region.left, Math.ceil(px1 - px0)));
  region.height = Math.max(1, Math.min(page.height - region.top, Math.ceil(py1 - py0)));
  const input = await sharp(page.full).extract(region).resize(w, h, { fit: "fill" }).png().toBuffer();
  return sharp(page.blurred).composite([{ input, left, top }, ...extra]).png().toBuffer();
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
  const band = `<rect x="0" y="${HEIGHT - CAPTION_BAND}" width="${WIDTH}" height="${CAPTION_BAND}" fill="#0b1020" fill-opacity="0.95"/>`;
  if (!text) return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${band}</svg>`);
  const size = text.replaceAll("*", "").length > 48 ? 46 : 54;
  const pill = `<rect x="80" y="${HEIGHT - CAPTION_BAND + 22}" width="170" height="38" rx="19" fill="#ffd166"/><text x="165" y="${HEIGHT - CAPTION_BAND + 48}" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="800" letter-spacing="${GUJARATI.test(text) ? 0 : 2}" fill="#0b1020">${label(text, "KEY POINT", "મુખ્ય મુદ્દો")}</text>`;
  const line = await markedText(text, 84, HEIGHT - 34, size, { plain: "#f4f6fb", mark: "#0b1020", marker: "#ffd166", markerOpacity: 1 }, undefined, sweep);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${band}<g opacity="${opacity.toFixed(3)}">${pill}${line}</g></svg>`);
}

/** Progress as a running track along the top edge: 5 km marks, a finish flag, and a runner at how far the video is. */
function progressBar(progress: number) {
  const h = 46, left = 70, right = WIDTH - 110, y = 30, p = clamp(progress);
  const x = left + (right - left) * p;
  const ticks = [1, 2, 3, 4].map((km) => { const tx = left + ((right - left) * km) / 5; return `<line x1="${tx}" y1="${y - 7}" x2="${tx}" y2="${y + 7}" stroke="#ffffff" stroke-opacity="0.5" stroke-width="2"/><text x="${tx}" y="${y - 11}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="700" fill="#ffffff" fill-opacity="0.7">${km}</text>`; }).join("");
  // A simple runner: head, body leaning forward, arms and legs mid-stride.
  const runner = `<g transform="translate(${x.toFixed(1)} ${y - 4})" stroke="#ffd166" stroke-width="4" stroke-linecap="round" fill="none"><circle cx="3" cy="-16" r="5" fill="#ffd166" stroke="none"/><path d="M1 -10 L-3 4"/><path d="M0 -7 L8 -2 M0 -7 L-8 -3"/><path d="M-3 4 L5 10 L3 16 M-3 4 L-9 12"/></g>`;
  const flag = `<g transform="translate(${right + 18} ${y})"><line x1="0" y1="-16" x2="0" y2="12" stroke="#ffffff" stroke-width="3"/><path d="M0 -16 h22 v12 h-22z" fill="#ffffff"/><path d="M0 -16h5.5v6h-5.5zM11 -16h5.5v6h-5.5zM5.5 -10h5.5v6h-5.5zM16.5 -10h5.5v6h-5.5z" fill="#0b1020"/><text x="34" y="2" font-family="${FONT}" font-size="15" font-weight="800" fill="#ffffff">5 કિમી</text></g>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${h + 12}"><rect width="${WIDTH}" height="${h + 12}" fill="#0b1020" fill-opacity="0.94"/><line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#ffffff" stroke-opacity="0.28" stroke-width="6" stroke-linecap="round"/><line x1="${left}" y1="${y}" x2="${x.toFixed(1)}" y2="${y}" stroke="#ffd166" stroke-width="6" stroke-linecap="round"/>${ticks}${flag}${runner}</svg>`);
}

/** One frame: the page through `view`, or (while a new page comes in) the old page sliding out left and the new one in. */
export async function pageFrame(pages: Map<string, PagePicture | null>, state: PageState, view: PageView, captionOpacity: number, slide?: { previous: PageState; view: PageView; t: number }, options: PageFrameOptions = {}) {
  const bar: OverlayOptions[] = options.progress === undefined ? [] : [{ input: progressBar(options.progress), left: 0, top: 0 }];
  const caption: OverlayOptions = { input: await captionSvg(state.caption, captionOpacity, options.sweep ?? 1), left: 0, top: 0 };
  const page = pages.get(state.file);
  if (!page) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="100%" height="100%" fill="#0b1020"/><text x="960" y="520" text-anchor="middle" font-family="${FONT}" font-size="40" fill="#8a96ad">Missing page: ${escapeXml(state.file)}</text></svg>`;
    return sharp(Buffer.from(svg)).composite([caption, ...bar]).png().toBuffer();
  }
  const current = await viewImage(page, view, state.box, options.spotlight ?? 1);
  const outgoing = slide ? pages.get(slide.previous.file) : null;
  if (!slide || !outgoing) return sharp(current).composite([caption, ...bar]).png().toBuffer();
  const shift = Math.round(easeInOut(slide.t) * WIDTH);
  const layers: OverlayOptions[] = [];
  if (shift < WIDTH) layers.push({ input: await sharp(await viewImage(outgoing, slide.view, slide.previous.box, 1)).extract({ left: shift, top: 0, width: WIDTH - shift, height: HEIGHT }).png().toBuffer(), left: 0, top: 0 });
  if (shift > 0) layers.push({ input: await sharp(current).extract({ left: 0, top: 0, width: shift, height: HEIGHT }).png().toBuffer(), left: WIDTH - shift, top: 0 });
  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: "#0b1020" } }).composite([...layers, caption, ...bar]).png().toBuffer();
}

/** All frames of one row: a ~1.2 s move (glide on the same page, slide for a new page), then a hold in which the camera
 * closes in on the box (or pans down a tall one) and the caption's highlight sweeps in. */
export async function createPageFrames(pages: Map<string, PagePicture | null>, state: PageState, previous: PageState | null, allocatedDuration: number, progress?: PageProgress) {
  const page = pages.get(state.file);
  const at = (seconds: number) => (progress ? progress.from + (progress.to - progress.from) * clamp(seconds / Math.max(allocatedDuration, 1e-6)) : undefined);
  const placeholder: PageView = { x: 0, y: 0, w: WIDTH };
  const views = page ? pageViews(page, state.box) : { start: placeholder, end: placeholder, pan: false };
  const prevPage = previous ? pages.get(previous.file) : null;
  const prevEnd = previous && prevPage ? pageViews(prevPage, previous.box).end : null;
  const samePage = Boolean(previous && previous.file === state.file && prevEnd);
  const frames: { png: Buffer; duration: number }[] = [];
  if (previous && prevEnd) {
    const count = Math.max(1, Math.round(Math.min(TRANSITION_SECONDS, allocatedDuration * 0.5) * FPS));
    for (let index = 0; index < count; index += 1) {
      const t = (index + 1) / count;
      const options = { sweep: 0, spotlight: 0, progress: at(frames.length / FPS) };
      const png = samePage
        ? await pageFrame(pages, state, mixView(prevEnd, views.start, easeInOut(t)), 1, undefined, options)
        : await pageFrame(pages, state, views.start, clamp(t * 2 - 1), t < 1 ? { previous: previous!, view: prevEnd, t } : undefined, options);
      frames.push({ png, duration: 1 / FPS });
    }
  }
  const start = frames.length / FPS;
  const held = Math.max(1 / FPS, allocatedDuration - start);
  const holdCount = Math.max(1, Math.round(held * HOLD_FPS));
  for (let index = 0; index < holdCount; index += 1) {
    const elapsed = (index / holdCount) * held;
    const view = mixView(views.start, views.end, easeInOut(holdCount === 1 ? 1 : index / (holdCount - 1)));
    const sweep = clamp((elapsed + 1 / HOLD_FPS) / SWEEP_SECONDS);
    frames.push({ png: await pageFrame(pages, state, view, 1, undefined, { sweep, spotlight: sweep, progress: at(start + elapsed) }), duration: held / holdCount });
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

/** Chapter card: the chapter's page blurred behind, "ભાગ 2 / 6" (Part), the title, and a dot per chapter (done ones filled). */
export async function chapterFrame(background: PagePicture | null | undefined, chapter: { number: number; total: number; title: string }, t: number, progress?: number) {
  const gujarati = GUJARATI.test(chapter.title);
  const a = easeInOut(clamp(t)), rise = (1 - a) * 40;
  const dots = Array.from({ length: chapter.total }, (_, i) => { const cx = WIDTH / 2 + (i - (chapter.total - 1) / 2) * 56; return i + 1 < chapter.number ? `<circle cx="${cx}" cy="760" r="12" fill="#ffd166"/>` : i + 1 === chapter.number ? `<circle cx="${cx}" cy="760" r="17" fill="#ffd166" stroke="#ffffff" stroke-width="4"/>` : `<circle cx="${cx}" cy="760" r="12" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="3"/>`; }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="#05070d" fill-opacity="0.35"/>
    <g opacity="${a.toFixed(3)}" transform="translate(0 ${rise.toFixed(1)})">
      <rect x="${WIDTH / 2 - 150}" y="330" width="300" height="64" rx="32" fill="#ffd166"/>
      <text x="${WIDTH / 2}" y="374" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="800" fill="#0b1020">${gujarati ? "ભાગ" : "Part"} ${chapter.number} / ${chapter.total}</text>
      <text x="${WIDTH / 2}" y="560" text-anchor="middle" font-family="${FONT}" font-size="${chapter.title.length > 22 ? 96 : 116}" font-weight="800" fill="#ffffff">${escapeXml(chapter.title)}</text>
      <rect x="${WIDTH / 2 - 120}" y="610" width="240" height="8" rx="4" fill="#ffd166"/>
      ${dots}
    </g></svg>`;
  const base = background ? sharp(background.blurred) : sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: "#0b1020" } });
  return base.composite([{ input: Buffer.from(svg), left: 0, top: 0 }, ...(progress === undefined ? [] : [{ input: progressBar(progress), left: 0, top: 0 }])]).png().toBuffer();
}

/** All frames of a chapter row: the card rises in over ~0.8 s, then holds. */
export async function createChapterFrames(background: PagePicture | null | undefined, chapter: { number: number; total: number; title: string }, allocatedDuration: number, progress?: PageProgress) {
  const at = (seconds: number) => (progress ? progress.from + (progress.to - progress.from) * clamp(seconds / Math.max(allocatedDuration, 1e-6)) : undefined);
  const count = Math.max(1, Math.round(Math.min(0.8, allocatedDuration * 0.4) * FPS));
  const frames: { png: Buffer; duration: number }[] = [];
  for (let index = 0; index < count; index += 1) frames.push({ png: await chapterFrame(background, chapter, (index + 1) / count, at(index / FPS)), duration: 1 / FPS });
  frames.push({ png: await chapterFrame(background, chapter, 1, at(count / FPS)), duration: Math.max(1 / FPS, allocatedDuration - count / FPS) });
  return frames;
}
