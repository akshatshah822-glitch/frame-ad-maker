import sharp from "sharp";

export type PedagogySlideState = {
  questionId: string;
  questionText?: string;
  options?: [string, string, string, string, string];
  board: string;
  emphasis: string;
  generatedTimeLabel: string;
};

type BoardSegment = { text: string; emphasized: boolean };
type BoardLine = BoardSegment[];
export type PedagogyBoardLayout = { lines: string[]; size: number; lineHeight: number };

const boardTextWidthCache = new Map<string, Promise<number>>();

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

async function renderedTextWidth(text: string, size: number) {
  const key = `${size}\u0000${text}`;
  let width = boardTextWidthCache.get(key);
  if (!width) {
    width = sharp({ text: { text, font: `Arial Bold ${size}`, rgba: true } })
      .png()
      .toBuffer({ resolveWithObject: true })
      .then(({ info }) => info.width);
    boardTextWidthCache.set(key, width);
  }
  return width;
}

function lineText(line: BoardLine) {
  return line.map((segment) => segment.text).join("");
}

async function boardLines(board: string, emphasis: string, maximumWidth: number, size: number): Promise<BoardLine[]> {
  const lines: BoardLine[] = [[]];
  for (const token of boardTokens(board, emphasis)) {
    const isWhitespace = /^\s+$/.test(token.text);
    const currentLine = lines.at(-1)!;
    if (isWhitespace && token.text.includes("\n")) {
      while (/^\s+$/.test(currentLine.at(-1)?.text ?? "")) currentLine.pop();
      lines.push([]);
      continue;
    }
    if (!isWhitespace && currentLine.length && await renderedTextWidth(`${lineText(currentLine)}${token.text}`, size) > maximumWidth) {
      while (/^\s+$/.test(currentLine.at(-1)?.text ?? "")) currentLine.pop();
      lines.push([]);
    }
    if (isWhitespace && !lines.at(-1)?.length) continue;
    lines.at(-1)?.push(token);
  }
  return lines.filter((line) => line.length);
}

async function fitBoard(board: string, emphasis: string) {
  if (!board) return { lines: [] as BoardLine[], size: 48, lineHeight: 60 };
  for (let size = 64; size >= 24; size -= 2) {
    const lineHeight = Math.ceil(size * 1.35);
    const lines = await boardLines(board, emphasis, 1450, size);
    if (lines.length * lineHeight <= 650) return { lines, size, lineHeight };
  }
  throw new Error("Invalid board: does not fit on the fixed slide at the minimum readable size.");
}

async function fitSolutionBoard(board: string, emphasis: string) {
  if (!board) return { lines: [] as BoardLine[], size: 38, lineHeight: 52 };
  for (let size = 52; size >= 20; size -= 2) {
    const lineHeight = Math.ceil(size * 1.35);
    const lines = await boardLines(board, emphasis, 1450, size);
    if (lines.length * lineHeight <= 280) return { lines, size, lineHeight };
  }
  throw new Error("Invalid board: does not fit in the solution panel at the minimum readable size.");
}

type QuestionPanelLine = { line: BoardLine; optionLabel?: string };

async function fitQuestionPanel(questionText: string, options: [string, string, string, string, string]) {
  for (let size = 38; size >= 18; size -= 2) {
    const lineHeight = Math.ceil(size * 1.3);
    const questionLines = await boardLines(questionText, "", 1450, size);
    const optionLines = await Promise.all(options.map((option) => option.trim() ? boardLines(option, "", 1360, size) : Promise.resolve([] as BoardLine[])));
    const lines: QuestionPanelLine[] = [
      ...questionLines.map((line) => ({ line })),
      ...optionLines.flatMap((linesForOption, optionIndex) => linesForOption.map((line, lineIndex) => ({ line, optionLabel: lineIndex === 0 ? `${"ABCDE"[optionIndex]}.` : undefined }))),
    ];
    if (lines.length * lineHeight <= 218) return { lines, size, lineHeight };
  }
  throw new Error("Invalid question: does not fit in the question panel at the minimum readable size.");
}

function textLine(line: BoardLine, x: number, y: number, size: number) {
  const spans = line.map((segment) => `<tspan xml:space="preserve"${segment.emphasized ? ' fill="#ff5c46" text-decoration="underline" text-decoration-thickness="3"' : ""}>${escapeXml(segment.text)}</tspan>`).join("");
  return `<text xml:space="preserve" x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="700" fill="#f5f7f8">${spans}</text>`;
}

export async function wrapPedagogyBoardText(board: string, emphasis = ""): Promise<PedagogyBoardLayout> {
  const layout = await fitBoard(board, emphasis);
  return { lines: layout.lines.map(lineText), size: layout.size, lineHeight: layout.lineHeight };
}

export async function createPedagogySlideSvg(state: PedagogySlideState) {
  const width = 1920;
  const height = 1080;
  if (state.questionText?.trim()) {
    const question = await fitQuestionPanel(state.questionText, state.options ?? ["", "", "", "", ""]);
    const solution = await fitSolutionBoard(state.board, state.emphasis);
    const firstQuestionLineY = 240 + Math.max(0, (218 - question.lines.length * question.lineHeight) / 2) + question.lineHeight;
    const questionText = question.lines.map(({ line, optionLabel }, index) => `${optionLabel ? `<text x="230" y="${firstQuestionLineY + index * question.lineHeight}" font-family="Arial, sans-serif" font-size="${question.size}" font-weight="800" fill="#ff5c46">${optionLabel}</text>` : ""}${textLine(line, optionLabel ? 310 : 230, firstQuestionLineY + index * question.lineHeight, question.size)}`).join("");
    const firstSolutionLineY = 610 + Math.max(0, (280 - solution.lines.length * solution.lineHeight) / 2) + solution.lineHeight;
    const solutionText = solution.lines.map((line, index) => textLine(line, 230, firstSolutionLineY + index * solution.lineHeight, solution.size)).join("");
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="1920" height="1080" fill="#101b36"/>
      <rect x="0" y="0" width="1920" height="20" fill="#ff5c46"/>
      <text x="180" y="106" font-family="Arial, sans-serif" font-size="26" font-weight="800" letter-spacing="5" fill="#bfc9dc">EXAM EXPLAINER</text>
      <text x="1740" y="106" text-anchor="end" font-family="Arial, sans-serif" font-size="25" font-weight="800" letter-spacing="3" fill="#ff5c46">${escapeXml(state.generatedTimeLabel)}</text>
      <rect x="120" y="150" width="1680" height="350" rx="28" fill="#17233e" stroke="#52617f" stroke-width="3"/>
      <text x="230" y="205" font-family="Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="3" fill="#9eabc3">QUESTION${state.questionId ? ` · ${escapeXml(state.questionId)}` : ""}</text>
      ${questionText}
      <rect x="120" y="535" width="1680" height="385" rx="28" fill="#17233e" stroke="#52617f" stroke-width="3"/>
      <text x="230" y="590" font-family="Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="3" fill="#9eabc3">SOLUTION</text>
      ${solutionText}
      <text x="150" y="1015" font-family="Arial, sans-serif" font-size="23" font-weight="800" letter-spacing="4" fill="#9eabc3">FRAME / PEDAGOGY BRIEF</text>
    </svg>`;
  }
  const layout = await fitBoard(state.board, state.emphasis);
  const firstLineY = 290 + Math.max(0, (650 - layout.lines.length * layout.lineHeight) / 2) + layout.lineHeight;
  const boardText = layout.lines.map((line, index) => textLine(line, 230, firstLineY + index * layout.lineHeight, layout.size)).join("");
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="1920" height="1080" fill="#101b36"/>
    <rect x="0" y="0" width="1920" height="20" fill="#ff5c46"/>
    <rect x="120" y="160" width="1680" height="760" rx="28" fill="#17233e" stroke="#52617f" stroke-width="3"/>
    <text x="180" y="106" font-family="Arial, sans-serif" font-size="26" font-weight="800" letter-spacing="5" fill="#bfc9dc">EXAM EXPLAINER</text>
    <text x="1740" y="106" text-anchor="end" font-family="Arial, sans-serif" font-size="25" font-weight="800" letter-spacing="3" fill="#ff5c46">${escapeXml(state.generatedTimeLabel)}</text>
    <text x="230" y="228" font-family="Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="3" fill="#9eabc3">${escapeXml(state.questionId || "BOARD")}</text>
    ${boardText}
    <text x="150" y="1015" font-family="Arial, sans-serif" font-size="23" font-weight="800" letter-spacing="4" fill="#9eabc3">FRAME / PEDAGOGY BRIEF</text>
  </svg>`;
}

export async function createPedagogySlide(state: PedagogySlideState) {
  return sharp(Buffer.from(await createPedagogySlideSvg(state))).png().toBuffer();
}
