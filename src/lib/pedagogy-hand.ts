import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as opentype from "opentype.js";
import type { Font } from "opentype.js";

// Hand-made look for the exam-question (solution) board: a handwriting font drawn as SVG paths (no system font
// needed, so it renders the same on every machine) and wobbly hand-drawn strokes. Itim by Cadson Demak, SIL Open
// Font License 1.1 (assets/fonts/itim/OFL-LICENSE.txt). Only Latin text and numbers use it; Hindi stays in the
// system font because Devanagari needs shaping that path drawing does not do.

const FONT_DIR = join(process.cwd(), "assets", "fonts", "itim");
const FALLBACK_FONT = "Arial, 'Helvetica Neue', 'DejaVu Sans', sans-serif";
/** Itim sits close to Arial's size. */
const HAND_SCALE = 1.0;

type Parse = (data: ArrayBuffer) => Font;
const parse: Parse | undefined = (opentype as unknown as { parse?: Parse }).parse ?? (opentype as unknown as { default?: { parse?: Parse } }).default?.parse;
const fonts = new Map<string, Font | null>();
let fallbackLogged = false;

function load(file: string) {
  if (!fonts.has(file)) {
    try {
      const buffer = readFileSync(join(FONT_DIR, file));
      fonts.set(file, parse!(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer));
    } catch (error) {
      fonts.set(file, null);
      if (!fallbackLogged) {
        fallbackLogged = true;
        console.warn("Pedagogy hand font", { path: "fallback-system-font", file, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return fonts.get(file) ?? null;
}

// Itim has one weight; bold is drawn by outlining the letters in their own colour.
const faces = (_bold: boolean) => [load("itim-latin-400-normal.woff"), load("itim-latin-ext-400-normal.woff")].filter(Boolean) as Font[];
export const handFontReady = () => faces(false).length > 0;

const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

type Run = { text: string; fill: string; bold: boolean };

/** SVG path data from glyph commands. (opentype.js's own toPathData writes "NaN" for some coordinates, which made
 * random letters vanish, so the numbers are formatted here.) */
type Command = { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number };
function pathData(commands: Command[]) {
  const n = (value: number | undefined) => (Number.isFinite(value) ? (value as number).toFixed(2) : "0");
  return commands.map((c) => c.type === "M" || c.type === "L" ? `${c.type}${n(c.x)} ${n(c.y)}`
    : c.type === "Q" ? `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`
    : c.type === "C" ? `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`
    : c.type === "Z" ? "Z" : "").join("");
}

/** Lays runs out left to right from x = 0; characters no Kalam face has (→, ✓) use the system font. */
function layout(runs: Run[], size: number) {
  const parts: { svg: (dx: number, y: number) => string; start: number; end: number; run: number }[] = [];
  let x = 0;
  for (const [index, run] of runs.entries()) {
    const list = faces(run.bold);
    const start = x;
    for (const char of [...run.text]) {
      const font = list.find((face) => face.charToGlyph(char).index !== 0);
      if (font) {
        const advance = font.getAdvanceWidth(char, size);
        const at = x;
        if (char.trim()) parts.push({ svg: (dx, y) => `<path d="${pathData(font.getPath(char, dx + at, y, size).commands)}" fill="${run.fill}"${run.bold ? ` stroke="${run.fill}" stroke-width="${(size * 0.035).toFixed(2)}" stroke-linejoin="round"` : ""}/>`, start: at, end: at + advance, run: index });
        x += advance;
      } else {
        const advance = size * 0.62;
        const at = x;
        parts.push({ svg: (dx, y) => `<text x="${(dx + at).toFixed(1)}" y="${y.toFixed(1)}" font-family="${FALLBACK_FONT}" font-size="${(size * 0.86).toFixed(1)}" font-weight="${run.bold ? 700 : 400}" fill="${run.fill}">${esc(char)}</text>`, start: at, end: at + advance, run: index });
        x += advance;
      }
    }
    void start;
  }
  return { parts, width: x };
}

/** Handwritten text; `maxWidth` squeezes it horizontally rather than letting it spill. Null when no font loaded. */
export function handText(runs: Run[] | string, x: number, y: number, size: number, fill: string, options: { anchor?: "start" | "middle" | "end"; bold?: boolean; maxWidth?: number } = {}) {
  if (!handFontReady()) return null;
  const list: Run[] = typeof runs === "string" ? [{ text: runs, fill, bold: Boolean(options.bold) }] : runs;
  const scaled = size * HAND_SCALE;
  const { parts, width } = layout(list, scaled);
  const squeeze = options.maxWidth && width > options.maxWidth ? options.maxWidth / width : 1;
  const shown = width * squeeze;
  const left = options.anchor === "middle" ? x - shown / 2 : options.anchor === "end" ? x - shown : x;
  const body = parts.map((part) => part.svg(0, 0)).join("");
  const svg = `<g transform="translate(${left.toFixed(1)} ${y.toFixed(1)}) scale(${squeeze.toFixed(4)} 1)">${body}</g>`;
  // Box of each run (for circling highlighted values).
  const boxes = list.map((_, index) => {
    const own = parts.filter((part) => part.run === index);
    return own.length ? { x1: left + own[0].start * squeeze, x2: left + own[own.length - 1].end * squeeze } : null;
  });
  return { svg, width: shown, left, boxes };
}

/** "*stars*" → highlighted runs (same rule as the board's rich text). */
export function starRuns(text: string, fill: string, highlight: string, bold = false): Run[] {
  return text.split("*").map((part, index) => ({ text: part, fill: index % 2 ? highlight : fill, bold: index % 2 ? true : bold })).filter((run) => run.text);
}

/** Small deterministic noise, so a stroke looks the same on every frame (no flicker). */
function seeded(seedText: string) {
  let seed = 2166136261;
  for (const char of seedText) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507) ^ Math.imul(seed ^ (seed >>> 13), 3266489909);
    return ((seed >>> 0) % 1000) / 1000 - 0.5;
  };
}

/** A pen-drawn underline from x1 to x2 that draws itself as `progress` goes 0 → 1. */
export function handUnderline(x1: number, x2: number, y: number, colour: string, seedText: string, progress = 1, width = 4) {
  if (progress <= 0 || x2 <= x1) return "";
  const noise = seeded(seedText);
  const steps = Math.max(4, Math.round((x2 - x1) / 28));
  const end = x1 - 6 + (x2 - x1 + 14) * Math.min(1, progress);
  const points: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const px = x1 - 6 + ((x2 - x1 + 14) * i) / steps;
    if (px > end) break;
    points.push(`${px.toFixed(1)} ${(y + noise() * 5 + (i / steps) * 3).toFixed(1)}`);
  }
  if (points.length < 2) return "";
  return `<path d="M${points.join(" L")}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`;
}

/** A loose hand-drawn loop around a box; the loop overshoots its start like a real pen. */
export function handCircle(x1: number, x2: number, cy: number, height: number, colour: string, seedText: string, progress = 1) {
  if (progress <= 0) return "";
  const noise = seeded(seedText);
  const cx = (x1 + x2) / 2, rx = (x2 - x1) / 2 + 22, ry = height / 2 + 12;
  const turns = 1.12 * Math.min(1, progress);
  const steps = Math.max(6, Math.round(40 * turns));
  const points: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = -2.4 + (i / steps) * turns * Math.PI * 2;
    const wobble = 1 + noise() * 0.06;
    points.push(`${(cx + Math.cos(t) * rx * wobble).toFixed(1)} ${(cy + Math.sin(t) * ry * wobble).toFixed(1)}`);
  }
  return `<path d="M${points.join(" L")}" fill="none" stroke="${colour}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
}

/** Helvetica / Arial advance widths (1/1000 em) for estimating where words fall in a system-font line. */
const HELVETICA: Record<string, number> = { " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015, "[": 278, "]": 278, _: 556, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, "×": 584, "÷": 584, "−": 584, "₹": 556 };
export function systemWidth(text: string, size: number, bold = false) {
  let total = 0;
  for (const char of text) total += HELVETICA[char] ?? (/\d/.test(char) ? 556 : 600);
  return (total / 1000) * size * (bold ? 1.06 : 1);
}
