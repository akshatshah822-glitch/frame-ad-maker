import sharp from "sharp";
import type { QuestionOption, QuestionSolve } from "@/lib/types";

export type QuestionSlideState = {
  countdown?: number;
  highlight?: QuestionOption;
  struck?: QuestionOption[];
  checked?: QuestionOption;
};

const optionOrder: QuestionOption[] = ["A", "B", "C", "D"];

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function wrap(value: string, maximum: number) {
  const lines: string[] = [];
  for (const word of value.trim().split(/\s+/)) {
    const current = lines.at(-1);
    if (!current || `${current} ${word}`.length > maximum) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  return lines;
}

function fitText(value: string, maximumWidth: number, maximumHeight: number, largestSize: number, smallestSize: number) {
  for (let size = largestSize; size >= smallestSize; size -= 2) {
    const lineHeight = Math.ceil(size * 1.24);
    const maximumCharacters = Math.max(1, Math.floor(maximumWidth / (size * 0.62)));
    const lines = wrap(value, maximumCharacters);
    if (lines.length * lineHeight <= maximumHeight) return { lines, size, lineHeight };
  }
  throw new Error("Invalid solve.question: does not fit on the fixed slide at the minimum readable size.");
}

function textLines(lines: string[], x: number, y: number, size: number, lineHeight: number, fill = "#101b36", weight = 600) {
  return lines.map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`).join("");
}

export async function createQuestionSlide(solve: QuestionSolve, state: QuestionSlideState = {}) {
  const width = 1920;
  const height = 1080;
  const questionLayout = fitText(solve.question, 1420, 250, 52, 14);
  const optionCards = optionOrder.map((option, index) => {
    const x = 150 + (index % 2) * 830;
    const y = 430 + Math.floor(index / 2) * 245;
    const answerLines = wrap(solve.options[option], 43).slice(0, 3);
    if (wrap(solve.options[option], 43).length > 3) throw new Error(`Invalid solve.options.${option}: does not fit on the fixed slide.`);
    const highlighted = state.highlight === option || state.checked === option;
    const struck = state.struck?.includes(option);
    const fill = state.checked === option ? "#d8f3dc" : highlighted ? "#fff0b8" : "#ffffff";
    return `<g>
      <rect x="${x}" y="${y}" width="740" height="190" rx="18" fill="${fill}" stroke="#101b36" stroke-width="4"/>
      <circle cx="${x + 66}" cy="${y + 70}" r="34" fill="#101b36"/>
      <text x="${x + 66}" y="${y + 82}" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="800" fill="#f5f7f8">${option}</text>
      ${textLines(answerLines, x + 125, y + 62, 32, 42)}
      ${struck ? `<line x1="${x + 112}" y1="${y + 95}" x2="${x + 690}" y2="${y + 95}" stroke="#d13c2f" stroke-width="12" stroke-linecap="round"/>` : ""}
      ${state.checked === option ? `<path d="M ${x + 635} ${y + 135} l 24 24 l 48 -62" fill="none" stroke="#18794e" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
    </g>`;
  }).join("");
  const countdown = state.countdown ? `<g><circle cx="1740" cy="135" r="78" fill="#ff5c46"/><text x="1740" y="158" text-anchor="middle" font-family="Arial, sans-serif" font-size="70" font-weight="900" fill="#101b36">${state.countdown}</text></g>` : "";
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="1920" height="1080" fill="#f5f7f8"/>
    <rect x="0" y="0" width="1920" height="20" fill="#ff5c46"/>
    <text x="150" y="105" font-family="Arial, sans-serif" font-size="26" font-weight="800" letter-spacing="5" fill="#657086">EXAM QUESTION</text>
    ${textLines(questionLayout.lines, 150, 150 + questionLayout.lineHeight, questionLayout.size, questionLayout.lineHeight, "#101b36", 800)}
    ${optionCards}
    ${countdown}
    <text x="150" y="1015" font-family="Arial, sans-serif" font-size="23" font-weight="800" letter-spacing="4" fill="#657086">FRAME / THINK BEFORE YOU PICK</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
