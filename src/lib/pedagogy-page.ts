// Flipbook page slides (visual = page), exam-question (pedagogy) path only.
// A whole booklet page sits on a blurred, darkened copy of itself. The camera frames the part being read (the row's
// box): rows on the same page glide from the previous box to the new one; a new page slides in from the right while the
// old one slides out. One English caption sits at the bottom. Every frame is composed with sharp from the page itself.
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
const CAPTION_BAND = 150;
const MARGIN = 40;
const FPS = 12;
const TRANSITION_SECONDS = 1.2;
const FONT = "Inter, 'Noto Sans', Arial, sans-serif";
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
export function pageCamera(page: { width: number; height: number }, box: PageBox) {
  const viewW = WIDTH - 2 * MARGIN;
  const viewH = HEIGHT - CAPTION_BAND - 2 * MARGIN;
  const boxW = (box[2] - box[0]) * page.width;
  const boxH = (box[3] - box[1]) * page.height;
  const scale = Math.min(viewW / boxW, viewH / boxH);
  const centerX = ((box[0] + box[2]) / 2) * page.width;
  const centerY = ((box[1] + box[3]) / 2) * page.height;
  return { scale, x: WIDTH / 2 - centerX * scale, y: MARGIN + viewH / 2 - centerY * scale };
}

const mixBox = (a: PageBox, b: PageBox, t: number): PageBox => [0, 1, 2, 3].map((i) => a[i] + (b[i] - a[i]) * t) as PageBox;

/** The page drawn at a camera, cut to the frame, as a composite layer. */
async function pageLayer(page: PagePicture, camera: { scale: number; x: number; y: number }, shiftX = 0) {
  const left = camera.x + shiftX;
  const top = camera.y;
  const shownW = page.width * camera.scale;
  const shownH = page.height * camera.scale;
  const x0 = Math.max(0, left), y0 = Math.max(0, top);
  const x1 = Math.min(WIDTH, left + shownW), y1 = Math.min(HEIGHT, top + shownH);
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  const sx = (x0 - left) / camera.scale, sy = (y0 - top) / camera.scale;
  const sw = (x1 - x0) / camera.scale, sh = (y1 - y0) / camera.scale;
  const region = { left: Math.floor(clamp(sx, 0, page.width - 1)), top: Math.floor(clamp(sy, 0, page.height - 1)), width: 0, height: 0 };
  region.width = Math.max(1, Math.min(page.width - region.left, Math.ceil(sw)));
  region.height = Math.max(1, Math.min(page.height - region.top, Math.ceil(sh)));
  const input = await sharp(page.full).extract(region).resize(Math.round(x1 - x0), Math.round(y1 - y0), { fit: "fill" }).png().toBuffer();
  return { input, left: Math.round(x0), top: Math.round(y0) };
}

function captionSvg(caption: string, opacity: number) {
  const text = caption.trim();
  const band = `<rect x="0" y="${HEIGHT - CAPTION_BAND}" width="${WIDTH}" height="${CAPTION_BAND}" fill="#0b1020" fill-opacity="0.78"/>`;
  const line = text ? `<rect x="80" y="${HEIGHT - CAPTION_BAND / 2 - 26}" width="8" height="52" rx="4" fill="#ffd166"/><text x="110" y="${HEIGHT - CAPTION_BAND / 2 + 16}" font-family="${FONT}" font-size="46" font-weight="700" fill="#f4f6fb" opacity="${opacity.toFixed(3)}">${escapeXml(text)}</text>` : "";
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${band}${line}</svg>`);
}

/** One frame. `previous` (another page sliding out) is only set while a new page comes in. */
export async function pageFrame(pages: Map<string, PagePicture | null>, state: PageState, box: PageBox, captionOpacity: number, slide?: { previous: PageState; t: number }) {
  const page = pages.get(state.file);
  if (!page) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="100%" height="100%" fill="#0b1020"/><text x="960" y="520" text-anchor="middle" font-family="${FONT}" font-size="40" fill="#8a96ad">Missing page: ${escapeXml(state.file)}</text></svg>`;
    return sharp(Buffer.from(svg)).composite([{ input: captionSvg(state.caption, 1) }]).png().toBuffer();
  }
  const layers: OverlayOptions[] = [];
  const t = slide ? easeInOut(slide.t) : 1;
  const outgoing = slide ? pages.get(slide.previous.file) : null;
  if (slide && outgoing) {
    const layer = await pageLayer(outgoing, pageCamera(outgoing, slide.previous.box), -t * WIDTH);
    if (layer) layers.push(layer);
  }
  const incoming = await pageLayer(page, pageCamera(page, box), slide ? (1 - t) * WIDTH : 0);
  if (incoming) layers.push(incoming);
  layers.push({ input: captionSvg(state.caption, captionOpacity), left: 0, top: 0 });
  return sharp(page.blurred).composite(layers).png().toBuffer();
}

/** All frames of one row: a ~1.2 s move (glide on the same page, slide for a new page), then the framed part holds. */
export async function createPageFrames(pages: Map<string, PagePicture | null>, state: PageState, previous: PageState | null, allocatedDuration: number) {
  const samePage = previous?.file === state.file;
  const fromBox = samePage ? previous!.box : WHOLE;
  const moving = !samePage || fromBox.some((value, index) => Math.abs(value - state.box[index]) > 1e-6);
  const seconds = moving ? Math.min(TRANSITION_SECONDS, allocatedDuration * 0.5) : 0;
  const count = Math.max(1, Math.round(seconds * FPS));
  const frames: { png: Buffer; duration: number }[] = [];
  if (moving) {
    for (let index = 0; index < count; index += 1) {
      const t = (index + 1) / count;
      // A new page arrives showing the whole page, then the camera moves into the box during the second half.
      const png = samePage
        ? await pageFrame(pages, state, mixBox(fromBox, state.box, easeInOut(t)), 1)
        : previous
          ? await pageFrame(pages, state, mixBox(WHOLE, state.box, easeInOut(clamp(t * 2 - 1))), clamp(t * 2 - 1), t < 0.5 ? { previous, t: t * 2 } : undefined)
          : await pageFrame(pages, state, mixBox(WHOLE, state.box, easeInOut(t)), t);
      frames.push({ png, duration: 1 / FPS });
    }
  }
  const held = Math.max(1 / FPS, allocatedDuration - frames.length / FPS);
  frames.push({ png: await pageFrame(pages, state, state.box, 1), duration: held });
  return frames;
}
