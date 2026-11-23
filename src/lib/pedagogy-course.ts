// Course look (theme = course), exam-question (pedagogy) path only.
// For spoken-language course videos: every board sits on the cream notebook card of the recap board, on the dark
// background of the chapter card. No exam chrome (no "EXAM EXPLAINER", watermark, time label or running track).
// Flashcards, steps and numbers appear one by one; host pictures fill the whole screen with a small caption.
import sharp from "sharp";
import { textWidth } from "@/lib/pedagogy-page";
import type { PedagogyCard, PedagogyNumber, PedagogyVisual } from "@/lib/pedagogy-visual";

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 12;
const FONT = "Inter, 'Noto Sans Gujarati', 'Gujarati Sangam MN', 'Noto Sans', Arial, sans-serif";
const INK = "#0b1020";
const BODY = "#3a4357";
const YELLOW = "#ffd166";
const CARD = { x: 140, y: 50, w: WIDTH - 280, h: HEIGHT - 100 };
/** Inside the card: left edge after the margin line, right edge, and where content starts under the title. */
const INNER = { left: CARD.x + 96, right: CARD.x + CARD.w - 96, top: CARD.y + 210, bottom: CARD.y + CARD.h - 60 };
const TILE_COLOURS = ["#fff1c2", "#dcecff", "#dcf5e3", "#ffe3dc"];
// Gujarati letters are not \w, so no \b here: the word must be the whole card title.
const WRONG = /^\s*(ખોટું|wrong)\s*$/i;
const RIGHT = /^\s*(સાચું|right|correct)\s*$/i;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeOut = (t: number) => 1 - (1 - clamp(t)) ** 3;
const escapeXml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

export type CourseFrame = { png: Buffer; duration: number };

/** Greedy word wrap using the real drawn width; a single word wider than the line is kept whole. */
export async function wrapText(text: string, size: number, weight: number, maxWidth: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && (await textWidth(next, size, weight)) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Largest size (from `sizes`, big to small) at which the text fits in `maxLines` lines of `maxWidth`. */
async function fitText(text: string, sizes: number[], weight: number, maxWidth: number, maxLines: number) {
  for (const size of sizes) {
    const lines = await wrapText(text, size, weight, maxWidth);
    const widest = Math.max(0, ...(await Promise.all(lines.map((line) => textWidth(line, size, weight)))));
    if (lines.length <= maxLines && widest <= maxWidth) return { size, lines };
  }
  const size = sizes[sizes.length - 1];
  return { size, lines: await wrapText(text, size, weight, maxWidth) };
}

/** One size for a whole board: the largest size at which every text fits (so boxes never mix font sizes). */
async function sharedFit(texts: string[], sizes: number[], weight: number, maxWidth: number, maxLines: number) {
  let size = sizes[0];
  for (const text of texts) if (text.trim()) size = Math.min(size, (await fitText(text, sizes.filter((s) => s <= size), weight, maxWidth, maxLines)).size);
  return { size, lines: await Promise.all(texts.map((text) => wrapText(text, size, weight, maxWidth))) };
}

function textLines(lines: string[], x: number, firstBaseline: number, size: number, weight: number, fill: string, anchor: "start" | "middle" = "start", leading = 1.25) {
  return lines.map((line, index) => `<text x="${x.toFixed(1)}" y="${(firstBaseline + index * size * leading).toFixed(1)}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" xml:space="preserve">${escapeXml(line)}</text>`).join("");
}

/** The cream notebook card with its red margin line, a yellow label pill and the board title. */
async function cardShell(title: string, pill: string) {
  const heading = await fitText(title, [60, 52, 46], 800, INNER.right - INNER.left, 1);
  const pillWidth = Math.max(170, (await textWidth(pill, 23, 800)) + 56);
  return `<defs><filter id="s" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="20"/></filter></defs>
    <rect x="${CARD.x + 8}" y="${CARD.y + 18}" width="${CARD.w}" height="${CARD.h}" rx="26" fill="#000" fill-opacity="0.55" filter="url(#s)"/>
    <rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="26" fill="#fbf7ec"/>
    <rect x="${CARD.x + 66}" y="${CARD.y}" width="3" height="${CARD.h}" fill="#e8a0a0" fill-opacity="0.7"/>
    ${pill ? `<rect x="${INNER.left}" y="${CARD.y + 44}" width="${pillWidth.toFixed(0)}" height="42" rx="21" fill="${YELLOW}"/><text x="${(INNER.left + pillWidth / 2).toFixed(1)}" y="${CARD.y + 72}" text-anchor="middle" font-family="${FONT}" font-size="23" font-weight="800" fill="${INK}">${escapeXml(pill)}</text>` : ""}
    ${textLines(heading.lines.slice(0, 1), INNER.left, CARD.y + 160, heading.size, 800, INK)}`;
}

async function render(svgBody: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="${INK}"/>${svgBody}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** One flashcard tile: English (front) on top, its meaning (back) under a dashed fold; wrong/right cards get a mark. */
async function tile(card: PedagogyCard, index: number, x: number, y: number, w: number, h: number, sizes: { front: number; back: number }, appear: number) {
  if (appear <= 0) return "";
  const wrong = WRONG.test(card.title), right = RIGHT.test(card.title);
  const fill = wrong ? "#ffe1dc" : right ? "#dcf5e3" : TILE_COLOURS[index % TILE_COLOURS.length];
  const pad = 34, badge = wrong || right ? 64 : 0; // the ✓/✗ badge sits top right, so the first lines keep clear of it
  const inner = w - pad * 2 - badge;
  const hasBack = card.body.trim() !== "";
  const front = { size: sizes.front, lines: await wrapText(card.title, sizes.front, 800, inner) };
  const back = hasBack ? { size: sizes.back, lines: await wrapText(card.body, sizes.back, 600, inner) } : { size: 0, lines: [] as string[] };
  const frontHeight = front.lines.length * front.size * 1.25;
  const backHeight = back.lines.length * back.size * 1.25;
  const gap = hasBack ? 44 : 0;
  const top = y + (h - frontHeight - gap - backHeight) / 2 + front.size * 0.9;
  const fold = top + frontHeight - front.size * 0.9 + gap / 2 - 6;
  const rise = (1 - easeOut(appear)) * 30;
  const mark = wrong
    ? `<circle cx="${x + w - pad - 22}" cy="${y + pad + 20}" r="24" fill="#d64545"/><path d="M${x + w - pad - 32} ${y + pad + 10} l20 20 M${x + w - pad - 12} ${y + pad + 10} l-20 20" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`
    : right
      ? `<circle cx="${x + w - pad - 22}" cy="${y + pad + 20}" r="24" fill="#2e7d4f"/><path d="M${x + w - pad - 33} ${y + pad + 20} l8 8 l14 -16" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
      : "";
  return `<g opacity="${clamp(appear * 1.4).toFixed(3)}" transform="translate(0 ${rise.toFixed(1)})">
    <rect x="${x + 4}" y="${y + 8}" width="${w}" height="${h}" rx="22" fill="#000" fill-opacity="0.12"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="${fill}"/>
    ${textLines(front.lines, x + pad, top, front.size, 800, INK)}
    ${hasBack ? `<line x1="${x + pad}" y1="${fold.toFixed(1)}" x2="${x + w - pad}" y2="${fold.toFixed(1)}" stroke="${INK}" stroke-opacity="0.25" stroke-width="3" stroke-dasharray="10 10"/>${textLines(back.lines, x + pad, fold + gap / 2 + back.size * 0.95, back.size, 600, BODY)}` : ""}
    ${mark}</g>`;
}

/** Flashcards: 1 or 2 cards as big tiles side by side, 3 or 4 as full-width rows. `shown` counts cards in (fractional). */
export async function courseCardsSlide(title: string, cards: PedagogyCard[], shown: number) {
  const parts = [await cardShell(title, "ફ્લેશકાર્ડ")];
  const areaW = INNER.right - INNER.left, areaH = INNER.bottom - INNER.top;
  const marked = cards.some((card) => WRONG.test(card.title) || RIGHT.test(card.title));
  const textWidthIn = (w: number) => w - 68 - (marked ? 64 : 0);
  if (cards.length <= 2) {
    const gap = 48, w = cards.length === 1 ? Math.min(1240, areaW) : (areaW - gap) / 2, h = Math.min(560, areaH);
    const x0 = cards.length === 1 ? INNER.left + (areaW - w) / 2 : INNER.left;
    const front = (await sharedFit(cards.map((card) => card.title), [64, 56, 48, 42], 800, textWidthIn(w), 2)).size;
    const back = (await sharedFit(cards.map((card) => card.body), [52, 46, 40, 36], 600, textWidthIn(w), 2)).size;
    for (const [index, card] of cards.entries()) parts.push(await tile(card, index, x0 + index * (w + gap), INNER.top + (areaH - h) / 2, w, h, { front, back }, shown - index));
  } else {
    const gap = 22, h = (areaH - gap * (cards.length - 1)) / cards.length;
    const front = (await sharedFit(cards.map((card) => card.title), [44, 40, 36], 800, textWidthIn(areaW), 1)).size;
    const back = (await sharedFit(cards.map((card) => card.body), [38, 34, 30], 600, textWidthIn(areaW), 1)).size;
    for (const [index, card] of cards.entries()) parts.push(await tile(card, index, INNER.left, INNER.top + index * (h + gap), areaW, h, { front, back }, shown - index));
  }
  return render(parts.join(""));
}

/** Steps: numbered boxes in one row joined by arrows (2 to 6 steps). `shown` counts steps in. */
export async function courseFlowSlide(title: string, steps: string[], shown: number) {
  const parts = [await cardShell(title, "પગલાં")];
  const areaW = INNER.right - INNER.left, areaH = INNER.bottom - INNER.top;
  const arrow = 70, w = (areaW - arrow * (steps.length - 1)) / steps.length, h = 340;
  const y = INNER.top + (areaH - h) / 2;
  const fitted = await sharedFit(steps, [46, 40, 36, 32, 28], 700, w - 40, 3);
  for (const index of steps.keys()) {
    const appear = shown - index;
    if (appear <= 0) continue;
    const x = INNER.left + index * (w + arrow);
    const text = { size: fitted.size, lines: fitted.lines[index] };
    const textTop = y + 90 + (h - 110 - text.lines.length * text.size * 1.22) / 2 + text.size * 0.9;
    const a = easeOut(appear), rise = (1 - a) * 24;
    const link = index > 0
      ? `<path d="M${x - arrow + 12} ${y + h / 2} h${arrow - 30}" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M${x - 22} ${y + h / 2 - 13} l14 13 l-14 13" stroke="${INK}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
      : "";
    parts.push(`<g opacity="${clamp(a * 1.4).toFixed(3)}" transform="translate(0 ${rise.toFixed(1)})">${link}
      <rect x="${x + 4}" y="${y + 8}" width="${w}" height="${h}" rx="24" fill="#000" fill-opacity="0.12"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="${TILE_COLOURS[index % TILE_COLOURS.length]}"/>
      <circle cx="${x + w / 2}" cy="${y + 54}" r="30" fill="${INK}"/><text x="${x + w / 2}" y="${y + 66}" text-anchor="middle" font-family="${FONT}" font-size="32" font-weight="800" fill="${YELLOW}">${index + 1}</text>
      ${textLines(text.lines, x + w / 2, textTop, text.size, 700, INK, "middle", 1.22)}</g>`);
  }
  return render(parts.join(""));
}

const formatAmount = (amount: PedagogyNumber, t: number) => `${amount.prefix}${(amount.value * easeOut(t)).toFixed(amount.decimals)}${amount.suffix ? ` ${amount.suffix.trim()}` : ""}`;

/** A big number that counts up, with the board's words under it. */
export async function courseCounterSlide(title: string, amount: PedagogyNumber, t: number) {
  const text = formatAmount(amount, t);
  const big = await fitText(formatAmount(amount, 1), [220, 190, 160, 130], 800, INNER.right - INNER.left - 80, 1);
  const cx = (INNER.left + INNER.right) / 2, baseline = INNER.top + (INNER.bottom - INNER.top) / 2 + big.size * 0.32;
  const underline = Math.min(INNER.right - INNER.left - 80, (await textWidth(formatAmount(amount, 1), big.size, 800)) + 60);
  return render(`${await cardShell(title, "યાદ રાખો")}
    <rect x="${(cx - underline / 2).toFixed(1)}" y="${(baseline + 26).toFixed(1)}" width="${underline.toFixed(1)}" height="22" rx="11" fill="${YELLOW}" fill-opacity="${clamp(t * 1.5).toFixed(3)}"/>
    ${textLines([text], cx, baseline, big.size, 800, INK, "middle")}`);
}

/** A line of the board on its own, large and centred on the card (no pill, no title). */
export async function courseTextSlide(board: string, t: number) {
  const text = await fitText(board, [96, 84, 72, 60], 800, INNER.right - INNER.left - 80, 3);
  const blockH = text.lines.length * text.size * 1.25;
  const first = CARD.y + CARD.h / 2 - blockH / 2 + text.size * 0.9;
  const a = easeOut(t);
  const cx = CARD.x + CARD.w / 2;
  return render(`${await cardShell("", "")}
    <g opacity="${clamp(a * 1.3).toFixed(3)}" transform="translate(0 ${((1 - a) * 24).toFixed(1)})">
      <rect x="${cx - 90}" y="${(first - text.size - 60).toFixed(1)}" width="180" height="10" rx="5" fill="${YELLOW}"/>
      ${textLines(text.lines, cx, first, text.size, 800, INK, "middle")}</g>`);
}

/** A host picture over the whole screen, with its caption in a small dark pill at the bottom left. */
export async function coursePictureSlide(picture: string | null | undefined, caption: string, file: string) {
  if (!picture) {
    console.warn("Pedagogy course picture", { path: "missing-picture-card", file });
    return courseTextSlide(caption || file, 1);
  }
  const words = caption.trim();
  const capSize = 40, capW = words ? (await textWidth(words, capSize, 700)) + 80 : 0;
  const pill = words ? `<rect x="70" y="${HEIGHT - 150}" width="${capW.toFixed(0)}" height="80" rx="40" fill="${INK}" fill-opacity="0.78"/><rect x="70" y="${HEIGHT - 150}" width="12" height="80" rx="6" fill="${YELLOW}"/>${textLines([words], 110, HEIGHT - 96, capSize, 700, "#ffffff")}` : "";
  return render(`<image href="${picture}" xlink:href="${picture}" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" preserveAspectRatio="xMidYMid slice"/>${pill}`);
}

/** Frames that build in over `reveal` seconds (at 12 fps), then one held frame for the rest of the line. */
async function buildIn(make: (t: number) => Promise<Buffer>, reveal: number, allocatedDuration: number): Promise<CourseFrame[]> {
  const seconds = Math.min(reveal, allocatedDuration * 0.6);
  const count = Math.max(1, Math.round(seconds * FPS));
  const frames: CourseFrame[] = [];
  for (let index = 0; index < count; index += 1) frames.push({ png: await make((index + 1) / count), duration: 1 / FPS });
  frames.push({ png: await make(1), duration: Math.max(1 / FPS, allocatedDuration - count / FPS) });
  return frames;
}

/** Course-look frames for a visual row, or null when the course look has no board for this kind (the caller logs it). */
export async function createCourseFrames(visual: PedagogyVisual, board: string, allocatedDuration: number, pictures: Map<string, string | null>, holds = false): Promise<CourseFrame[] | null> {
  const once = async (png: Promise<Buffer>) => [{ png: await png, duration: allocatedDuration }];
  switch (visual.kind) {
    case "cards":
      return holds ? once(courseCardsSlide(board, visual.cards, visual.cards.length)) : buildIn((t) => courseCardsSlide(board, visual.cards, t * visual.cards.length), visual.cards.length * 0.5, allocatedDuration);
    case "flowchart":
      return holds ? once(courseFlowSlide(board, visual.steps, visual.steps.length)) : buildIn((t) => courseFlowSlide(board, visual.steps, t * visual.steps.length), visual.steps.length * 0.6, allocatedDuration);
    case "counter":
      return holds ? once(courseCounterSlide(board, visual.amount, 1)) : buildIn((t) => courseCounterSlide(board, visual.amount, t), 1.2, allocatedDuration);
    case "text":
      return buildIn((t) => courseTextSlide(board, t), 0.6, allocatedDuration);
    case "picture":
      return once(coursePictureSlide(pictures.get(visual.file), visual.caption, visual.file));
    default:
      return null;
  }
}
