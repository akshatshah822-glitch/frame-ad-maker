import sharp from "sharp";

export type PedagogySlideState = {
  questionId: string;
  board: string;
  emphasis: string;
  generatedTimeLabel: string;
};

type BoardSegment = { text: string; emphasized: boolean };
type BoardLine = BoardSegment[];

function escapeXml(value: string) {
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

function boardLines(board: string, emphasis: string, maximumCharacters: number): BoardLine[] {
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
  return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="700" fill="#f5f7f8">${spans}</text>`;
}

export async function createPedagogySlide(state: PedagogySlideState) {
  const width = 1920;
  const height = 1080;
  const layout = fitBoard(state.board, state.emphasis);
  const firstLineY = 290 + Math.max(0, (650 - layout.lines.length * layout.lineHeight) / 2) + layout.lineHeight;
  const boardText = layout.lines.map((line, index) => textLine(line, 230, firstLineY + index * layout.lineHeight, layout.size)).join("");
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="1920" height="1080" fill="#101b36"/>
    <rect x="0" y="0" width="1920" height="20" fill="#ff5c46"/>
    <rect x="120" y="160" width="1680" height="760" rx="28" fill="#17233e" stroke="#52617f" stroke-width="3"/>
    <text x="180" y="106" font-family="Arial, sans-serif" font-size="26" font-weight="800" letter-spacing="5" fill="#bfc9dc">EXAM EXPLAINER</text>
    <text x="1740" y="106" text-anchor="end" font-family="Arial, sans-serif" font-size="25" font-weight="800" letter-spacing="3" fill="#ff5c46">${escapeXml(state.generatedTimeLabel)}</text>
    <text x="230" y="228" font-family="Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="3" fill="#9eabc3">${escapeXml(state.questionId || "BOARD")}</text>
    ${boardText}
    <text x="150" y="1015" font-family="Arial, sans-serif" font-size="23" font-weight="800" letter-spacing="4" fill="#9eabc3">FRAME / PEDAGOGY BRIEF</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
