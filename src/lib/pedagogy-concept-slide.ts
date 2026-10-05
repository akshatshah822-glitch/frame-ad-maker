import sharp from "sharp";
import { emphasisPhrases } from "@/lib/pedagogy-emphasis";
import { phraseRanges } from "@/lib/pedagogy-passage-slide";

/**
 * "Concept" layout for teaching a topic (not solving a question): the topic name on top and
 * one large notes card. No QUESTION / SOLUTION labels. Same look as the editorial passage slide:
 * serif text at normal weight, and the word being explained gets a yellow highlight.
 */
export type ConceptSlideState = {
  topic: string;
  board: string;
  emphasis: string;
  timeLabel: string;
  /** Upper limit for the notes text size; the renderer sets one value per video. */
  maxFontSize?: number;
};

const SERIF = "Georgia, 'Times New Roman', serif";
const NOTES = { x: 120, y: 250, width: 1680, height: 740, padding: 70 };
const widthCache = new Map<string, Promise<number>>();

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

/** Width as drawn by the same SVG renderer that draws the slide (render, trim, read width). */
async function textWidth(text: string, size: number) {
  const key = `${size}|${text}`;
  let width = widthCache.get(key);
  if (!width) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(text.length * size * 1.2 + 40)}" height="${Math.ceil(size * 2)}"><text x="10" y="${Math.round(size * 1.4)}" font-family="${SERIF}" font-size="${size}" fill="#000">${escapeXml(text)}</text></svg>`;
    width = sharp(Buffer.from(svg)).trim().png().toBuffer({ resolveWithObject: true }).then(({ info }) => info.width).catch(() => text.length * size * 0.5);
    widthCache.set(key, width);
  }
  return width;
}

type PlacedWord = { text: string; start: number; end: number; x: number; line: number; width: number };

async function layoutNotes(board: string, cap: number) {
  const maxWidth = NOTES.width - NOTES.padding * 2;
  const maxHeight = NOTES.height - 150;
  for (let size = Math.min(56, cap); size >= 24; size -= 2) {
    const space = Math.max(size * 0.25, await textWidth("a a", size) - 2 * await textWidth("a", size));
    const placed: PlacedWord[] = [];
    let line = 0;
    let offset = 0;
    for (const [index, paragraph] of board.split("\n").entries()) {
      if (index > 0) line += 1;
      let x = 0;
      for (const match of paragraph.matchAll(/\S+/g)) {
        const width = await textWidth(match[0], size);
        if (x > 0 && x + width > maxWidth) { line += 1; x = 0; }
        placed.push({ text: match[0], start: offset + match.index!, end: offset + match.index! + match[0].length, x, line, width });
        x += width + space;
      }
      offset += paragraph.length + 1;
    }
    const lineHeight = Math.round(size * 1.55);
    if ((line + 1) * lineHeight <= maxHeight) return { placed, size, lineHeight };
  }
  throw new Error("Concept notes do not fit at the minimum readable size.");
}

/** The notes text size this slide would use on its own. */
export async function conceptSlideFontSize(state: ConceptSlideState) {
  return (await layoutNotes(state.board, state.maxFontSize ?? 56)).size;
}

export async function createConceptSlideSvg(state: ConceptSlideState) {
  const layout = await layoutNotes(state.board, state.maxFontSize ?? 56);
  const highlight = phraseRanges(state.board, emphasisPhrases(state.emphasis));
  const firstY = NOTES.y + 130;
  const marks: string[] = [];
  const text: string[] = [];
  // Neighbouring highlighted words on one line share one box, so a phrase reads as one marked unit.
  let run: { line: number; x0: number; x1: number } | null = null;
  const closeRun = () => {
    if (!run) return;
    const y = firstY + run.line * layout.lineHeight;
    marks.push(`<rect x="${(NOTES.x + NOTES.padding + run.x0 - 6).toFixed(1)}" y="${(y - layout.size * 0.95).toFixed(1)}" width="${(run.x1 - run.x0 + 12).toFixed(1)}" height="${(layout.size * 1.3).toFixed(1)}" rx="8" fill="#ffd166"/>`);
    run = null;
  };
  for (const word of layout.placed) {
    const x = NOTES.x + NOTES.padding + word.x;
    const y = firstY + word.line * layout.lineHeight;
    const isHighlighted = highlight.some(([a, b]) => word.start < b && word.end > a);
    if (isHighlighted && run && run.line === word.line) run.x1 = word.x + word.width;
    else { closeRun(); if (isHighlighted) run = { line: word.line, x0: word.x, x1: word.x + word.width }; }
    text.push(`<text x="${x.toFixed(1)}" y="${y}" font-family="${SERIF}" font-size="${layout.size}" fill="${isHighlighted ? "#1b1b2f" : "#eef1f7"}">${escapeXml(word.text)}</text>`);
  }
  closeRun();
  return `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
    <rect width="1920" height="1080" fill="#0e1424"/><rect width="1920" height="10" fill="#ffd166"/>
    <text x="120" y="100" font-family="Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="5" fill="#9fb3d1">TOPIC</text>
    <text x="1800" y="100" text-anchor="end" font-family="Arial, sans-serif" font-size="25" font-weight="800" letter-spacing="3" fill="#ffd166">${escapeXml(state.timeLabel)}</text>
    <text x="120" y="180" font-family="${SERIF}" font-size="54" fill="#ffd166">${escapeXml(state.topic)}</text>
    <rect x="${NOTES.x}" y="${NOTES.y}" width="${NOTES.width}" height="${NOTES.height}" rx="24" fill="#f7f3e8" opacity="0.06"/>
    <rect x="${NOTES.x}" y="${NOTES.y}" width="${NOTES.width}" height="${NOTES.height}" rx="24" fill="none" stroke="#33415c" stroke-width="2"/>
    <text x="${NOTES.x + NOTES.padding}" y="${NOTES.y + 62}" font-family="Arial, sans-serif" font-size="22" font-weight="800" letter-spacing="4" fill="#4fd1c5">NOTES</text>
    ${marks.join("")}
    ${text.join("")}
  </svg>`;
}

export async function createConceptSlide(state: ConceptSlideState) {
  return sharp(Buffer.from(await createConceptSlideSvg(state))).png().toBuffer();
}
