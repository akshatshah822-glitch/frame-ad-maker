import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as opentype from "opentype.js";
import type { Font } from "opentype.js";

const INK = "#101b36";
const PAPER = "#f5f7f8";
const CORAL = "#ff5c46";

let loadedFont: Promise<Font> | undefined;
function fontFace() {
  loadedFont ??= readFile(join(process.cwd(), "node_modules", "next", "dist", "compiled", "@vercel", "og", "Geist-Regular.ttf")).then((buffer) => {
    const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    return opentype.parse(data);
  });
  return loadedFont;
}

function textPath(font: Font, value: string, x: number, y: number, size: number, fill: string, anchor: "start" | "middle" = "start") {
  const left = anchor === "middle" ? x - font.getAdvanceWidth(value, size) / 2 : x;
  return `<path d="${font.getPath(value, left, y, size).toPathData(2)}" fill="${fill}"/>`;
}

function lines(value: string, maximum = 34) {
  const words = value.trim().split(/\s+/);
  const output: string[] = [];
  for (const word of words) {
    const current = output.at(-1);
    if (!current || `${current} ${word}`.length > maximum) output.push(word);
    else output[output.length - 1] = `${current} ${word}`;
  }
  return output.slice(0, 3);
}

export async function createScreenCopyOverlay(width: number, height: number, briefLine: string) {
  const font = await fontFace();
  const copy = lines(briefLine, 31);
  const x = Math.round(width * 0.11);
  const y = Math.round(height * 0.55);
  const panelWidth = Math.round(width * 0.67);
  const panelHeight = Math.round(height * 0.16);
  const text = copy.map((line, index) => textPath(font, line, x + 34, y + 104 + index * 42, 34, PAPER)).join("");
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${x}" y="${y}" width="${panelWidth}" height="${panelHeight}" fill="${INK}" fill-opacity=".93" stroke="${CORAL}" stroke-width="3"/>
    ${textPath(font, "THE BRIEF", x + 34, y + 52, 18, CORAL)}
    ${text}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function createEndCard(width: number, height: number) {
  const font = await fontFace();
  const center = width / 2;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${PAPER}"/>
    ${textPath(font, "FRAME", center - 35, Math.round(height * 0.40), 150, INK, "middle")}
    ${textPath(font, "///", center + 330, Math.round(height * 0.40), 112, CORAL, "middle")}
    <line x1="${Math.round(width * 0.12)}" x2="${Math.round(width * 0.88)}" y1="${Math.round(height * 0.49)}" y2="${Math.round(height * 0.49)}" stroke="${INK}" stroke-width="2"/>
    ${textPath(font, "One brief. Thirty seconds.", center, Math.round(height * 0.555), 48, INK, "middle")}
    ${textPath(font, "No crew.", center, Math.round(height * 0.592), 48, INK, "middle")}
    ${textPath(font, "frame-ad-maker.vercel.app", center, Math.round(height * 0.68), 39, INK, "middle")}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
