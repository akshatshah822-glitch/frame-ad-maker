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
 *   table     "Growth = Development | Physical = All-round"   first item is the header row, then one row per item
 *   hub       "Child = 5 aspects | Physical = clay, sand"    first item in the centre, the rest around it (mind map)
 *   venn      "Growth = size | Development = behaviour"      2 or 3 overlapping circles; optional last item = the overlap
 *   stairs    "0-2 = Sensorimotor | 2-7 = Preoperational"    steps rising left to right, one per item
 * Any item of cards, timeline, compare, table or stairs can end with "@ picture.png" (from the pedagogy-images
 * folder): the picture is drawn inside that item's box, e.g. "Infancy = birth to 2 weeks @ infant.png".
 *   image     "potter.png = Clay is shaped when it is ready"  pictures from the pedagogy-images folder, caption optional;
 *             the newest picture fades in and zooms up to full size
 * One item appears per step (diagram_step), in the order written, like a teacher writing on the board.
 */
export const INFOGRAPHIC_KINDS = ["flow", "cards", "timeline", "compare", "image", "table", "hub", "venn", "stairs"] as const;
export type InfographicKind = (typeof INFOGRAPHIC_KINDS)[number];
export const INFOGRAPHIC_MAX_ITEMS: Record<InfographicKind, number> = { flow: 6, cards: 6, timeline: 6, compare: 2, image: 4, table: 8, hub: 7, venn: 4, stairs: 6 };

export function isInfographic(name: string): name is InfographicKind {
  return (INFOGRAPHIC_KINDS as readonly string[]).includes(name);
}

export function infographicItems(text: string) {
  return text.split("|").map((item) => item.trim()).filter(Boolean);
}

type Item = { title: string; text: string; picture?: string };
/** "Title = text @ picture.png": the optional picture goes inside that item's box. */
const ITEM_PICTURE = /\s*@\s*([\w.-]+\.(?:png|jpe?g|webp))\s*$/i;
function splitItem(raw: string): Item {
  const picture = ITEM_PICTURE.exec(raw)?.[1];
  const item = picture ? raw.replace(ITEM_PICTURE, "") : raw;
  const at = item.indexOf("=");
  const parts = at < 0 ? { title: item.trim(), text: "" } : { title: item.slice(0, at).trim(), text: item.slice(at + 1).trim() };
  return picture ? { ...parts, picture } : parts;
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

/** A picture fitted inside a box on a small white card; a visible placeholder if the file is missing. */
async function framedPicture(file: string, box: { x: number; y: number; w: number; h: number }, id: string, folder?: string) {
  const picture = await loadPedagogyImage(file, folder);
  const pad = 7;
  if (!picture) {
    return `<rect x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.w.toFixed(1)}" height="${box.h.toFixed(1)}" rx="12" fill="none" stroke="#ff8a7a" stroke-width="2" stroke-dasharray="8 6"/><text x="${(box.x + box.w / 2).toFixed(1)}" y="${(box.y + box.h / 2).toFixed(1)}" text-anchor="middle" font-family="${SERIF}" font-size="18" fill="#ff8a7a">missing: ${escapeXml(file)}</text>`;
  }
  const scale = Math.min((box.w - pad * 2) / picture.width, (box.h - pad * 2) / picture.height);
  const w = picture.width * scale, h = picture.height * scale;
  const x = box.x + (box.w - w) / 2, y = box.y + (box.h - h) / 2;
  return `<defs><clipPath id="${id}"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="8"/></clipPath></defs>`
    + `<rect x="${(x - pad).toFixed(1)}" y="${(y - pad).toFixed(1)}" width="${(w + pad * 2).toFixed(1)}" height="${(h + pad * 2).toFixed(1)}" rx="12" fill="#ffffff"/>`
    + `<image href="${picture.href}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${id})"/>`;
}

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
        const { data, info } = await sharp(await readFile(join(folder, file))).resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
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
      let w = width - 60, h = height - captionHeight - 60;
      if (picture) {
        const scale = Math.min(w / picture.width, h / picture.height);
        w = picture.width * scale; h = picture.height * scale;
      }
      // Picture and caption are centred together in the cell, caption right under the picture.
      const top = y + (height - h - captionHeight) / 2;
      const left = x + (width - w) / 2;
      if (picture) {
        // The picture sits on a white rounded card with a soft shadow, so cut edges never show.
        const pad = 14, clip = `pic-${i}`;
        const cx = left - pad, cy = top - pad, cw = w + pad * 2, ch = h + pad * 2;
        body = `<defs><clipPath id="${clip}"><rect x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="12"/></clipPath><filter id="${clip}-shadow" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="12"/></filter></defs>`
          + `<rect x="${(cx + 4).toFixed(1)}" y="${(cy + 12).toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" rx="22" fill="#000" opacity="0.45" filter="url(#${clip}-shadow)"/>`
          + `<rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" rx="22" fill="#ffffff"/>`
          + `<image href="${picture.href}" x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clip})"/>`;
      } else {
        body = `<rect x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="16" fill="none" stroke="#ff8a7a" stroke-width="3" stroke-dasharray="14 10"/>${textBlock([`picture missing: ${item.title}`], x + width / 2, top + h / 2, 30, "#ff8a7a", "middle")}`;
      }
      const captionSvg = textBlock(caption.lines, x + width / 2, top + h + 30 + caption.size, caption.size, "#ffd166", "middle");
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
      // A card with a picture keeps its words on the left and the picture on the right.
      const pw = item.picture ? Math.min(width * 0.45, (height - 30) * 1.4) : 0;
      const textWidth = width - 50 - (pw ? pw + 16 : 0);
      const pictureSvg = item.picture ? await framedPicture(item.picture, { x: x + width - pw - 14, y: y + 14, w: pw, h: height - 28 }, `cd-${i}`, imageFolder) : "";
      const title = await fit(item.title, textWidth, Math.min(120, height * 0.4), 44);
      const titleHeight = title.lines.length * title.size * 1.3;
      const body = item.text ? await fit(item.text, textWidth, height - titleHeight - 50, 40) : { lines: [], size: 40 };
      elements.push({ step: i + 1, svg: `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="18" fill="#22304f" stroke="${colour}" stroke-width="3"/><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="12" height="${height.toFixed(1)}" rx="6" fill="${colour}"/>${textBlock(title.lines, x + 34, y + 20 + title.size, title.size, colour)}${textBlock(body.lines, x + 34, y + 34 + titleHeight + body.size, body.size, "#eef1f7")}${pictureSvg}`, zoom: item.picture ? [x + width / 2, y + height / 2] : undefined });
    }
  } else if (kind === "timeline") {
    const lineX = BOARD.x + 210;
    const spacing = (BOARD.height - 120) / Math.max(1, n);
    elements.push({ step: 1, svg: `<line x1="${lineX}" y1="${BOARD.y + 50}" x2="${lineX}" y2="${BOARD.y + BOARD.height - 50}" stroke="#33415c" stroke-width="6" stroke-linecap="round"/>` });
    for (const [i, item] of parsed.entries()) {
      const y = BOARD.y + 60 + spacing * (i + 0.5);
      const colour = COLOURS[i % COLOURS.length];
      const ph = item.picture ? Math.min(spacing - 10, 150) : 0, pw = ph * 1.2;
      const pictureSvg = item.picture ? await framedPicture(item.picture, { x: BOARD.x + BOARD.width - 30 - pw, y: y - ph / 2, w: pw, h: ph }, `tl-${i}`, imageFolder) : "";
      const body = await fit(item.text || item.title, BOARD.width - 330 - (pw ? pw + 30 : 0), spacing - 20, 40);
      const top = y - ((body.lines.length - 1) * body.size * 1.3) / 2 + body.size * 0.35;
      elements.push({ step: i + 1, svg: `<text x="${lineX - 40}" y="${(y + 14).toFixed(1)}" text-anchor="end" font-family="${SERIF}" font-size="40" fill="${colour}">${escapeXml(item.text ? item.title : "")}</text><circle cx="${lineX}" cy="${y.toFixed(1)}" r="16" fill="${colour}"/>${textBlock(body.lines, lineX + 44, top, body.size, "#eef1f7")}${pictureSvg}`, zoom: item.picture ? [BOARD.x + BOARD.width / 2, y] : undefined });
    }
  } else if (kind === "table") {
    const [left, right] = [0.42, 0.58].map((share) => (BOARD.width - 80) * share);
    const x = BOARD.x + 40;
    const rowHeight = Math.min(parsed.some((item) => item.picture) ? 150 : 130, (BOARD.height - 80) / n);
    for (const [i, item] of parsed.entries()) {
      const y = BOARD.y + 40 + i * rowHeight;
      const header = i === 0;
      const size = header ? 40 : 34;
      const tw = item.picture ? rowHeight - 12 : 0;
      const pictureSvg = item.picture ? await framedPicture(item.picture, { x: x + 10, y: y + 6, w: tw, h: tw }, `tb-${i}`, imageFolder) : "";
      const a = await fit(item.title, left - 40 - (tw ? tw + 12 : 0), rowHeight - 16, size, 22);
      const b = await fit(item.text, right - 40, rowHeight - 16, size, 22);
      const lineTop = (block: { lines: string[]; size: number }) => y + rowHeight / 2 - ((block.lines.length - 1) * block.size * 1.3) / 2 + block.size * 0.35;
      const fill = header ? "#2b3f6b" : i % 2 ? "#1d2a47" : "#22304f";
      const bColour = header ? "#7fe08a" : "#eef1f7";
      const aColour = header ? "#4fa3ff" : "#ffd166";
      elements.push({ step: i + 1, svg: `<rect x="${x}" y="${y.toFixed(1)}" width="${left + right}" height="${rowHeight.toFixed(1)}" rx="${header ? 14 : 0}" fill="${fill}"/><line x1="${x + left}" y1="${y.toFixed(1)}" x2="${x + left}" y2="${(y + rowHeight).toFixed(1)}" stroke="#33415c" stroke-width="2"/>${pictureSvg}${textBlock(a.lines, x + 24 + (tw ? tw + 8 : 0), lineTop(a), a.size, aColour)}${textBlock(b.lines, x + left + 24, lineTop(b), b.size, bColour)}` });
    }
  } else if (kind === "hub") {
    const cx = BOARD.x + BOARD.width / 2, cy = BOARD.y + BOARD.height / 2;
    const [centre, ...spokes] = parsed;
    const centreText = await fit(centre.text ? `${centre.title}: ${centre.text}` : centre.title, 250, 150, 40, 24);
    const centreTop = cy - ((centreText.lines.length - 1) * centreText.size * 1.3) / 2 + centreText.size * 0.35;
    elements.push({ step: 1, svg: `<circle cx="${cx}" cy="${cy}" r="150" fill="#2b3f6b" stroke="#ffd166" stroke-width="5"/>${textBlock(centreText.lines, cx, centreTop, centreText.size, "#ffd166", "middle")}`, zoom: [cx, cy] });
    const rx = 395, ry = 320, boxW = 360, boxH = 170;
    for (const [i, item] of spokes.entries()) {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / spokes.length;
      const bx = cx + rx * Math.cos(angle), by = cy + ry * Math.sin(angle);
      const colour = COLOURS[i % COLOURS.length];
      const title = await fit(item.title, boxW - 30, 54, 40, 24);
      const body = item.text ? await fit(item.text, boxW - 30, boxH - 34 - title.lines.length * title.size * 1.3, 32, 20) : { lines: [], size: 28 };
      const top = by - boxH / 2;
      const lx = cx + 150 * Math.cos(angle), ly = cy + 150 * Math.sin(angle);
      elements.push({ step: i + 2, svg: `<line x1="${lx.toFixed(1)}" y1="${ly.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${colour}" stroke-width="4" stroke-dasharray="10 8"/><rect x="${(bx - boxW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${boxW}" height="${boxH}" rx="18" fill="#22304f" stroke="${colour}" stroke-width="3"/>${textBlock(title.lines, bx, top + 18 + title.size, title.size, colour, "middle")}${textBlock(body.lines, bx, top + 30 + title.lines.length * title.size * 1.3 + body.size, body.size, "#eef1f7", "middle")}`, zoom: [bx, by] });
    }
  } else if (kind === "venn") {
    const circles = parsed.slice(0, Math.min(3, n));
    const overlap = n === 4 ? parsed[3] : null;
    const r = circles.length === 2 ? 300 : 255;
    const cx = BOARD.x + BOARD.width / 2, cy = BOARD.y + BOARD.height / 2 + (circles.length === 3 ? 30 : 0);
    const centres: [number, number][] = circles.length === 2
      ? [[cx - 170, cy], [cx + 170, cy]]
      : [[cx, cy - 170], [cx - 190, cy + 130], [cx + 190, cy + 130]];
    const labelAt = (i: number): [number, number] => {
      const [x, y] = centres[i];
      return [x + (x - cx) * (circles.length === 2 ? 0.75 : 0.5), y + (y - cy) * 0.5 + (circles.length === 2 ? -40 : 0)];
    };
    for (const [i, item] of circles.entries()) {
      const colour = COLOURS[i % COLOURS.length];
      const [x, y] = centres[i];
      const [lx, ly] = labelAt(i);
      const title = await fit(item.title, 230, 60, 40, 24);
      const body = item.text ? await fit(item.text, 210, 120, 30, 20) : { lines: [], size: 28 };
      elements.push({ step: i + 1, svg: `<circle cx="${x}" cy="${y}" r="${r}" fill="${colour}" fill-opacity="0.18" stroke="${colour}" stroke-width="4"/>${textBlock(title.lines, lx, ly - 20, title.size, colour, "middle")}${textBlock(body.lines, lx, ly + 22 + body.size * 0.5, body.size, "#eef1f7", "middle")}`, zoom: [x, y] });
    }
    if (overlap) {
      const label = await fit(overlap.text ? `${overlap.title}: ${overlap.text}` : overlap.title, 150, 130, 30, 18);
      elements.push({ step: 4, svg: `<circle cx="${cx}" cy="${cy - 10}" r="96" fill="#101a30" stroke="#ffd166" stroke-width="3"/>${textBlock(label.lines, cx, cy - 10 - ((label.lines.length - 1) * label.size * 1.3) / 2 + label.size * 0.35, label.size, "#ffd166", "middle")}`, zoom: [cx, cy] });
    }
  } else if (kind === "stairs") {
    const gap = 14;
    const stepW = (BOARD.width - 80 - gap * (n - 1)) / n;
    // Blocks with pictures start taller so the picture and the words both fit.
    const base = parsed.some((item) => item.picture) ? 340 : 200;
    const rise = Math.min(120, (BOARD.height - 180 - base) / Math.max(1, n - 1));
    for (const [i, item] of parsed.entries()) {
      const x = BOARD.x + 40 + i * (stepW + gap);
      const blockTop = BOARD.y + BOARD.height - 60 - base - i * rise;
      const colour = COLOURS[i % COLOURS.length];
      const title = await fit(item.title, stepW - 24, 90, 34, 20);
      const pictureH = item.picture ? Math.min(150, stepW * 0.8) : 0;
      const pictureSvg = item.picture ? await framedPicture(item.picture, { x: x + 10, y: blockTop + 22, w: stepW - 20, h: pictureH }, `st-${i}`, imageFolder) : "";
      const body = item.text ? await fit(item.text, stepW - 24, base + i * rise - 50 - pictureH, 34, 18) : { lines: [], size: 28 };
      const height = BOARD.y + BOARD.height - 40 - blockTop;
      const labelTop = blockTop - 18 - (title.lines.length - 1) * title.size * 1.3;
      const arrow = i < n - 1 ? `<path d="M ${(x + stepW * 0.55).toFixed(1)} ${(labelTop - title.size - 10).toFixed(1)} q ${(stepW * 0.4).toFixed(1)} ${(-rise * 0.9).toFixed(1)} ${(stepW * 0.8).toFixed(1)} ${(-rise * 0.3).toFixed(1)}" fill="none" stroke="#9fb3d1" stroke-width="3" stroke-dasharray="8 6"/>` : "";
      elements.push({ step: i + 1, svg: `<rect x="${x.toFixed(1)}" y="${blockTop.toFixed(1)}" width="${stepW.toFixed(1)}" height="${height.toFixed(1)}" rx="14" fill="#22304f" stroke="${colour}" stroke-width="3"/><rect x="${x.toFixed(1)}" y="${blockTop.toFixed(1)}" width="${stepW.toFixed(1)}" height="12" rx="6" fill="${colour}"/>${textBlock(title.lines, x + stepW / 2, labelTop, title.size, colour, "middle")}${pictureSvg}${textBlock(body.lines, x + stepW / 2, blockTop + 40 + pictureH + body.size * 0.6, body.size, "#eef1f7", "middle")}${arrow}`, zoom: [x + stepW / 2, blockTop + height / 2] });
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
      const pictureH = item.picture ? 300 : 0;
      const pictureSvg = item.picture ? await framedPicture(item.picture, { x: x + 30, y: y + 70 + titleHeight, w: width - 60, h: pictureH }, `cp-${i}`, imageFolder) : "";
      const body = await fit(item.text, width - 60, height - titleHeight - 90 - (pictureH ? pictureH + 40 : 0), 46);
      const boxHeight = Math.min(height, 120 + titleHeight + pictureH + body.lines.length * body.size * 1.3 + 40);
      elements.push({ step: i + 1, svg: `<rect x="${x.toFixed(1)}" y="${y}" width="${width.toFixed(1)}" height="${boxHeight.toFixed(1)}" rx="20" fill="#22304f" stroke="${colour}" stroke-width="3"/>${textBlock(title.lines, x + width / 2, y + 30 + title.size, title.size, colour, "middle")}<line x1="${(x + 40).toFixed(1)}" y1="${(y + 50 + titleHeight).toFixed(1)}" x2="${(x + width - 40).toFixed(1)}" y2="${(y + 50 + titleHeight).toFixed(1)}" stroke="${colour}" stroke-width="2"/>${pictureSvg}${textBlock(body.lines, x + 30, y + 90 + titleHeight + (pictureH ? pictureH + 40 : 0) + body.size * 0.3, body.size, "#eef1f7")}` });
    }
  }
  return elements;
}
