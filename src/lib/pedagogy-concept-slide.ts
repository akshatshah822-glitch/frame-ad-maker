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

type NoteLine = { text: string; start: number };

/** Width of a line prefix including trailing spaces (a sentinel letter keeps the trim from eating them). */
async function prefixWidth(text: string, size: number) {
  if (!text) return 0;
  return (await textWidth(`${text}H`, size)) - (await textWidth("H", size));
}

/** Wraps whole lines by measuring the real text, so the renderer's own word spacing is kept. */
async function layoutNotes(board: string, cap: number) {
  const maxWidth = NOTES.width - NOTES.padding * 2;
  const maxHeight = NOTES.height - 150;
  for (let size = Math.min(56, cap); size >= 24; size -= 2) {
    const lines: NoteLine[] = [];
    let offset = 0;
    for (const paragraph of board.split("\n")) {
      let current: NoteLine | null = null;
      for (const match of paragraph.matchAll(/\S+/g)) {
        const start = offset + match.index!;
        const candidate: string = current ? board.slice(current.start, start + match[0].length) : match[0];
        if (current && await textWidth(candidate, size) > maxWidth) { lines.push(current); current = { text: match[0], start }; }
        else current = current ? { text: candidate, start: current.start } : { text: match[0], start };
      }
      lines.push(current ?? { text: "", start: offset });
      offset += paragraph.length + 1;
    }
    const lineHeight = Math.round(size * 1.55);
    if (lines.length * lineHeight <= maxHeight) return { lines, size, lineHeight };
  }
  throw new Error("Concept notes do not fit at the minimum readable size.");
}

/** The notes text size this slide would use on its own. */
export async function conceptSlideFontSize(state: ConceptSlideState) {
  return (await layoutNotes(state.board, state.maxFontSize ?? 56)).size;
}

export async function createConceptSlideSvg(state: ConceptSlideState) {
  const layout = await layoutNotes(state.board, state.maxFontSize ?? 56);
  const highlight = phraseRanges(state.board, emphasisPhrases(state.emphasis)).toSorted((a, b) => a[0] - b[0]);
  const firstY = NOTES.y + 130;
  const x = NOTES.x + NOTES.padding;
  const marks: string[] = [];
  const text: string[] = [];
  for (const [index, line] of layout.lines.entries()) {
    const y = firstY + index * layout.lineHeight;
    const lineEnd = line.start + line.text.length;
    // Highlighted parts of this line, as character offsets inside the line.
    const parts = highlight
      .map(([a, b]) => [Math.max(a, line.start) - line.start, Math.min(b, lineEnd) - line.start] as [number, number])
      .filter(([a, b]) => b > a);
    const spans: string[] = [];
    let cursor = 0;
    for (const [a, b] of parts) {
      if (a < cursor) continue;
      const x0 = await prefixWidth(line.text.slice(0, a), layout.size);
      const x1 = await prefixWidth(line.text.slice(0, b), layout.size);
      marks.push(`<rect x="${(x + x0 - 3).toFixed(1)}" y="${(y - layout.size * 0.95).toFixed(1)}" width="${(x1 - x0 + 6).toFixed(1)}" height="${(layout.size * 1.3).toFixed(1)}" rx="8" fill="#ffd166"/>`);
      if (a > cursor) spans.push(`<tspan>${escapeXml(line.text.slice(cursor, a))}</tspan>`);
      spans.push(`<tspan fill="#1b1b2f">${escapeXml(line.text.slice(a, b))}</tspan>`);
      cursor = b;
    }
    if (cursor < line.text.length) spans.push(`<tspan>${escapeXml(line.text.slice(cursor))}</tspan>`);
    text.push(`<text xml:space="preserve" x="${x}" y="${y}" font-family="${SERIF}" font-size="${layout.size}" fill="#eef1f7">${spans.join("")}</text>`);
  }
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
