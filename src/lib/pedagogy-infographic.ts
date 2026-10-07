import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import sharp from "sharp";

/**
 * Data-driven board visuals for layout=diagram, so a new topic needs no new code.
 * The brief names the kind in `diagram` and lists the items in `diagram_items`, separated by "|":
 *   flow      "Step A | Step B | Step C"                      boxes joined by arrows, top to bottom
 *   cards     "Title = text | Title = text"                   up to 6 cards in a grid
 *   timeline  "1992 = RCI Act | 1995 = PWD Act"               years on a line, events beside them
 *   compare   "Equality = same for all | Equity = as needed"  two columns side by side
 *   image     "potter.png = Clay is shaped when it is ready"  pictures from the pedagogy-images folder, caption optional;
 *             the newest picture fades in and zooms up to full size
 * One item appears per step (diagram_step), in the order written, like a teacher writing on the board.
 */
export const INFOGRAPHIC_KINDS = ["flow", "cards", "timeline", "compare", "image"] as const;
export type InfographicKind = (typeof INFOGRAPHIC_KINDS)[number];
export const INFOGRAPHIC_MAX_ITEMS: Record<InfographicKind, number> = { flow: 6, cards: 6, timeline: 6, compare: 2, image: 4 };

export function isInfographic(name: string): name is InfographicKind {
  return (INFOGRAPHIC_KINDS as readonly string[]).includes(name);
}

export function infographicItems(text: string) {
  return text.split("|").map((item) => item.trim()).filter(Boolean);
}

type Item = { title: string; text: string };
function splitItem(item: string): Item {
  const at = item.indexOf("=");
  return at < 0 ? { title: item, text: "" } : { title: item.slice(0, at).trim(), text: item.slice(at + 1).trim() };
}

const SERIF = "Georgia, 'Times New Roman', serif";
const BOARD = { x: 60, y: 120, width: 1180, height: 920 };
const COLOURS = ["#4fa3ff", "#7fe08a", "#ffd166", "#ff8a7a", "#b9a3f5", "#4fd1c5"];

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

const widthCache = new Map<string, Promise<number>>();
function textWidth(text: string, size: number) {
  const key = `${size}|${text}`;
  let width = widthCache.get(key);
  if (!width) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(text.length * size * 1.2 + 40)}" height="${Math.ceil(size * 2)}"><text x="10" y="${Math.round(size * 1.4)}" font-family="${SERIF}" font-size="${size}" fill="#000">${escapeXml(text)}</text></svg>`;
    width = sharp(Buffer.from(svg)).trim().png().toBuffer({ resolveWithObject: true }).then(({ info }) => info.width).catch(() => text.length * size * 0.5);
    widthCache.set(key, width);
  }
  return width;
}

/** Greedy word wrap measured with the slide's own renderer. */
async function wrap(text: string, size: number, maxWidth: number) {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (current && await textWidth(next, size) > maxWidth) { lines.push(current); current = word; } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

/** Largest size (down to `min`) at which the text fits the box; returns the wrapped lines. */
async function fit(text: string, maxWidth: number, maxHeight: number, start: number, min = 20) {
  for (let size = start; size >= min; size -= 2) {
    const lines = await wrap(text, size, maxWidth);
    if (lines.length * size * 1.3 <= maxHeight) return { lines, size };
  }
  return { lines: await wrap(text, min, maxWidth), size: min };
}

const textBlock = (lines: string[], x: number, y: number, size: number, colour: string, anchor = "start") =>
  lines.map((line, index) => `<text x="${x}" y="${(y + index * size * 1.3).toFixed(1)}" text-anchor="${anchor}" font-family="${SERIF}" font-size="${size}" fill="${colour}">${escapeXml(line)}</text>`).join("");

function arrowDown(x: number, y1: number, y2: number, colour: string) {
  return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2 - 14}" stroke="${colour}" stroke-width="5" stroke-linecap="round"/><polygon points="${x - 12},${y2 - 18} ${x + 12},${y2 - 18} ${x},${y2}" fill="${colour}"/>`;
}

/** Pictures live on the laptop in <project>/pedagogy-images (not in git: partner material stays local). */
export const PEDAGOGY_IMAGE_FOLDER = "pedagogy-images";
const SAFE_IMAGE_NAME = /^[\w.-]+\.(png|jpe?g|webp)$/i;
type LoadedImage = { href: string; width: number; height: number } | null;
const imageCache = new Map<string, Promise<LoadedImage>>();

/** Loads a brief picture once per file. Logs which path ran: the picture, or the placeholder and why. */
export function loadPedagogyImage(file: string, folder = join(process.cwd(), PEDAGOGY_IMAGE_FOLDER)) {
  const key = `${folder}|${file}`;
  let loaded = imageCache.get(key);
  if (!loaded) {
    loaded = (async (): Promise<LoadedImage> => {
      if (!SAFE_IMAGE_NAME.test(file) || basename(file) !== file) {
        console.warn("Pedagogy image", { file, path: "placeholder", reason: "name must be a plain .png, .jpg or .webp file name" });
        return null;
      }
      try {
        const { data, info } = await sharp(await readFile(join(folder, file))).resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
        console.info("Pedagogy image", { file, path: "picture", width: info.width, height: info.height });
        return { href: `data:image/png;base64,${data.toString("base64")}`, width: info.width, height: info.height };
      } catch (error) {
        console.warn("Pedagogy image", { file, path: "placeholder", reason: error instanceof Error ? error.message : String(error) });
        return null;
      }
    })();
    imageCache.set(key, loaded);
  }
  return loaded;
}

/** One SVG fragment per item; element i is drawn from step i + 1. `zoom` marks the centre a new picture grows from. */
export async function infographicElements(kind: InfographicKind, items: string[], imageFolder?: string) {
  const parsed = items.map(splitItem);
  const n = parsed.length;
  const elements: { step: number; svg: string; zoom?: [number, number] }[] = [];
  if (kind === "image") {
    const pictures = await Promise.all(parsed.map((item) => loadPedagogyImage(item.title, imageFolder)));
    // Two wide pictures read better stacked; tall ones sit side by side.
    const wide = pictures.every((picture) => !picture || picture.width > picture.height * 1.2);
    const columns = n === 1 ? 1 : n === 2 && wide ? 1 : 2;
    const rows = Math.ceil(n / columns);
    const gap = 30;
    const width = (BOARD.width - 80 - gap * (columns - 1)) / columns;
    const height = (BOARD.height - 80 - gap * (rows - 1)) / rows;
    for (const [i, item] of parsed.entries()) {
      const x = BOARD.x + 40 + (i % columns) * (width + gap);
      const y = BOARD.y + 40 + Math.floor(i / columns) * (height + gap);
      const caption = item.text ? await fit(item.text, width - 40, 110, 36, 24) : { lines: [], size: 36 };
      const captionHeight = caption.lines.length ? caption.lines.length * caption.size * 1.3 + 20 : 0;
      const picture = pictures[i];
      let body: string;
      let w = width - 20, h = height - captionHeight - 20;
      if (picture) {
        const scale = Math.min(w / picture.width, h / picture.height);
        w = picture.width * scale; h = picture.height * scale;
      }
      // Picture and caption are centred together in the cell, caption right under the picture.
      const top = y + (height - h - captionHeight) / 2;
      const left = x + (width - w) / 2;
      if (picture) {
        body = `<image href="${picture.href}" x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`;
      } else {
        body = `<rect x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="16" fill="none" stroke="#ff8a7a" stroke-width="3" stroke-dasharray="14 10"/>${textBlock([`picture missing: ${item.title}`], x + width / 2, top + h / 2, 30, "#ff8a7a", "middle")}`;
      }
      const captionSvg = textBlock(caption.lines, x + width / 2, top + h + 14 + caption.size, caption.size, "#ffd166", "middle");
      elements.push({ step: i + 1, svg: `${body}${captionSvg}`, zoom: [x + width / 2, y + height / 2] });
    }
  } else if (kind === "flow") {
    const gap = 46;
    const boxHeight = Math.min(130, (BOARD.height - 80 - gap * (n - 1)) / n);
    const width = 980;
    const x = BOARD.x + (BOARD.width - width) / 2;
    for (const [i, item] of parsed.entries()) {
      const y = BOARD.y + 40 + i * (boxHeight + gap);
      const label = item.text ? `${item.title}: ${item.text}` : item.title;
      const { lines, size } = await fit(label, width - 60, boxHeight - 24, 44);
      const top = y + boxHeight / 2 - ((lines.length - 1) * size * 1.3) / 2 + size * 0.35;
      const colour = COLOURS[i % COLOURS.length];
      const arrow = i > 0 ? arrowDown(BOARD.x + BOARD.width / 2, y - gap + 4, y - 2, "#9fb3d1") : "";
      elements.push({ step: i + 1, svg: `${arrow}<rect x="${x}" y="${y.toFixed(1)}" width="${width}" height="${boxHeight.toFixed(1)}" rx="16" fill="#22304f" stroke="${colour}" stroke-width="3"/>${textBlock(lines, BOARD.x + BOARD.width / 2, top, size, "#eef1f7", "middle")}` });
    }
  } else if (kind === "cards") {
    const columns = n <= 3 ? 1 : 2;
    const rows = Math.ceil(n / columns);
    const gap = 30;
    const width = (BOARD.width - 80 - gap * (columns - 1)) / columns;
    const height = (BOARD.height - 80 - gap * (rows - 1)) / rows;
    for (const [i, item] of parsed.entries()) {
      const x = BOARD.x + 40 + (i % columns) * (width + gap);
      const y = BOARD.y + 40 + Math.floor(i / columns) * (height + gap);
      const colour = COLOURS[i % COLOURS.length];
      const title = await fit(item.title, width - 50, Math.min(120, height * 0.4), 44);
      const titleHeight = title.lines.length * title.size * 1.3;
      const body = item.text ? await fit(item.text, width - 50, height - titleHeight - 50, 40) : { lines: [], size: 40 };
      elements.push({ step: i + 1, svg: `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="18" fill="#22304f" stroke="${colour}" stroke-width="3"/><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="12" height="${height.toFixed(1)}" rx="6" fill="${colour}"/>${textBlock(title.lines, x + 34, y + 20 + title.size, title.size, colour)}${textBlock(body.lines, x + 34, y + 34 + titleHeight + body.size, body.size, "#eef1f7")}` });
    }
  } else if (kind === "timeline") {
    const lineX = BOARD.x + 210;
    const spacing = (BOARD.height - 120) / Math.max(1, n);
    elements.push({ step: 1, svg: `<line x1="${lineX}" y1="${BOARD.y + 50}" x2="${lineX}" y2="${BOARD.y + BOARD.height - 50}" stroke="#33415c" stroke-width="6" stroke-linecap="round"/>` });
    for (const [i, item] of parsed.entries()) {
      const y = BOARD.y + 60 + spacing * (i + 0.5);
      const colour = COLOURS[i % COLOURS.length];
      const body = await fit(item.text || item.title, BOARD.width - 330, spacing - 20, 40);
      const top = y - ((body.lines.length - 1) * body.size * 1.3) / 2 + body.size * 0.35;
      elements.push({ step: i + 1, svg: `<text x="${lineX - 40}" y="${(y + 14).toFixed(1)}" text-anchor="end" font-family="${SERIF}" font-size="40" fill="${colour}">${escapeXml(item.text ? item.title : "")}</text><circle cx="${lineX}" cy="${y.toFixed(1)}" r="16" fill="${colour}"/>${textBlock(body.lines, lineX + 44, top, body.size, "#eef1f7")}` });
    }
  } else {
    const width = (BOARD.width - 110) / 2;
    for (const [i, item] of parsed.entries()) {
      const x = BOARD.x + 40 + i * (width + 30);
      const y = BOARD.y + 40;
      const height = BOARD.height - 80;
      const colour = i === 0 ? "#4fa3ff" : "#7fe08a";
      const title = await fit(item.title, width - 60, 140, 52);
      const titleHeight = title.lines.length * title.size * 1.3;
      const body = await fit(item.text, width - 60, height - titleHeight - 90, 46);
      const boxHeight = Math.min(height, 120 + titleHeight + body.lines.length * body.size * 1.3 + 40);
      elements.push({ step: i + 1, svg: `<rect x="${x.toFixed(1)}" y="${y}" width="${width.toFixed(1)}" height="${boxHeight.toFixed(1)}" rx="20" fill="#22304f" stroke="${colour}" stroke-width="3"/>${textBlock(title.lines, x + width / 2, y + 30 + title.size, title.size, colour, "middle")}<line x1="${(x + 40).toFixed(1)}" y1="${(y + 50 + titleHeight).toFixed(1)}" x2="${(x + width - 40).toFixed(1)}" y2="${(y + 50 + titleHeight).toFixed(1)}" stroke="${colour}" stroke-width="2"/>${textBlock(body.lines, x + 30, y + 90 + titleHeight + body.size * 0.3, body.size, "#eef1f7")}` });
    }
  }
  return elements;
}
