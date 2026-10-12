import sharp from "sharp";
import { pedagogyFrameClose, pedagogyFrameOpen } from "@/lib/pedagogy-slide-theme";

export type PedagogySlideState = {
  questionId: string;
  board: string;
  emphasis: string;
  generatedTimeLabel: string;
  backgroundImage?: string | null;
};

export type BoardSegment = { text: string; emphasized: boolean };
export type BoardLine = BoardSegment[];

export function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function boardTokens(board: string, emphasis: string): BoardSegment[] {
  if (!emphasis || !board.includes(emphasis)) return board.split(/(\s+)/).filter(Boolean).map((text) => ({ text, emphasized: false }));
  const tokens: BoardSegment[] = [];
  let position = 0;
  while (position < board.length) {
    const emphasisAt = board.indexOf(emphasis, position);
    if (emphasisAt < 0) {
      tokens.push(...board.slice(position).split(/(\s+)/).filter(Boolean).map((text) => ({ text, emphasized: false })));
      break;
    }
    tokens.push(...board.slice(position, emphasisAt).split(/(\s+)/).filter(Boolean).map((text) => ({ text, emphasized: false })));
    tokens.push({ text: emphasis, emphasized: true });
    position = emphasisAt + emphasis.length;
  }
  return tokens;
}

export function boardLines(board: string, emphasis: string, maximumCharacters: number): BoardLine[] {
  const lines: BoardLine[] = [[]];
  let characters = 0;
  for (const token of boardTokens(board, emphasis)) {
    const isWhitespace = /^\s+$/.test(token.text);
    if (!isWhitespace && characters && characters + token.text.length > maximumCharacters) {
      lines.push([]);
      characters = 0;
    }
    if (isWhitespace && !characters) continue;
    lines.at(-1)?.push(token);
    characters += token.text.length;
  }
  return lines.filter((line) => line.length);
}

function fitBoard(board: string, emphasis: string) {
  if (!board) return { lines: [] as BoardLine[], size: 48, lineHeight: 60 };
  for (let size = 64; size >= 24; size -= 2) {
    const lineHeight = Math.ceil(size * 1.35);
    const maximumCharacters = Math.max(1, Math.floor(1450 / (size * 0.59)));
    const lines = boardLines(board, emphasis, maximumCharacters);
    if (lines.length * lineHeight <= 650) return { lines, size, lineHeight };
  }
  throw new Error("Invalid board: does not fit on the fixed slide at the minimum readable size.");
}

function textLine(line: BoardLine, x: number, y: number, size: number) {
  const spans = line.map((segment) => `<tspan${segment.emphasized ? ' fill="#ff5c46" text-decoration="underline" text-decoration-thickness="3"' : ""}>${escapeXml(segment.text)}</tspan>`).join("");
  return `<text xml:space="preserve" x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="700" fill="#f5f7f8">${spans}</text>`;
}

export async function createPedagogySlide(state: PedagogySlideState) {
  const layout = fitBoard(state.board, state.emphasis);
  const firstLineY = 290 + Math.max(0, (650 - layout.lines.length * layout.lineHeight) / 2) + layout.lineHeight;
  const boardText = layout.lines.map((line, index) => textLine(line, 230, firstLineY + index * layout.lineHeight, layout.size)).join("");
  const svg = `${pedagogyFrameOpen(state)}
    <text x="230" y="228" font-family="Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="3" fill="#a9b5cf">${escapeXml(state.questionId || "BOARD")}</text>
    ${boardText}
  ${pedagogyFrameClose}`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
