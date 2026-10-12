import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { boardLines, escapeXml, type BoardLine } from "@/lib/pedagogy-slide";
import { pedagogyFrameClose, pedagogyFrameOpen, pedagogyTheme } from "@/lib/pedagogy-slide-theme";
import { formatPedagogyNumber, type PedagogyDataPoint, type PedagogyVisual } from "@/lib/pedagogy-visual";

// Exam-path only. Draws the optional visual boards (flowchart, cards, charts, counter, logos) as code,
// one PNG per animation step, using the same frame chrome as the original text board.

const { ink: INK, muted: MUTED, accent: ACCENT, line: LINE, box: BOX, blue: BLUE, green: GREEN, font: FONT } = pedagogyTheme;

const LEFT = 200;
const RIGHT = 1720;
const BOTTOM = 880;
const ANIMATION_FPS = 12;
const MAXIMUM_ANIMATION_SECONDS = 1.6;

export const pedagogyLogoDirectory = () => join(process.cwd(), "public", "pedagogy-logos");
const logoExtensions = ["svg", "png", "jpg", "jpeg", "webp"] as const;

export type PedagogyLogoImages = Map<string, string | null>;

export type PedagogyVisualSlideState = {
  questionId: string;
  title: string;
  emphasis: string;
  generatedTimeLabel: string;
  visual: Exclude<PedagogyVisual, { kind: "text" }>;
  progress: number;
  logos?: PedagogyLogoImages;
  backgroundImage?: string | null;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const ease = (value: number) => 1 - (1 - clamp(value)) ** 3;
const stagger = (progress: number, index: number, total: number) => clamp(progress * total - index);
const isEmphasized = (label: string, emphasis: string) => Boolean(emphasis.trim()) && label.trim() === emphasis.trim();

function wrap(value: string, maximumCharacters: number) {
  const lines: string[] = [];
  let current = "";
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const pieces = word.length > maximumCharacters ? word.match(new RegExp(`.{1,${maximumCharacters}}`, "g")) ?? [word] : [word];
    for (const piece of pieces) {
      if (current && current.length + 1 + piece.length > maximumCharacters) { lines.push(current); current = piece; }
      else current = current ? `${current} ${piece}` : piece;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function fitWrapped(value: string, width: number, maximumLines: number, largest: number, smallest: number) {
  for (let size = largest; size >= smallest; size -= 2) {
    const lines = wrap(value, Math.max(4, Math.floor(width / (size * 0.58))));
    if (lines.length <= maximumLines) return { lines, size };
  }
  const lines = wrap(value, Math.max(4, Math.floor(width / (smallest * 0.58))));
  return { lines: lines.slice(0, maximumLines), size: smallest };
}

function textBlock(lines: string[], x: number, centerY: number, size: number, options: { fill?: string; weight?: number; anchor?: "start" | "middle" | "end"; opacity?: number } = {}) {
  const lineHeight = Math.ceil(size * 1.22);
  const firstBaseline = centerY - ((lines.length - 1) * lineHeight) / 2 + size * 0.35;
  return lines.map((line, index) => `<text x="${x}" y="${(firstBaseline + index * lineHeight).toFixed(1)}" text-anchor="${options.anchor ?? "middle"}" font-family="${FONT}" font-size="${size}" font-weight="${options.weight ?? 700}" fill="${options.fill ?? INK}"${options.opacity === undefined ? "" : ` opacity="${options.opacity.toFixed(3)}"`}>${escapeXml(line)}</text>`).join("");
}

function titleMarkup(title: string, emphasis: string) {
  if (!title.trim()) return { markup: "", contentTop: 230 };
  let layout: { lines: BoardLine[]; size: number } = { lines: [], size: 30 };
  for (let size = 50; size >= 30; size -= 2) {
    layout = { lines: boardLines(title, emphasis, Math.max(1, Math.floor(1480 / (size * 0.59)))), size };
    if (layout.lines.length <= 2) break;
  }
  const lineHeight = Math.ceil(layout.size * 1.3);
  const markup = layout.lines.map((line, index) => {
    const spans = line.map((segment) => `<tspan${segment.emphasized ? ` fill="${ACCENT}" text-decoration="underline"` : ""}>${escapeXml(segment.text)}</tspan>`).join("");
    return `<text xml:space="preserve" x="${LEFT + 30}" y="${250 + index * lineHeight}" font-family="${FONT}" font-size="${layout.size}" font-weight="700" fill="${INK}">${spans}</text>`;
  }).join("");
  return { markup, contentTop: 250 + (layout.lines.length - 1) * lineHeight + 50 };
}

function flowchart(steps: string[], progress: number, emphasis: string, top: number) {
  const gap = 84;
  const width = (RIGHT - LEFT - gap * (steps.length - 1)) / steps.length;
  const height = Math.min(230, BOTTOM - top - 70);
  const centerY = top + (BOTTOM - top) / 2 + 10;
  return steps.map((step, index) => {
    const reveal = ease(stagger(progress, index, steps.length));
    if (reveal <= 0) return "";
    const x = LEFT + index * (width + gap);
    const y = centerY - height / 2 + (1 - reveal) * 24;
    const highlighted = isEmphasized(step, emphasis);
    const label = fitWrapped(step, width - 44, 4, width > 300 ? 38 : 32, 22);
    const arrow = index === 0 ? "" : (() => {
      const startX = x - gap + 10;
      const endX = startX + (gap - 20) * reveal;
      const head = reveal > 0.6 ? `<path d="M ${endX - 16} ${centerY - 12} L ${endX} ${centerY} L ${endX - 16} ${centerY + 12}" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` : "";
      return `<line x1="${startX}" y1="${centerY}" x2="${endX}" y2="${centerY}" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>${head}`;
    })();
    return `${arrow}<g opacity="${reveal.toFixed(3)}">
      <text x="${x + 6}" y="${y - 22}" font-family="${FONT}" font-size="24" font-weight="800" letter-spacing="3" fill="${highlighted ? ACCENT : MUTED}">${String(index + 1).padStart(2, "0")}</text>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="22" fill="${BOX}" stroke="${highlighted ? ACCENT : LINE}" stroke-width="${highlighted ? 6 : 3}"/>
      ${textBlock(label.lines, x + width / 2, y + height / 2, label.size, { fill: highlighted ? ACCENT : INK })}
    </g>`;
  }).join("");
}

function cards(items: { title: string; body: string }[], progress: number, emphasis: string, top: number) {
  const gap = 40;
  const width = (RIGHT - LEFT - gap * (items.length - 1)) / items.length;
  const layouts = items.map((card) => {
    const title = fitWrapped(card.title, width - 70, 2, 44, 26);
    const body = card.body ? fitWrapped(card.body, width - 70, 7, 32, 20) : { lines: [] as string[], size: 20 };
    return { title, body, titleHeight: title.lines.length * Math.ceil(title.size * 1.22), bodyHeight: body.lines.length * Math.ceil(body.size * 1.22) };
  });
  const height = Math.min(BOTTOM - top - 10, Math.max(220, ...layouts.map((layout) => 90 + layout.titleHeight + (layout.bodyHeight ? 24 + layout.bodyHeight : 0) + 56)));
  const baseY = top + (BOTTOM - top - height) / 2;
  return items.map((card, index) => {
    const reveal = ease(stagger(progress, index, items.length));
    if (reveal <= 0) return "";
    const x = LEFT + index * (width + gap);
    const y = baseY + (1 - reveal) * 30;
    const highlighted = isEmphasized(card.title, emphasis) || isEmphasized(card.body, emphasis);
    const { title, body, titleHeight, bodyHeight } = layouts[index];
    const bodyTop = y + 90 + titleHeight + 24;
    return `<g opacity="${reveal.toFixed(3)}">
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="24" fill="${BOX}" stroke="${highlighted ? ACCENT : LINE}" stroke-width="${highlighted ? 6 : 3}"/>
      <rect x="${x + 35}" y="${y + 36}" width="56" height="8" rx="4" fill="${ACCENT}"/>
      ${textBlock(title.lines, x + 35, y + 90 + titleHeight / 2, title.size, { anchor: "start", fill: highlighted ? ACCENT : INK })}
      ${body.lines.length ? textBlock(body.lines, x + 35, bodyTop + bodyHeight / 2, body.size, { anchor: "start", fill: MUTED, weight: 600 }) : ""}
    </g>`;
  }).join("");
}

function plotFrame(points: PedagogyDataPoint[], top: number) {
  const plotLeft = 300;
  const plotRight = 1620;
  const baseline = BOTTOM - 70;
  const plotTop = top + 70;
  const columnWidth = (plotRight - plotLeft) / points.length;
  const centerX = (index: number) => plotLeft + columnWidth * (index + 0.5);
  const labels = points.map((point, index) => {
    const label = fitWrapped(point.label, columnWidth - 16, 2, 30, 20);
    return textBlock(label.lines, centerX(index), baseline + 40, label.size, { fill: MUTED, weight: 700 });
  }).join("");
  return { plotLeft, plotRight, baseline, plotTop, columnWidth, centerX, labels };
}

function barChart(points: PedagogyDataPoint[], progress: number, emphasis: string, top: number) {
  const frame = plotFrame(points, top);
  const maximum = Math.max(...points.map((point) => point.amount.value), 1e-9);
  const barWidth = Math.min(170, frame.columnWidth * 0.56);
  const stepDelay = points.length > 1 ? 0.5 / (points.length - 1) : 0;
  const bars = points.map((point, index) => {
    const grow = ease((progress - index * stepDelay) / 0.5);
    const height = (point.amount.value / maximum) * (frame.baseline - frame.plotTop) * grow;
    const x = frame.centerX(index) - barWidth / 2;
    const highlighted = isEmphasized(point.label, emphasis);
    const value = formatPedagogyNumber(point.amount, point.amount.value * grow);
    return `<rect x="${x}" y="${frame.baseline - height}" width="${barWidth}" height="${Math.max(0, height)}" rx="10" fill="${highlighted ? ACCENT : BLUE}"/>
      ${grow > 0 ? textBlock([value], frame.centerX(index), frame.baseline - height - 34, 34, { fill: highlighted ? ACCENT : INK, opacity: Math.min(1, grow * 2) }) : ""}`;
  }).join("");
  return `<line x1="${frame.plotLeft - 40}" y1="${frame.baseline}" x2="${frame.plotRight + 40}" y2="${frame.baseline}" stroke="${LINE}" stroke-width="4"/>${bars}${frame.labels}`;
}

function lineChart(points: PedagogyDataPoint[], progress: number, emphasis: string, top: number) {
  const frame = plotFrame(points, top);
  const values = points.map((point) => point.amount.value);
  const low = Math.min(0, ...values);
  const high = Math.max(...values);
  const range = high - low || 1;
  const y = (value: number) => frame.baseline - ((value - low) / range) * (frame.baseline - frame.plotTop);
  const coordinates = points.map((point, index) => ({ x: frame.centerX(index), y: y(point.amount.value) }));
  const drawn = ease(progress) * (points.length - 1);
  const whole = Math.floor(drawn);
  const path = coordinates.slice(0, whole + 1).map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`);
  if (whole < points.length - 1) {
    const fraction = drawn - whole;
    const from = coordinates[whole];
    const to = coordinates[whole + 1];
    path.push(`${(from.x + (to.x - from.x) * fraction).toFixed(1)},${(from.y + (to.y - from.y) * fraction).toFixed(1)}`);
  }
  const dots = points.map((point, index) => {
    if (index > drawn + 1e-6) return "";
    const highlighted = isEmphasized(point.label, emphasis);
    const { x, y: pointY } = coordinates[index];
    return `<circle cx="${x}" cy="${pointY}" r="${highlighted ? 16 : 11}" fill="${highlighted ? ACCENT : BLUE}" stroke="${INK}" stroke-width="4"/>
      ${textBlock([formatPedagogyNumber(point.amount)], x, pointY - 44, 34, { fill: highlighted ? ACCENT : INK })}`;
  }).join("");
  return `<line x1="${frame.plotLeft - 40}" y1="${frame.baseline}" x2="${frame.plotRight + 40}" y2="${frame.baseline}" stroke="${LINE}" stroke-width="4"/>
    <polyline points="${path.join(" ")}" fill="none" stroke="${BLUE}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>${dots}${frame.labels}`;
}

function waterfall(points: PedagogyDataPoint[], progress: number, emphasis: string, top: number) {
  const total = points.reduce((sum, point) => sum + point.amount.value, 0);
  const net = { label: "Net", amount: { ...points[0].amount, value: total } };
  const steps: { label: string; start: number; end: number; delta: number; isNet: boolean }[] = [];
  let running = 0;
  for (const point of points) { steps.push({ label: point.label, start: running, end: running + point.amount.value, delta: point.amount.value, isNet: false }); running += point.amount.value; }
  steps.push({ label: net.label, start: 0, end: total, delta: total, isNet: true });
  const frame = plotFrame([...points, net], top);
  const levels = steps.flatMap((step) => [step.start, step.end]);
  const low = Math.min(0, ...levels);
  const high = Math.max(0, ...levels);
  const range = high - low || 1;
  const y = (value: number) => frame.baseline - ((value - low) / range) * (frame.baseline - frame.plotTop);
  const barWidth = Math.min(150, frame.columnWidth * 0.6);
  const bars = steps.map((step, index) => {
    const grow = ease(stagger(progress, index, steps.length));
    if (grow <= 0) return "";
    const current = step.start + (step.end - step.start) * grow;
    const top = Math.min(y(step.start), y(current));
    const height = Math.abs(y(current) - y(step.start));
    const highlighted = isEmphasized(step.label, emphasis);
    const color = step.isNet ? (step.end >= 0 ? GREEN : ACCENT) : (step.delta >= 0 ? GREEN : ACCENT);
    const x = frame.centerX(index) - barWidth / 2;
    const connector = index < steps.length - 1 && grow >= 1 && !steps[index + 1].isNet
      ? `<line x1="${x + barWidth}" y1="${y(step.end)}" x2="${frame.centerX(index + 1) - barWidth / 2}" y2="${y(step.end)}" stroke="${MUTED}" stroke-width="3" stroke-dasharray="8 8"/>` : "";
    const labelY = top - 34;
    const amount = step.isNet ? net.amount : points[index].amount;
    return `<rect x="${x}" y="${top}" width="${barWidth}" height="${Math.max(2, height)}" rx="8" fill="${color}"${step.isNet ? ` stroke="${INK}" stroke-width="4"` : ""}${highlighted ? ` stroke="${INK}" stroke-width="6"` : ""}/>
      ${textBlock([formatPedagogyNumber(amount, step.isNet ? total * grow : step.delta * grow, !step.isNet)], frame.centerX(index), labelY, 32, { fill: highlighted ? ACCENT : INK, opacity: Math.min(1, grow * 2) })}${connector}`;
  }).join("");
  return `<line x1="${frame.plotLeft - 40}" y1="${y(0)}" x2="${frame.plotRight + 40}" y2="${y(0)}" stroke="${LINE}" stroke-width="4"/>${bars}${frame.labels}`;
}

function counter(amount: Extract<PedagogyVisual, { kind: "counter" }>["amount"], progress: number, top: number) {
  const value = formatPedagogyNumber({ ...amount, suffix: "" }, amount.value * ease(progress));
  const suffixInline = amount.suffix.trim().length <= 6;
  const headline = suffixInline ? `${value}${amount.suffix}` : value;
  const size = Math.min(220, Math.floor(1400 / Math.max(1, headline.length * 0.62)));
  const centerY = top + (BOTTOM - top) / 2 - (suffixInline ? 0 : 40);
  const suffix = suffixInline ? "" : textBlock(fitWrapped(amount.suffix.trim(), 1300, 2, 60, 36).lines, 960, centerY + size * 0.55 + 50, 56, { fill: MUTED });
  return `${textBlock([headline], 960, centerY, size, { fill: INK, weight: 800 })}${suffix}`;
}

function logoGrid(names: string[], progress: number, emphasis: string, top: number, logos: PedagogyLogoImages | undefined) {
  const columns = Math.min(4, names.length);
  const rows = Math.ceil(names.length / 4);
  const tileWidth = 300;
  const tileHeight = 170;
  const gap = 44;
  const gridHeight = rows * tileHeight + (rows - 1) * gap;
  const startY = top + (BOTTOM - top - gridHeight) / 2;
  return names.map((name, index) => {
    const reveal = ease(stagger(progress, index, names.length));
    if (reveal <= 0) return "";
    const row = Math.floor(index / 4);
    const inRow = row === rows - 1 ? names.length - row * 4 : columns;
    const rowWidth = inRow * tileWidth + (inRow - 1) * gap;
    const x = 960 - rowWidth / 2 + (index % 4) * (tileWidth + gap);
    const y = startY + row * (tileHeight + gap) + (1 - reveal) * 20;
    const highlighted = isEmphasized(name, emphasis);
    const image = logos?.get(name);
    const inner = image
      ? `<image href="${image}" x="${x + 26}" y="${y + 22}" width="${tileWidth - 52}" height="${tileHeight - 44}" preserveAspectRatio="xMidYMid meet"/>`
      : textBlock(fitWrapped(name.toUpperCase().replaceAll("-", " "), tileWidth - 40, 2, 40, 22).lines, x + tileWidth / 2, y + tileHeight / 2, 34, { fill: INK, weight: 800 });
    return `<g opacity="${reveal.toFixed(3)}"><rect x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" rx="22" fill="${image ? "#ffffff" : BOX}" stroke="${highlighted ? ACCENT : LINE}" stroke-width="${highlighted ? 7 : 3}"/>${inner}</g>`;
  }).join("");
}

function visualMarkup(state: PedagogyVisualSlideState, top: number) {
  const { visual, progress, emphasis } = state;
  if (visual.kind === "flowchart") return flowchart(visual.steps, progress, emphasis, top);
  if (visual.kind === "cards") return cards(visual.cards, progress, emphasis, top);
  if (visual.kind === "bar") return barChart(visual.points, progress, emphasis, top);
  if (visual.kind === "line") return lineChart(visual.points, progress, emphasis, top);
  if (visual.kind === "waterfall") return waterfall(visual.points, progress, emphasis, top);
  if (visual.kind === "counter") return counter(visual.amount, progress, top);
  if (visual.kind === "logo") return logoGrid(visual.names, progress, emphasis, top, state.logos);
  return "";
}

export async function createPedagogyVisualSlide(state: PedagogyVisualSlideState) {
  const title = titleMarkup(state.title, state.emphasis);
  const svg = `${pedagogyFrameOpen(state)}
    <text x="230" y="${state.title.trim() ? 200 : 228}" font-family="${FONT}" font-size="24" font-weight="800" letter-spacing="3" fill="${MUTED}">${escapeXml(state.questionId || "BOARD")}</text>
    ${title.markup}
    ${visualMarkup(state, title.contentTop)}
  ${pedagogyFrameClose}`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Animation frames for one row: the visual builds over the first ~1.6 s, then the last frame holds for the rest of the slot. */
export async function createPedagogyVisualFrames(state: Omit<PedagogyVisualSlideState, "progress">, allocatedDuration: number) {
  const animationSeconds = Math.min(MAXIMUM_ANIMATION_SECONDS, allocatedDuration * 0.5);
  const frameCount = Math.max(2, Math.round(animationSeconds * ANIMATION_FPS));
  const frameDuration = 1 / ANIMATION_FPS;
  const frames: { png: Buffer; duration: number }[] = [];
  for (let index = 0; index < frameCount; index += 1) {
    const progress = index / (frameCount - 1);
    const isLast = index === frameCount - 1;
    frames.push({ png: await createPedagogyVisualSlide({ ...state, progress }), duration: isLast ? Math.max(frameDuration, allocatedDuration - frameDuration * (frameCount - 1)) : frameDuration });
  }
  return frames;
}

/** Loads official logo files from public/pedagogy-logos/<name>.(svg|png|jpg|jpeg|webp). A missing file maps to null and is drawn as the name. */
export async function loadPedagogyLogos(names: Iterable<string>, directory = pedagogyLogoDirectory()) {
  const logos: PedagogyLogoImages = new Map();
  for (const name of new Set(names)) {
    let image: string | null = null;
    for (const extension of logoExtensions) {
      const file = await readFile(join(directory, `${name}.${extension}`)).catch(() => null);
      if (!file) continue;
      const png = await sharp(file, extension === "svg" ? { density: 300 } : {}).resize({ width: 600, height: 340, fit: "inside", withoutEnlargement: false }).png().toBuffer();
      image = `data:image/png;base64,${png.toString("base64")}`;
      break;
    }
    logos.set(name, image);
  }
  return logos;
}

export const pedagogyBackgroundDirectory = () => join(process.cwd(), "public", "pedagogy-backgrounds");

/** Loads background images from public/pedagogy-backgrounds/<name>.(jpg|jpeg|png|webp), cropped to 1920×1080. Missing files map to null. */
export async function loadPedagogyBackgrounds(names: Iterable<string>, directory = pedagogyBackgroundDirectory()) {
  const backgrounds = new Map<string, string | null>();
  for (const name of new Set(names)) {
    let image: string | null = null;
    for (const extension of ["jpg", "jpeg", "png", "webp"]) {
      const file = await readFile(join(directory, `${name}.${extension}`)).catch(() => null);
      if (!file) continue;
      const jpeg = await sharp(file).resize(1920, 1080, { fit: "cover" }).blur(7).modulate({ saturation: 1.15 }).jpeg({ quality: 82 }).toBuffer();
      image = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
      break;
    }
    backgrounds.set(name, image);
  }
  return backgrounds;
}
