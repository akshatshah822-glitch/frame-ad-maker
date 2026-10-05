import sharp from "sharp";
import { boardLines, textLine } from "@/lib/pedagogy-slide";

/**
 * "Concept" layout for teaching a topic (not solving a question): the topic name on top and
 * one large notes card. No QUESTION / SOLUTION labels. Emphasis is underlined like the board slide.
 */
export type ConceptSlideState = {
  topic: string;
  board: string;
  emphasis: string;
  timeLabel: string;
  /** Upper limit for the notes text size; the renderer sets one value per video. */
  maxFontSize?: number;
};

const NOTES = { x: 120, y: 250, width: 1680, height: 740, padding: 70 };

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

async function fitNotes(board: string, emphasis: string, cap: number) {
  const maxWidth = NOTES.width - NOTES.padding * 2;
  const maxHeight = NOTES.height - 150;
  for (let size = Math.min(56, cap); size >= 24; size -= 2) {
    const lines = await boardLines(board, emphasis, maxWidth, size);
    const lineHeight = Math.round(size * 1.5);
    if (lines.length * lineHeight <= maxHeight) return { lines, size, lineHeight };
  }
  throw new Error("Concept notes do not fit at the minimum readable size.");
}

/** The notes text size this slide would use on its own. */
export async function conceptSlideFontSize(state: ConceptSlideState) {
  return (await fitNotes(state.board, state.emphasis, state.maxFontSize ?? 56)).size;
}

export async function createConceptSlideSvg(state: ConceptSlideState) {
  const notes = await fitNotes(state.board, state.emphasis, state.maxFontSize ?? 56);
  const firstY = NOTES.y + 130;
  const text = notes.lines.map((line, index) => textLine(line, NOTES.x + NOTES.padding, firstY + index * notes.lineHeight, notes.size)).join("");
  return `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
    <rect width="1920" height="1080" fill="#101a30"/><rect width="1920" height="10" fill="#4fd1c5"/>
    <text x="120" y="100" font-family="Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="5" fill="#4fd1c5">TOPIC</text>
    <text x="1800" y="100" text-anchor="end" font-family="Arial, sans-serif" font-size="25" font-weight="800" letter-spacing="3" fill="#ff5c46">${escapeXml(state.timeLabel)}</text>
    <text x="120" y="180" font-family="Arial, sans-serif" font-size="54" font-weight="800" fill="#ffd166">${escapeXml(state.topic)}</text>
    <rect x="${NOTES.x}" y="${NOTES.y}" width="${NOTES.width}" height="${NOTES.height}" rx="26" fill="#16213d" stroke="#33415c" stroke-width="2"/>
    <text x="${NOTES.x + NOTES.padding}" y="${NOTES.y + 62}" font-family="Arial, sans-serif" font-size="22" font-weight="800" letter-spacing="4" fill="#9fb3d1">NOTES</text>
    ${text}
  </svg>`;
}

export async function createConceptSlide(state: ConceptSlideState) {
  return sharp(Buffer.from(await createConceptSlideSvg(state))).png().toBuffer();
}
