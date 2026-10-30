import sharp from "sharp";
import { SOLUTION_COLOURS, type SolutionDiagram } from "@/lib/pedagogy-solution";

// layout = solution: the concept board approved as the FRAME house style (Oct 2026). Still background. The diagram
// draws itself as it is narrated: on each row the newly drawn items animate in (an arc traces with its arrowhead,
// a bar grows, unit blocks fill one by one, the wall rises, the bracket stretches), and a new step card rises in.

export type SolutionSlideState = {
  chapter: string;
  questionId: string;
  title: string;
  emphasis: string;
  problem: string;
  diagram: SolutionDiagram;
  steps: { text: string; answer: boolean }[];
  /** Step cards showing (0 = question and diagram only). */
  shown: number;
  timeLabel: string;
  /** Diagram items drawn by this row, and by the row before (items in between animate in). */
  drawn: number;
  drawnBefore: number;
  /** Step cards showing on the row before (a new card rises in). */
  shownBefore: number;
  /** One size per video: the smallest problem / card text any solution slide needed (from solutionSlideSizes). */
  sizes?: { problem: number; card: number };
  /** Optional MCQ options (option_a … option_e, blanks skipped). Shown as chips under the problem; the option the
   * answer card names ("Option D …") turns yellow once the answer card is showing. */
  options?: string[];
};

const BG = "#0f1724", INK = "#e8eef9", MUTED = "#7d8aa0", SOFT = "#b5c0d0", CARD = "#172235", CARD_LINE = "#263552", TRACK = "#34445e";
const { blue: BLUE, yellow: YELLOW } = SOLUTION_COLOURS;
const FONT = "Arial, 'Helvetica Neue', 'DejaVu Sans', sans-serif";
// The diagram box moves down when option chips sit under the problem (set per slide in solutionSlideSvg).
let DIAGRAM_TOP = 372, DIAGRAM_HEIGHT = 470;
const DIAGRAM_BOTTOM = 842, CARD_TOP = 862, CARD_HEIGHT = 150, SIDE = 96;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const ease = (value: number) => 1 - (1 - clamp(value)) ** 3;
const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
/** Rough Arial width; text is wrapped and shrunk with a safety margin so it never spills. */
const width = (text: string, size: number, bold = false) => text.length * size * (bold ? 0.56 : 0.5);

function wrap(text: string, size: number, maxWidth: number, bold = false) {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (current && width(next, size, bold) > maxWidth) { lines.push(current); current = word; } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

function fit(text: string, maxWidth: number, maxLines: number, largest: number, smallest: number, bold = false) {
  for (let size = largest; size >= smallest; size -= 2) {
    const lines = wrap(text, size, maxWidth, bold);
    if (lines.length <= maxLines && lines.every((line) => width(line, size, bold) <= maxWidth)) return { lines, size };
  }
  return { lines: wrap(text, smallest, maxWidth, bold), size: smallest };
}

/** *stars* -> yellow bold tspans. */
function rich(text: string, highlight = YELLOW) {
  return text.split("*").map((part, index) => index % 2 ? `<tspan fill="${highlight}" font-weight="700">${esc(part)}</tspan>` : esc(part)).join("");
}

function textAt(content: string, x: number, y: number, size: number, fill: string, options: { anchor?: string; weight?: number; spacing?: number } = {}) {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${FONT}" font-size="${size}" font-weight="${options.weight ?? 400}" fill="${fill}" text-anchor="${options.anchor ?? "start"}"${options.spacing ? ` letter-spacing="${options.spacing}"` : ""}>${content}</text>`;
}

function arrowMarkers() {
  return `<defs>${Object.values(SOLUTION_COLOURS).map((colour) => `<marker id="ah${colour.slice(1)}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${colour}"/></marker>`).join("")}</defs>`;
}

/** How far item `order` is drawn (0 hidden … 1 done). New items on this row draw one after another. */
type Reveal = (order: number) => number;
function revealer(drawn: number, drawnBefore: number, progress: number): Reveal {
  const fresh = Math.max(0, drawn - drawnBefore);
  return (order) => {
    if (order < drawnBefore) return 1;
    if (order >= drawn) return 0;
    return ease(progress * fresh - (order - drawnBefore));
  };
}

/** Point on a quadratic curve, for tracing an arc only part of the way. */
function quadraticPart(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, t: number) {
  const ax = x0 + (cx - x0) * t, ay = y0 + (cy - y0) * t;
  const bx = cx + (x1 - cx) * t, by = cy + (y1 - cy) * t;
  return { cx: ax, cy: ay, x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
}

function numberline(d: Extract<SolutionDiagram, { kind: "numberline" }>, shown: Reveal) {
  const values = [...d.points.map((point) => point.at), ...(d.wall ? [d.wall.at] : [])];
  const low = Math.min(...values), high = Math.max(...values);
  const X = (value: number) => 360 + ((value - low) / (high - low)) * 1200;
  const y = DIAGRAM_TOP + 250;
  const nearest = (value: number) => d.points.reduce((best, point) => Math.abs(point.at - value) < Math.abs(best.at - value) ? point : best, d.points[0]);
  let svg = `<line x1="175" y1="${y}" x2="1745" y2="${y}" stroke="${TRACK}" stroke-width="6" stroke-linecap="round"/>`;
  if (d.wall && shown(d.wall.order) > 0) {
    const r = shown(d.wall.order), wx = X(d.wall.at), h = 200 * r;
    svg += `<rect x="${wx - 18}" y="${(y + 40 - h).toFixed(1)}" width="36" height="${h.toFixed(1)}" rx="4" fill="${YELLOW}"/>`;
    for (let k = 1; k <= 3; k += 1) if (y - 160 + k * 45 > y + 40 - h) svg += `<line x1="${wx - 18}" y1="${y - 160 + k * 45}" x2="${wx + 18}" y2="${y - 160 + k * 45}" stroke="#c9963a" stroke-width="3"/>`;
    svg += `<g opacity="${r.toFixed(3)}">${textAt(esc(d.wall.label), wx, y - 180, 30, YELLOW, { anchor: "middle", weight: 700, spacing: 1 })}</g>`;
  }
  for (const arc of d.arcs) {
    const r = shown(arc.order);
    if (r <= 0) continue;
    const colour = arc.colour ?? nearest(arc.from).colour;
    const xa = X(arc.from);
    const xb = X(arc.to) + (X(arc.to) > xa ? -28 : 28);
    const mid = (xa + xb) / 2;
    // The arc traces from its start; the arrowhead rides on the moving tip.
    const part = quadraticPart(xa, y - 40, mid, y - 130, xb, y - 50, Math.max(0.02, r));
    svg += `<path d="M${xa.toFixed(1)} ${y - 40} Q${part.cx.toFixed(1)} ${part.cy.toFixed(1)} ${part.x.toFixed(1)} ${part.y.toFixed(1)}" fill="none" stroke="${colour}" stroke-width="5" stroke-dasharray="14 10" marker-end="url(#ah${colour.slice(1)})"/>`;
    svg += `<g opacity="${clamp(r * 1.6 - 0.6).toFixed(3)}">${textAt(esc(arc.label), mid, y - 118, 34, colour, { anchor: "middle" })}</g>`;
  }
  for (const point of d.points) {
    const r = shown(point.order);
    if (r <= 0) continue;
    // Pops in slightly larger, then settles.
    const radius = 18 * (r < 1 ? 0.4 + 0.9 * r : 1);
    svg += `<g opacity="${clamp(r * 2).toFixed(3)}"><circle cx="${X(point.at).toFixed(1)}" cy="${y}" r="${radius.toFixed(1)}" fill="${point.colour}"/>`;
    svg += `${textAt(esc(point.label), X(point.at), y + 62, 32, point.colour, { anchor: "middle", weight: 700 })}</g>`;
  }
  if (d.bracket && shown(d.bracket.order) > 0) {
    const r = shown(d.bracket.order);
    const x1 = X(d.bracket.from), x2 = X(d.bracket.to), by = y + 112, middle = (x1 + x2) / 2;
    const gap = Math.min(width(d.bracket.label, 32) / 2 + 40, Math.abs(x2 - x1) / 2);
    // Stretches out from the middle to both ends.
    const left = middle - (middle - x1) * r, right = middle + (x2 - middle) * r;
    svg += `<path d="M${left.toFixed(1)} ${by}H${Math.max(left, middle - gap).toFixed(1)}M${Math.min(right, middle + gap).toFixed(1)} ${by}H${right.toFixed(1)}" stroke="${BLUE}" stroke-width="3" fill="none"/>`;
    if (r >= 1) svg += `<path d="M${x1} ${by - 14}v28M${x2} ${by - 14}v28" stroke="${BLUE}" stroke-width="3"/>`;
    svg += `<g opacity="${clamp(r * 1.5 - 0.5).toFixed(3)}">${textAt(esc(d.bracket.label), middle, by + 11, 32, BLUE, { anchor: "middle" })}</g>`;
  }
  return svg;
}

function barsOrUnits(d: Extract<SolutionDiagram, { kind: "units" | "bars" }>, shown: Reveal) {
  const n = d.rows.length;
  const gap = Math.min(110, 380 / n);
  const top = DIAGRAM_TOP + (DIAGRAM_HEIGHT - 60 - gap * n) / 2 + 20;
  const max = Math.max(...d.rows.map((row) => row.value));
  const barHeight = Math.min(64, gap - 26);
  let svg = "";
  for (const [i, row] of d.rows.entries()) {
    const r = shown(row.order);
    if (r <= 0) continue;
    const y = top + i * gap;
    svg += `<g opacity="${clamp(r * 3).toFixed(3)}">${textAt(esc(row.label), 560, y + barHeight / 2 + 11, 32, "#cfd8e6", { anchor: "end", weight: 600 })}</g>`;
    let end: number;
    if (d.kind === "units") {
      // Blocks fill one by one.
      const unit = Math.min(96, 1000 / max);
      const filled = r * row.value;
      for (let k = 0; k < row.value; k += 1) {
        const block = clamp(filled - k);
        if (block <= 0) break;
        svg += `<rect x="${(590 + k * unit).toFixed(1)}" y="${(y + (1 - block) * 16).toFixed(1)}" width="${(unit - 8).toFixed(1)}" height="${barHeight}" rx="8" fill="${row.colour}" opacity="${(0.9 * block).toFixed(3)}"/>`;
      }
      end = 590 + row.value * unit;
    } else {
      const length = ((820 * row.value) / max);
      svg += `<rect x="590" y="${y.toFixed(1)}" width="${Math.max(1, length * r).toFixed(1)}" height="${barHeight}" rx="8" fill="${row.colour}" opacity="0.9"/>`;
      end = 598 + length;
    }
    if (row.caption) svg += `<g opacity="${clamp(r * 2 - 1).toFixed(3)}">${textAt(esc(row.caption), end + 20, y + barHeight / 2 + 11, 32, row.colour, { weight: 700 })}</g>`;
  }
  if (d.note && shown(d.note.order) > 0) svg += `<g opacity="${shown(d.note.order).toFixed(3)}">${textAt(esc(d.note.text), 960, top + gap * n + 30, 32, BLUE, { anchor: "middle" })}</g>`;
  return svg;
}

function chain(d: Extract<SolutionDiagram, { kind: "chain" }>, shown: Reveal) {
  const n = d.nodes.length;
  const boxWidth = Math.min(330, (1640 - (n - 1) * 120) / n);
  const x0 = (1920 - (n * boxWidth + (n - 1) * 120)) / 2, y = DIAGRAM_TOP + 170, boxHeight = 110;
  let svg = "";
  for (const [i, node] of d.nodes.entries()) {
    const r = shown(node.order);
    if (r <= 0) continue;
    const x = x0 + i * (boxWidth + 120);
    const last = i === n - 1;
    // From the second box on, the arrow grows first, then the box appears at its tip.
    const arrow = i === 0 ? 1 : clamp(r * 2);
    const box = i === 0 ? r : clamp(r * 2 - 1);
    if (i > 0) {
      const ax = x - 108;
      svg += `<line x1="${ax.toFixed(1)}" y1="${y + boxHeight / 2}" x2="${(ax + 90 * arrow).toFixed(1)}" y2="${y + boxHeight / 2}" stroke="${BLUE}" stroke-width="5" marker-end="url(#ah${BLUE.slice(1)})"/>`;
      const op = fit(d.operations[i - 1] ?? "", 220, 1, 28, 20);
      svg += `<g opacity="${arrow.toFixed(3)}">${textAt(esc(op.lines[0] ?? ""), ax + 48, y - 24, op.size, BLUE, { anchor: "middle" })}</g>`;
    }
    if (box <= 0) continue;
    const text = fit(node.text, boxWidth - 30, 2, 34, 22, true);
    const lineHeight = text.size * 1.2;
    svg += `<g opacity="${box.toFixed(3)}"><rect x="${x.toFixed(1)}" y="${y}" width="${boxWidth.toFixed(1)}" height="${boxHeight}" rx="18" fill="${last ? YELLOW : "#182236"}" stroke="${last ? YELLOW : "#2c3a55"}" stroke-width="3"/>`;
    text.lines.forEach((line, k) => { svg += textAt(esc(line), x + boxWidth / 2, y + boxHeight / 2 + text.size * 0.35 - ((text.lines.length - 1) * lineHeight) / 2 + k * lineHeight, text.size, last ? "#111827" : INK, { anchor: "middle", weight: 700 }); });
    svg += "</g>";
  }
  if (d.note && shown(d.note.order) > 0) svg += `<g opacity="${shown(d.note.order).toFixed(3)}">${textAt(esc(d.note.text), 960, y + boxHeight + 90, 30, "#9fb0c8", { anchor: "middle" })}</g>`;
  return svg;
}

function table(d: Extract<SolutionDiagram, { kind: "table" }>, shown: Reveal) {
  const columns = d.header.length;
  const all = d.rows;
  const size = all.length > 5 ? 28 : 32;
  const columnWidths = Array.from({ length: columns }, (_, c) => Math.max(...all.map((row) => width(row.cells[c].replaceAll("*", ""), size, true))) + 80);
  const total = columnWidths.reduce((a, b) => a + b, 0);
  const rowHeight = Math.min(64, (DIAGRAM_HEIGHT - 90) / all.length);
  const tableHeight = rowHeight * all.length + (d.note ? 60 : 0);
  const top = DIAGRAM_TOP + (DIAGRAM_HEIGHT - tableHeight) / 2;
  const left = (1920 - total) / 2;
  let svg = "";
  for (const [r, row] of all.entries()) {
    const reveal = shown(row.order);
    if (reveal <= 0) continue;
    const y = top + r * rowHeight + (1 - reveal) * 14;
    let x = left;
    svg += `<g opacity="${reveal.toFixed(3)}">`;
    for (const [c, cell] of row.cells.entries()) {
      svg += textAt(r === 0 ? esc(cell) : rich(cell), x + columnWidths[c] / 2, y + rowHeight / 2 + size * 0.35, size, r === 0 ? "#8cc4ff" : INK, { anchor: "middle", weight: r === 0 ? 700 : 400 });
      x += columnWidths[c];
    }
    svg += `<line x1="${left}" y1="${(y + rowHeight).toFixed(1)}" x2="${left + total}" y2="${(y + rowHeight).toFixed(1)}" stroke="${r === 0 ? "#2c3a55" : "#223049"}" stroke-width="${r === 0 ? 3 : 1}"/></g>`;
  }
  if (d.note && shown(d.note.order) > 0) svg += `<g opacity="${shown(d.note.order).toFixed(3)}">${textAt(esc(d.note.text), 960, top + rowHeight * all.length + 48, 30, BLUE, { anchor: "middle" })}</g>`;
  return svg;
}

function diagramMarkup(d: SolutionDiagram, shown: Reveal) {
  if (d.kind === "numberline") return numberline(d, shown);
  if (d.kind === "units" || d.kind === "bars") return barsOrUnits(d, shown);
  if (d.kind === "chain") return chain(d, shown);
  if (d.kind === "table") return table(d, shown);
  return "";
}

/** Card x positions: answer card is 0.8 the width of a step card. */
function cardBoxes(steps: SolutionSlideState["steps"]) {
  const gap = 28, available = 1920 - SIDE * 2 - gap * (steps.length - 1);
  const weights = steps.map((step) => (step.answer ? 0.8 : 1));
  const unit = available / weights.reduce((a, b) => a + b, 0);
  let x = SIDE;
  return weights.map((weight) => { const box = { x, w: weight * unit }; x += weight * unit + gap; return box; });
}

/** Smallest problem and card sizes this slide needs; the video uses one size for every solution slide. */
export function solutionSlideSizes(state: Pick<SolutionSlideState, "problem" | "steps">) {
  const problem = fit(plainProblem(state.problem), 1920 - SIDE * 2, 3, 30, 22).size;
  const boxes = cardBoxes(state.steps);
  const card = Math.min(28, ...state.steps.map((step, i) => fit(step.text, boxes[i].w - 56, step.answer ? 2 : 3, step.answer ? 32 : 28, 18, step.answer).size));
  return { problem, card };
}

const OPTION_SIZE = 26, OPTION_HEIGHT = 52, OPTION_GAP = 16;
const LETTERS = ["A", "B", "C", "D", "E"];

const RED = SOLUTION_COLOURS.red;

/** Problem words; *starred* stretches are error parts. Stretch n (1, 2 …) turns red once step card n is showing. */
function problemWords(problem: string) {
  const words: { text: string; mark: number }[] = [];
  let inside = false, mark = 0;
  for (const raw of problem.split(/\s+/).filter(Boolean)) {
    let text = raw;
    if (text.startsWith("*")) { inside = true; mark += 1; text = text.slice(1); }
    const closes = text.endsWith("*");
    if (closes) text = text.slice(0, -1);
    if (text) words.push({ text, mark: inside ? mark : 0 });
    if (closes) inside = false;
  }
  return words;
}
export const plainProblem = (problem: string) => problemWords(problem).map((word) => word.text).join(" ");

/** Option chips flow left to right and wrap (at most two rows), under the problem. */
function optionChips(options: string[], top: number) {
  const chips: { text: string; x: number; y: number; w: number }[] = [];
  let x = SIDE, y = top;
  for (const [i, option] of options.entries()) {
    const text = `${LETTERS[i]}. ${option}`;
    const w = width(text, OPTION_SIZE) + 44;
    if (x > SIDE && x + w > 1920 - SIDE) { x = SIDE; y += OPTION_HEIGHT + 12; }
    chips.push({ text, x, y, w });
    x += w + OPTION_GAP;
  }
  return { chips, bottom: chips.length ? y + OPTION_HEIGHT : top };
}

/** The option letter the answer card names, e.g. "Option D: Only A and C" → D. */
export function answeredOption(steps: SolutionSlideState["steps"]) {
  const answer = steps.find((step) => step.answer)?.text ?? "";
  return answer.match(/\boption\s*\(?([A-E])\)?/i)?.[1]?.toUpperCase() ?? "";
}

export function solutionSlideSvg(state: SolutionSlideState, progress = 1) {
  // When the diagram also draws on this row, the new card rises in after it.
  const reveal = ease(state.drawn > state.drawnBefore ? (progress - 0.6) / 0.4 : progress);
  const sizes = state.sizes ?? solutionSlideSizes(state);
  // Pill: chapter and question.
  const pill = [state.chapter, state.questionId].filter((part) => part.trim()).join(" · ").toUpperCase();
  // Capitals run wider than mixed text, and the pill text is letter-spaced.
  const pillWidth = pill.length * 28 * 0.68 + pill.length * 1.5 + 52;
  // Title with the emphasised word in yellow.
  const titleFit = fit(state.title, 1920 - SIDE * 2, 1, 72, 44, true);
  const titleLine = titleFit.lines[0] ?? "";
  const emphasis = state.emphasis.trim();
  const titleSvg = emphasis && titleLine.includes(emphasis)
    ? titleLine.split(emphasis).map((part) => esc(part)).join(`<tspan fill="${YELLOW}">${esc(emphasis)}</tspan>`)
    : esc(titleLine);
  const words = problemWords(state.problem);
  const problem = fit(words.map((word) => word.text).join(" "), 1920 - SIDE * 2, 3, sizes.problem, sizes.problem);
  // Error parts (starred in the sheet) turn red, underlined, as their step card comes in.
  let cursor = 0;
  const problemSvg = problem.lines.map((line, i) => {
    const lineWords = words.slice(cursor, cursor + line.split(" ").length);
    cursor += lineWords.length;
    // Consecutive red words share one tspan so the underline runs unbroken.
    const groups: { red: boolean; text: string[] }[] = [];
    for (const word of lineWords) {
      const red = Boolean(word.mark && word.mark <= state.shown);
      if (groups.length && groups[groups.length - 1].red === red) groups[groups.length - 1].text.push(word.text);
      else groups.push({ red, text: [word.text] });
    }
    const content = groups.map((group) => group.red
      ? `<tspan fill="${RED}" font-weight="700" text-decoration="underline">${esc(group.text.join(" "))}</tspan>` : esc(group.text.join(" "))).join(" ");
    return textAt(content, SIDE, 282 + i * problem.size * 1.5, problem.size, SOFT);
  }).join("");
  // MCQ options: chips under the problem; the diagram box starts below them.
  const options = (state.options ?? []).map((option) => option.trim());
  const listed = options.map((option, i) => ({ option, letter: LETTERS[i] })).filter((entry) => entry.option);
  const lastProblemLine = 282 + Math.max(0, problem.lines.length - 1) * problem.size * 1.5;
  const { chips, bottom } = optionChips(listed.map((entry) => entry.option), lastProblemLine + 30);
  const answerShowing = state.steps.some((step, i) => step.answer && i < state.shown);
  const correct = answerShowing ? answeredOption(state.steps) : "";
  const optionsSvg = chips.map((chip, i) => {
    const hit = listed[i].letter === correct;
    const text = `${listed[i].letter}. ${listed[i].option}`;
    return `<rect x="${chip.x.toFixed(1)}" y="${chip.y.toFixed(1)}" width="${chip.w.toFixed(1)}" height="${OPTION_HEIGHT}" rx="12" fill="${hit ? YELLOW : CARD}" stroke="${hit ? YELLOW : CARD_LINE}" stroke-width="2"/>`
      + textAt(esc(text), chip.x + 22, chip.y + OPTION_HEIGHT / 2 + OPTION_SIZE * 0.36, OPTION_SIZE, hit ? "#111827" : INK, { weight: hit ? 700 : 400 });
  }).join("");
  DIAGRAM_TOP = chips.length ? Math.max(372, bottom + 24) : 372;
  DIAGRAM_HEIGHT = DIAGRAM_BOTTOM - DIAGRAM_TOP;
  const shownDiagram = revealer(state.drawn, state.drawnBefore, progress);
  const boxes = cardBoxes(state.steps);
  let cards = "";
  let stepNumber = 0;
  for (const [i, step] of state.steps.entries()) {
    if (!step.answer) stepNumber += 1;
    if (i >= state.shown) continue;
    const newest = i >= state.shownBefore && i === state.shown - 1;
    const opacity = newest ? reveal : 1;
    const y = CARD_TOP + (newest ? (1 - reveal) * 24 : 0);
    const { x, w } = boxes[i];
    const text = fit(step.text, w - 56, step.answer ? 2 : 3, step.answer ? sizes.card + 4 : sizes.card, 18, step.answer);
    const lines = text.lines.map((line, k) => textAt(esc(line), x + 30, y + 92 + k * text.size * 1.3, text.size, step.answer ? "#111827" : INK, { weight: step.answer ? 700 : 400 })).join("");
    cards += `<g opacity="${opacity.toFixed(3)}"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${CARD_HEIGHT}" rx="16" fill="${step.answer ? YELLOW : CARD}" stroke="${step.answer ? YELLOW : CARD_LINE}" stroke-width="2"/>`
      + textAt(step.answer ? "ANSWER" : `STEP ${stepNumber}`, x + 30, y + 46, 20, step.answer ? "#6b5212" : MUTED, { weight: 700, spacing: 3 }) + `${lines}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${arrowMarkers()}
    <rect width="1920" height="1080" fill="${BG}"/>
    ${pill ? `<rect x="${SIDE}" y="56" width="${pillWidth.toFixed(1)}" height="50" rx="25" fill="#1d3557"/>${textAt(esc(pill), SIDE + 26, 91, 28, "#8cc4ff", { spacing: 1.5 })}` : ""}
    ${textAt(esc(state.timeLabel), 1920 - SIDE, 92, 26, MUTED, { anchor: "end" })}
    ${textAt(titleSvg, SIDE, 205, titleFit.size, INK, { weight: 800 })}
    ${problemSvg}
    ${optionsSvg}
    ${diagramMarkup(state.diagram, shownDiagram)}
    ${cards}
    ${textAt("FRAME", 1920 - SIDE, 1052, 20, "#4f5d75", { anchor: "end", spacing: 2 })}
  </svg>`;
}

export async function createSolutionSlide(state: SolutionSlideState, progress = 1, portrait = false) {
  return sharp(Buffer.from(portrait ? solutionSlideSvgPortrait(state, progress) : solutionSlideSvg(state, progress))).png().toBuffer();
}

/** Drawing runs at 16 frames a second: about 1 s per newly drawn item, at most 2 s per row. */
export const SOLUTION_FRAME_SECONDS = 1 / 16;
export function solutionAnimationFrames(newItems: number, newCard: boolean) {
  if (!newItems && !newCard) return 0;
  return Math.min(32, Math.max(10, newItems * 14));
}

// Portrait (1080 × 1920, Oct 30 2026): title and problem on top, the trick diagram (drawn by the landscape code and
// scaled to the phone width), then the step cards stacked full width. The landscape slide above is unchanged.
const PW = 1080, PH = 1920, PS = 64, PR = PW - PS;

export function solutionSlideSvgPortrait(state: SolutionSlideState, progress = 1) {
  const reveal = ease(state.drawn > state.drawnBefore ? (progress - 0.6) / 0.4 : progress);
  const pill = [state.chapter, state.questionId].filter((part) => part.trim()).join(" · ").toUpperCase();
  const pillWidth = Math.min(PR - PS - 150, pill.length * 26 * 0.68 + pill.length * 1.5 + 52);
  const titleFit = fit(state.title, PR - PS, 2, 64, 44, true);
  const emphasis = state.emphasis.trim();
  const titleSvg = titleFit.lines.map((line, i) => textAt(emphasis && line.includes(emphasis)
    ? line.split(emphasis).map((part) => esc(part)).join(`<tspan fill="${YELLOW}">${esc(emphasis)}</tspan>`) : esc(line), PS, 210 + i * titleFit.size * 1.15, titleFit.size, INK, { weight: 800 })).join("");
  let y = 210 + (titleFit.lines.length - 1) * titleFit.size * 1.15 + 76;
  const words = problemWords(state.problem);
  const problem = fit(words.map((word) => word.text).join(" "), PR - PS, 6, 34, 26);
  let cursor = 0;
  const problemSvg = problem.lines.map((line, i) => {
    const lineWords = words.slice(cursor, cursor + line.split(" ").length);
    cursor += lineWords.length;
    const groups: { red: boolean; text: string[] }[] = [];
    for (const word of lineWords) {
      const red = Boolean(word.mark && word.mark <= state.shown);
      if (groups.length && groups[groups.length - 1].red === red) groups[groups.length - 1].text.push(word.text);
      else groups.push({ red, text: [word.text] });
    }
    const content = groups.map((group) => group.red
      ? `<tspan fill="${RED}" font-weight="700" text-decoration="underline">${esc(group.text.join(" "))}</tspan>` : esc(group.text.join(" "))).join(" ");
    return textAt(content, PS, y + i * problem.size * 1.45, problem.size, SOFT);
  }).join("");
  y += Math.max(0, problem.lines.length - 1) * problem.size * 1.45 + 34;
  // Options: one chip per row, full width.
  const options = (state.options ?? []).map((option) => option.trim());
  const listed = options.map((option, i) => ({ option, letter: LETTERS[i] })).filter((entry) => entry.option);
  const answerShowing = state.steps.some((step, i) => step.answer && i < state.shown);
  const correct = answerShowing ? answeredOption(state.steps) : "";
  const optionsSvg = listed.map((entry, i) => {
    const hit = entry.letter === correct, top = y + i * (OPTION_HEIGHT + 10);
    return `<rect x="${PS}" y="${top.toFixed(1)}" width="${PR - PS}" height="${OPTION_HEIGHT}" rx="12" fill="${hit ? YELLOW : CARD}" stroke="${hit ? YELLOW : CARD_LINE}" stroke-width="2"/>`
      + textAt(esc(`${entry.letter}. ${entry.option}`), PS + 22, top + OPTION_HEIGHT / 2 + OPTION_SIZE * 0.36, OPTION_SIZE + 2, hit ? "#111827" : INK, { weight: hit ? 700 : 400 });
  }).join("");
  if (listed.length) y += listed.length * (OPTION_HEIGHT + 10) + 14;
  // Diagram: the landscape drawing area (x 120–1800) scaled to the phone width.
  let diagramSvg = "";
  if (state.diagram.kind !== "none") {
    DIAGRAM_TOP = 372; DIAGRAM_HEIGHT = DIAGRAM_BOTTOM - DIAGRAM_TOP;
    const vbX = 120, vbW = 1680, k = (PR - PS + 40) / vbW, h = DIAGRAM_HEIGHT * k;
    diagramSvg = `<rect x="${PS - 20}" y="${y.toFixed(1)}" width="${PR - PS + 40}" height="${h.toFixed(1)}" rx="16" fill="#131d2e"/>`
      + `<svg x="${PS - 20}" y="${y.toFixed(1)}" width="${PR - PS + 40}" height="${h.toFixed(1)}" viewBox="${vbX} ${DIAGRAM_TOP} ${vbW} ${DIAGRAM_HEIGHT}">${diagramMarkup(state.diagram, revealer(state.drawn, state.drawnBefore, progress))}</svg>`;
    y += h + 30;
  }
  // Step cards stacked, full width; the newest rises in.
  const room = PH - 90 - y, count = Math.max(1, state.steps.length);
  const cardH = Math.max(110, Math.min(170, (room - (count - 1) * 18) / count));
  let cards = "", stepNumber = 0;
  for (const [i, step] of state.steps.entries()) {
    if (!step.answer) stepNumber += 1;
    if (i >= state.shown) continue;
    const newest = i >= state.shownBefore && i === state.shown - 1;
    const opacity = newest ? reveal : 1;
    const top = y + i * (cardH + 18) + (newest ? (1 - reveal) * 24 : 0);
    const text = fit(step.text, PR - PS - 60, cardH >= 150 ? 3 : 2, step.answer ? 36 : 32, 22, step.answer);
    const lines = text.lines.map((line, k) => textAt(esc(line), PS + 30, top + 84 + k * text.size * 1.25, text.size, step.answer ? "#111827" : INK, { weight: step.answer ? 700 : 400 })).join("");
    cards += `<g opacity="${opacity.toFixed(3)}"><rect x="${PS}" y="${top.toFixed(1)}" width="${PR - PS}" height="${cardH.toFixed(1)}" rx="16" fill="${step.answer ? YELLOW : CARD}" stroke="${step.answer ? YELLOW : CARD_LINE}" stroke-width="2"/>`
      + textAt(step.answer ? "ANSWER" : `STEP ${stepNumber}`, PS + 30, top + 42, 20, step.answer ? "#6b5212" : MUTED, { weight: 700, spacing: 3 }) + `${lines}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}" viewBox="0 0 ${PW} ${PH}">${arrowMarkers()}
    <rect width="${PW}" height="${PH}" fill="${BG}"/>
    ${pill ? `<rect x="${PS}" y="64" width="${pillWidth.toFixed(1)}" height="48" rx="24" fill="#1d3557"/>${textAt(esc(pill), PS + 24, 97, 26, "#8cc4ff", { spacing: 1.5 })}` : ""}
    ${textAt(esc(state.timeLabel), PR, 98, 24, MUTED, { anchor: "end" })}
    ${titleSvg}${problemSvg}${optionsSvg}${diagramSvg}${cards}
    ${textAt("FRAME", PR, PH - 30, 20, "#4f5d75", { anchor: "end", spacing: 2 })}
  </svg>`;
}
