import sharp from "sharp";

/**
 * "Passage" layout for reading-comprehension lessons: the whole passage stays on
 * screen in large type, the word being explained is highlighted inside it, words
 * already explained keep a soft underline, and the board notes sit in a side card.
 */
export type PassageSlideState = {
  passage: string;
  /** Word or phrase being explained on this line; highlighted inside the passage. */
  emphasis: string;
  /** Words explained on earlier lines of the same passage. */
  taught: string[];
  board: string;
  title: string;
  timeLabel: string;
  /** Upper limit for the text size; the renderer sets one value per passage so all its slides match. */
  maxFontSize?: number;
};

const FONT = "Georgia, 'Times New Roman', serif";
const PASSAGE_BOX = { x: 80, y: 150, width: 1110, height: 840, padding: 56 };
const NOTE_BOX = { x: 1230, y: 150, width: 610, height: 840, padding: 44 };
const widthCache = new Map<string, Promise<number>>();

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

/** Width as drawn by the same SVG renderer that draws the slide (render, trim, read width). */
async function textWidth(text: string, size: number, bold = false) {
  const key = `${size}|${bold ? 1 : 0}|${text}`;
  let width = widthCache.get(key);
  if (!width) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(text.length * size * 1.2 + 40)}" height="${Math.ceil(size * 2)}"><text x="10" y="${Math.round(size * 1.4)}" font-family="${FONT}" font-size="${size}"${bold ? ' font-weight="700"' : ""} fill="#000">${escapeXml(text)}</text></svg>`;
    width = sharp(Buffer.from(svg)).trim().png().toBuffer({ resolveWithObject: true }).then(({ info }) => info.width).catch(() => text.length * size * 0.5);
    widthCache.set(key, width);
  }
  return width;
}

type Word = { text: string; start: number; end: number };
type PlacedWord = Word & { x: number; line: number; width: number };

function words(paragraph: string, offset: number): Word[] {
  const found: Word[] = [];
  for (const match of paragraph.matchAll(/\S+/g)) found.push({ text: match[0], start: offset + match.index!, end: offset + match.index! + match[0].length });
  return found;
}

/** Character ranges (in the full passage) where any of the phrases occur, case-insensitive. */
export function phraseRanges(passage: string, phrases: string[]) {
  const lower = passage.toLowerCase();
  const ranges: [number, number][] = [];
  for (const phrase of phrases.map((p) => p.trim().toLowerCase()).filter(Boolean)) {
    let at = lower.indexOf(phrase);
    while (at >= 0) {
      ranges.push([at, at + phrase.length]);
      at = lower.indexOf(phrase, at + phrase.length);
    }
  }
  return ranges;
}

const overlaps = (word: Word, ranges: [number, number][]) => ranges.some(([a, b]) => word.start < b && word.end > a);

async function layoutPassage(passage: string, maxWidth: number, maxHeight: number, cap = 44) {
  const paragraphs: { text: string; offset: number }[] = [];
  let offset = 0;
  for (const text of passage.split("\n")) {
    if (text.trim()) paragraphs.push({ text, offset });
    offset += text.length + 1;
  }
  for (let size = Math.min(44, cap); size >= 22; size -= 2) {
    const lineHeight = Math.round(size * 1.55);
    const paragraphGap = Math.round(size * 0.7);
    const space = Math.max(size * 0.22, await textWidth("a a", size) - 2 * await textWidth("a", size));
    const placed: PlacedWord[] = [];
    let line = 0;
    let height = 0;
    for (const [index, paragraph] of paragraphs.entries()) {
      if (index > 0) { line += 1; height += paragraphGap; }
      let x = 0;
      for (const word of words(paragraph.text, paragraph.offset)) {
        const width = await textWidth(word.text, size);
        if (x > 0 && x + width > maxWidth) { line += 1; x = 0; }
        placed.push({ ...word, x, line, width });
        x += width + space;
      }
    }
    const lines = line + 1;
    height += lines * lineHeight;
    if (height <= maxHeight) return { placed, size, lineHeight, paragraphGap, paragraphStarts: paragraphs.map((p) => p.offset) };
  }
  throw new Error("Passage does not fit on the slide at the minimum readable size.");
}

async function wrapNotes(board: string, maxWidth: number, largestSize: number) {
  for (let size = largestSize; size >= 20; size -= 2) {
    const lines: string[] = [];
    for (const raw of board.split("\n")) {
      let current = "";
      for (const token of raw.split(/\s+/).filter(Boolean)) {
        const next = current ? `${current} ${token}` : token;
        if (current && await textWidth(next, size, true) > maxWidth) { lines.push(current); current = token; } else current = next;
      }
      lines.push(current);
    }
    const lineHeight = Math.round(size * 1.45);
    if (lines.length * lineHeight <= NOTE_BOX.height - 150) return { lines, size, lineHeight };
  }
  return { lines: board.split("\n"), size: 20, lineHeight: 29 };
}

/** The text size this passage slide would use on its own (passage and meaning card share it). */
export async function passageSlideFontSize(state: PassageSlideState) {
  const layout = await layoutPassage(state.passage, PASSAGE_BOX.width - PASSAGE_BOX.padding * 2, PASSAGE_BOX.height - PASSAGE_BOX.padding * 2 - 20, state.maxFontSize);
  const notes = await wrapNotes(state.board, NOTE_BOX.width - NOTE_BOX.padding * 2, layout.size);
  return Math.min(layout.size, notes.size);
}

export async function createPassageSlideSvg(state: PassageSlideState) {
  const innerWidth = PASSAGE_BOX.width - PASSAGE_BOX.padding * 2;
  const innerHeight = PASSAGE_BOX.height - PASSAGE_BOX.padding * 2 - 20;
  const layout = await layoutPassage(state.passage, innerWidth, innerHeight, state.maxFontSize);
  const current = phraseRanges(state.passage, [state.emphasis]);
  const taught = phraseRanges(state.passage, state.taught);

  // y position per line, adding the paragraph gap after each paragraph break.
  const paragraphOfLine = new Map<number, number>();
  for (const word of layout.placed) {
    const paragraph = layout.paragraphStarts.filter((start) => start <= word.start).length - 1;
    if (!paragraphOfLine.has(word.line)) paragraphOfLine.set(word.line, paragraph);
  }
  const lineY = (line: number) => PASSAGE_BOX.y + PASSAGE_BOX.padding + 20 + (line + 1) * layout.lineHeight - layout.lineHeight * 0.3 + (paragraphOfLine.get(line) ?? 0) * layout.paragraphGap;

  const marks: string[] = [];
  const text: string[] = [];
  for (const word of layout.placed) {
    const x = PASSAGE_BOX.x + PASSAGE_BOX.padding + word.x;
    const y = lineY(word.line);
    const isCurrent = overlaps(word, current);
    const isTaught = !isCurrent && overlaps(word, taught);
    if (isCurrent) marks.push(`<rect x="${(x - 6).toFixed(1)}" y="${(y - layout.size * 0.95).toFixed(1)}" width="${(word.width + 12).toFixed(1)}" height="${(layout.size * 1.3).toFixed(1)}" rx="8" fill="#ffd166"/>`);
    if (isTaught) marks.push(`<rect x="${x.toFixed(1)}" y="${(y + layout.size * 0.18).toFixed(1)}" width="${word.width.toFixed(1)}" height="4" rx="2" fill="#4fd1c5"/>`);
    text.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${FONT}" font-size="${layout.size}" fill="${isCurrent ? "#1b1b2f" : "#eef1f7"}">${escapeXml(word.text)}</text>`);
  }

  // Same size as the passage text, so the meaning reads at the same weight as the passage.
  const notes = await wrapNotes(state.board, NOTE_BOX.width - NOTE_BOX.padding * 2, layout.size);
  const noteText = notes.lines.map((line, index) => {
    const [head, ...rest] = line.split(" = ");
    const y = NOTE_BOX.y + 150 + index * notes.lineHeight;
    const x = NOTE_BOX.x + NOTE_BOX.padding;
    return rest.length
      ? `<text xml:space="preserve" x="${x}" y="${y}" font-family="${FONT}" font-size="${notes.size}" font-weight="700" fill="#ffd166">${escapeXml(head)}<tspan fill="#9fb3d1" font-weight="400"> = </tspan><tspan fill="#eef1f7" font-weight="400">${escapeXml(rest.join(" = "))}</tspan></text>`
      : `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${notes.size}" fill="#eef1f7">${escapeXml(line)}</text>`;
  }).join("");

  return `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
    <rect width="1920" height="1080" fill="#0e1424"/>
    <rect x="0" y="0" width="1920" height="10" fill="#ffd166"/>
    <text x="80" y="100" font-family="Arial, sans-serif" font-size="26" font-weight="800" letter-spacing="5" fill="#9fb3d1">${escapeXml(state.title.toUpperCase())}</text>
    <text x="1840" y="100" text-anchor="end" font-family="Arial, sans-serif" font-size="25" font-weight="800" letter-spacing="3" fill="#ffd166">${escapeXml(state.timeLabel)}</text>
    <rect x="${PASSAGE_BOX.x}" y="${PASSAGE_BOX.y}" width="${PASSAGE_BOX.width}" height="${PASSAGE_BOX.height}" rx="24" fill="#f7f3e8" opacity="0.06"/>
    <rect x="${PASSAGE_BOX.x}" y="${PASSAGE_BOX.y}" width="${PASSAGE_BOX.width}" height="${PASSAGE_BOX.height}" rx="24" fill="none" stroke="#33415c" stroke-width="2"/>
    <text x="${PASSAGE_BOX.x + PASSAGE_BOX.padding}" y="${PASSAGE_BOX.y + 52}" font-family="Arial, sans-serif" font-size="22" font-weight="800" letter-spacing="4" fill="#4fd1c5">PASSAGE</text>
    ${marks.join("")}
    ${text.join("")}
    <rect x="${NOTE_BOX.x}" y="${NOTE_BOX.y}" width="${NOTE_BOX.width}" height="${NOTE_BOX.height}" rx="24" fill="#16203a" stroke="#ffd166" stroke-width="3"/>
    <text x="${NOTE_BOX.x + NOTE_BOX.padding}" y="${NOTE_BOX.y + 64}" font-family="Arial, sans-serif" font-size="22" font-weight="800" letter-spacing="4" fill="#ffd166">MEANING</text>
    ${noteText}
  </svg>`;
}

export async function createPassageSlide(state: PassageSlideState) {
  return sharp(Buffer.from(await createPassageSlideSvg(state))).png().toBuffer();
}
