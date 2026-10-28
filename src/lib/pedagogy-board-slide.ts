import sharp from "sharp";
import { SOLUTION_COLOURS, type SolutionDiagram } from "@/lib/pedagogy-solution";
import { handCircle, handText, handUnderline, starRuns, systemWidth } from "@/lib/pedagogy-hand";

// theme = board (Oct 2026): the whole question solved on the board the way a topper writes it. Working lines sit on
// notebook rules with the "=" signs in one column; each line writes itself on while it is spoken (no visible pen).
// TRAP / TRICK tags sit in the margin beside their line, the note itself on the right under a small drawing of the
// trick, and REMEMBER appears once the answer is written. theme = classic (pedagogy-solution-slide.ts) is untouched.

export type BoardNotes = { trap: string; trick: string; remember: string };
export type BoardSlideState = {
  chapter: string;
  questionId: string;
  /** "English title (हिंदी)": the bracketed part is drawn smaller. */
  title: string;
  emphasis: string;
  /** "English problem / हिंदी"; *stars* mark the values, red once that working line is written. */
  problem: string;
  diagram: SolutionDiagram;
  /** Working lines "left = right"; the last may be the answer ("Answer: left = right"). */
  lines: { text: string; answer: boolean }[];
  shown: number;
  shownBefore: number;
  drawn: number;
  drawnBefore: number;
  timeLabel: string;
  notes: BoardNotes;
  options?: string[];
  /** diagram = figures: picture data URIs by file name (null = file missing, a labelled placeholder is drawn). */
  figureImages?: Map<string, { href: string; width: number; height: number } | null>;
};

const BG = "#0f1724", INK = "#e8eef9", MUTED = "#7d8aa0", SOFT = "#b5c0d0", RULE = "#1c2840", PANEL = "#131d2e", PANEL_LINE = "#263552";
const { yellow: Y, blue: B, red: R } = SOLUTION_COLOURS;
const FONT = "Arial, 'Helvetica Neue', 'Kohinoor Devanagari', 'DejaVu Sans', sans-serif";
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const esc = (v: string) => v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const text = (x: number, y: number, size: number, fill: string, content: string, extra = "") => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${FONT}" font-size="${size}" fill="${fill}" ${extra}>${content}</text>`;
const hand = (value: string, x: number, y: number, size: number, fill = INK, anchor: "start" | "middle" | "end" = "start", maxWidth?: number) =>
  handText(starRuns(value, fill, Y), x, y, size, fill, { anchor, maxWidth }) ?? { svg: text(x, y, size, fill, esc(value.replaceAll("*", "")), `text-anchor="${anchor}"`), width: systemWidth(value, size), left: x, boxes: [] };

/** "N | text" → { line: N - 1, text }; a note without a number belongs to no line. */
function note(value: string) {
  const match = /^(\d+)\s*\|\s*(.*)$/.exec(value.trim());
  return match ? { line: Number(match[1]) - 1, text: match[2] } : { line: -1, text: value.trim() };
}

/** Words of the problem: *stretch* n (1, 2 …) turns red once working line n is written. */
function problemWords(problem: string) {
  const words: { text: string; mark: number }[] = [];
  let inside = false, mark = 0;
  for (const raw of problem.split(/\s+/).filter(Boolean)) {
    let word = raw;
    if (word.startsWith("*")) { inside = true; mark += 1; word = word.slice(1); }
    const closes = word.endsWith("*");
    if (closes) word = word.slice(0, -1);
    if (word) words.push({ text: word, mark: inside ? mark : 0 });
    if (closes) inside = false;
  }
  return words;
}

function wrapWords(words: { text: string; mark: number }[], size: number, maxWidth: number) {
  const lines: { text: string; mark: number }[][] = [[]];
  let width = 0;
  for (const word of words) {
    const w = systemWidth(word.text + " ", size, word.mark > 0);
    if (width + w > maxWidth && lines.at(-1)!.length) { lines.push([]); width = 0; }
    lines.at(-1)!.push(word); width += w;
  }
  return lines;
}

/** Small drawing of the trick for the right panel (x, y = panel top-left, 568 × 250 usable). */
function panelDrawing(d: SolutionDiagram, drawn: number, x: number, y: number) {
  const shown = (order: number) => order < drawn;
  let s = "";
  if (d.kind === "table") {
    const cols = d.header.length, w = 568 / cols;
    const rowH = Math.min(48, 190 / d.rows.length);
    d.rows.forEach((row, r) => {
      if (!shown(row.order)) return;
      const yy = y + 40 + r * rowH;
      row.cells.forEach((cell, c) => {
        const h = handText(r === 0 ? cell : starRuns(cell, INK, Y), x + w * c + w / 2, yy, 28, r === 0 ? "#8cc4ff" : INK, { anchor: "middle", maxWidth: w - 12 });
        if (!h) return;
        s += h.svg;
        if (r > 0 && cell.includes("*")) h.boxes.forEach((box, k) => { if (box && k % 2 === (cell.startsWith("*") ? 0 : 1)) s += handCircle(box.x1, box.x2, yy - 9, 30, Y, `${cell}${k}`); });
      });
      if (r < d.rows.length - 1) s += `<line x1="${x}" y1="${(yy + rowH * 0.34).toFixed(1)}" x2="${x + 568}" y2="${(yy + rowH * 0.34).toFixed(1)}" stroke="#223049"/>`;
    });
    if (d.note && shown(d.note.order)) s += hand(d.note.text, x + 284, y + 232, 27, B, "middle", 560).svg;
  } else if (d.kind === "units" || d.kind === "bars") {
    const max = Math.max(...d.rows.map((row) => row.value));
    const gap = Math.min(72, 180 / d.rows.length);
    d.rows.forEach((row, i) => {
      if (!shown(row.order)) return;
      const yy = y + 20 + i * gap;
      s += hand(row.label, x + 96, yy + 30, 26, INK, "end", 92).svg;
      let end = x + 110;
      if (d.kind === "units") {
        const unit = Math.min(64, 300 / max);
        for (let k = 0; k < row.value; k += 1) s += `<rect x="${(x + 110 + k * unit).toFixed(1)}" y="${yy}" width="${(unit - 6).toFixed(1)}" height="40" rx="7" fill="${row.colour}" opacity="0.9"/>`;
        end = x + 110 + row.value * unit;
      } else {
        const length = (300 * row.value) / max;
        s += `<rect x="${x + 110}" y="${yy}" width="${length.toFixed(1)}" height="40" rx="7" fill="${row.colour}" opacity="0.9"/>`;
        end = x + 110 + length;
      }
      if (row.caption) s += hand(row.caption, end + 12, yy + 30, 26, row.colour, "start", x + 568 - end - 12).svg;
    });
    if (d.note && shown(d.note.order)) s += hand(d.note.text, x + 284, y + 232, 27, B, "middle", 560).svg;
  } else if (d.kind === "chain") {
    const n = d.nodes.length, boxW = Math.min(150, (568 - (n - 1) * 34) / n), x0 = x + (568 - (n * boxW + (n - 1) * 34)) / 2, yy = y + 90;
    d.nodes.forEach((node, i) => {
      if (!shown(node.order)) return;
      const bx = x0 + i * (boxW + 34), last = i === n - 1;
      if (i > 0) {
        s += `<line x1="${(bx - 30).toFixed(1)}" y1="${yy + 32}" x2="${(bx - 6).toFixed(1)}" y2="${yy + 32}" stroke="${B}" stroke-width="3"/><path d="M${(bx - 6).toFixed(1)} ${yy + 32} l-9 -6 v12 z" fill="${B}"/>`;
        s += hand(d.operations[i - 1] ?? "", bx - 18, yy - 14, 22, B, "middle", boxW + 20).svg;
      }
      s += `<rect x="${bx.toFixed(1)}" y="${yy}" width="${boxW.toFixed(1)}" height="64" rx="12" fill="${last ? Y : "#182236"}" stroke="${last ? Y : "#2c3a55"}" stroke-width="2"/>`;
      s += hand(node.text, bx + boxW / 2, yy + 42, 24, last ? "#111827" : INK, "middle", boxW - 10).svg;
    });
    if (d.note && shown(d.note.order)) s += hand(d.note.text, x + 284, y + 222, 25, "#9fb0c8", "middle", 560).svg;
  } else if (d.kind === "numberline") {
    const values = [...d.points.map((p) => p.at), ...(d.wall ? [d.wall.at] : [])];
    const low = Math.min(...values), high = Math.max(...values);
    const X = (v: number) => x + 50 + ((v - low) / (high - low || 1)) * 468;
    const yy = y + 120;
    s += `<line x1="${x + 20}" y1="${yy}" x2="${x + 548}" y2="${yy}" stroke="#34445e" stroke-width="4" stroke-linecap="round"/>`;
    if (d.wall && shown(d.wall.order)) s += `<rect x="${(X(d.wall.at) - 9).toFixed(1)}" y="${yy - 80}" width="18" height="100" rx="3" fill="${Y}"/>` + hand(d.wall.label, X(d.wall.at), yy - 92, 22, Y, "middle").svg;
    for (const arc of d.arcs) {
      if (!shown(arc.order)) continue;
      const a = X(arc.from), b = X(arc.to), mid = (a + b) / 2, colour = arc.colour ?? B;
      s += `<path d="M${a.toFixed(1)} ${yy - 14} Q${mid.toFixed(1)} ${yy - 70} ${b.toFixed(1)} ${yy - 18}" fill="none" stroke="${colour}" stroke-width="3" stroke-dasharray="9 7"/>` + hand(arc.label, mid, yy - 52, 22, colour, "middle", 260).svg;
    }
    for (const p of d.points) if (shown(p.order)) s += `<circle cx="${X(p.at).toFixed(1)}" cy="${yy}" r="10" fill="${p.colour}"/>` + hand(p.label, X(p.at), yy + 38, 22, p.colour, "middle", 200).svg;
    if (d.bracket && shown(d.bracket.order)) s += `<path d="M${X(d.bracket.from).toFixed(1)} ${yy + 64}H${X(d.bracket.to).toFixed(1)}" stroke="${B}" stroke-width="2"/>` + hand(d.bracket.label, (X(d.bracket.from) + X(d.bracket.to)) / 2, yy + 94, 24, B, "middle", 520).svg;
  }
  return s;
}

/** One figure tile: the picture fitted on a cream card, or a visible placeholder when the file is missing. */
function figureTile(images: BoardSlideState["figureImages"], file: string, x: number, y: number, size: number, opacity = 1, frame = "") {
  const image = images?.get(file) ?? null;
  let g = `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="16" fill="#f6f3ea"/>`;
  if (image) {
    const k = Math.min((size - 20) / image.width, (size - 20) / image.height), w = image.width * k, h = image.height * k;
    g += `<image href="${image.href}" x="${(x + (size - w) / 2).toFixed(1)}" y="${(y + (size - h) / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/>`;
  } else g += text(x + size / 2, y + size / 2, 18, "#7d8aa0", esc(`Missing picture: ${file}`), 'text-anchor="middle"');
  if (frame) g += `<rect x="${x - 5}" y="${y - 5}" width="${size + 10}" height="${size + 10}" rx="19" fill="none" stroke="${frame}" stroke-width="7"/>`;
  return `<g opacity="${opacity.toFixed(3)}">${g}</g>`;
}

const therefore = (x: number, y: number, c: string) => [[x + 7, y - 24], [x, y - 9], [x + 14, y - 9]].map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="3.8" fill="${c}"/>`).join("");
const KIND = { TRAP: R, TRICK: Y } as const;

export function boardSlideSvg(state: BoardSlideState, progress = 1) {
  // Writing runs at an even pace across the spoken line; any diagram drawing on the same row comes first.
  const drawing = state.drawn > state.drawnBefore;
  const pace = drawing ? clamp((progress - 0.25) / 0.75) : clamp(progress);
  let s = `<rect width="1920" height="1080" fill="${BG}"/>`;
  // Pill, time, title (English + Hindi in brackets)
  const pill = [state.chapter, state.questionId].filter((part) => part.trim()).join(" · ").toUpperCase();
  const pillW = systemWidth(pill, 26) * 1.06 + 56;
  s += `<rect x="96" y="44" width="${pillW.toFixed(1)}" height="48" rx="24" fill="#1d3557"/>${text(96 + pillW / 2, 78, 26, "#8cc4ff", esc(pill), 'text-anchor="middle" letter-spacing="1.5"')}`;
  s += text(1824, 78, 24, MUTED, esc(state.timeLabel), 'text-anchor="end"');
  const bracket = state.title.indexOf(" (");
  const english = bracket > 0 ? state.title.slice(0, bracket) : state.title;
  const hindi = bracket > 0 ? state.title.slice(bracket + 1) : "";
  const emphasis = state.emphasis.trim();
  const titleSize = systemWidth(english, 54, true) + systemWidth(hindi, 44) * 1.15 > 1700 ? 46 : 54;
  const titleEnglish = emphasis && english.includes(emphasis) ? english.split(emphasis).map(esc).join(`<tspan fill="${Y}">${esc(emphasis)}</tspan>`) : esc(english);
  s += text(96, 168, titleSize, INK, `${titleEnglish}${hindi ? ` <tspan font-weight="600" fill="#cfd8e6" font-size="${titleSize - 10}">${esc(hindi)}</tspan>` : ""}`, 'font-weight="800"');
  // Problem: English line(s), then Hindi line(s); starred values turn red as their line is written.
  const [enText, hiText = ""] = state.problem.split(" / ");
  const enLines = wrapWords(problemWords(enText), 27, 1728);
  const hiLines = wrapWords(problemWords(hiText), 27, 1728);
  let py = 222;
  for (const line of enLines) {
    let x = 96;
    const parts: string[] = [];
    line.forEach((word, k) => {
      const red = word.mark > 0 && word.mark <= state.shown;
      const w = systemWidth(word.text, 27, red);
      if (red) {
        const fresh = word.mark === state.shown && state.shown > state.shownBefore;
        const next = line[k + 1];
        const joinNext = next && next.mark === word.mark;
        s += handUnderline(x - 2, x + w + (joinNext ? systemWidth(" ", 27) : 0) + 2, py + 8, R, `${word.text}${py}`, fresh ? pace : 1, 3);
      }
      parts.push(red ? `<tspan fill="${R}" font-weight="700">${esc(word.text)}</tspan>` : esc(word.text));
      x += w + systemWidth(" ", 27);
    });
    s += text(96, py, 27, SOFT, parts.join(" "));
    py += 38;
  }
  for (const line of hiLines) { s += text(96, py, 27, SOFT, esc(line.map((w) => w.text).join(" "))); py += 38; }
  // Options (MCQ), small, under the problem
  const options = (state.options ?? []).map((o) => o.trim()).filter(Boolean);
  if (options.length) { s += text(96, py, 24, MUTED, options.map((o, i) => `${"ABCDE"[i]}. ${esc(o)}`).join("     ")); py += 34; }
  // diagram = figures: (X) then the options in one row under the problem; the answer step frames the found option.
  const figures = state.diagram.kind === "figures" ? state.diagram : null;
  if (figures) {
    const size = 200, gap = 26, row = py + 4;
    const fresh = (order: number) => order >= state.drawnBefore && order < state.drawn ? clamp(progress * 4) : 1;
    const found = figures.found && figures.found.order < state.drawn ? figures.found : null;
    let x = 96;
    figures.figures.forEach((figure, i) => {
      if (i === 1) x += 70;
      if (figure.order < state.drawn) {
        const isAnswer = found?.label === figure.label;
        const dim = found && i > 0 && !isAnswer ? 0.35 : 1;
        const swap = isAnswer && found ? fresh(found.order) : 0;
        s += figureTile(state.figureImages, figure.file, x, row, size, fresh(figure.order) * dim);
        if (isAnswer && found) s += figureTile(state.figureImages, found.file, x, row, size, swap, "#4fd1a5");
        s += text(x + size / 2, row + size + 32, 26, isAnswer ? "#4fd1a5" : SOFT, esc(`(${figure.label})`), 'text-anchor="middle" font-weight="700"');
      }
      x += size + gap;
    });
    py = row + size + 64;
  }
  const divider = Math.max(316, py - 10);
  s += `<line x1="96" y1="${divider}" x2="1824" y2="${divider}" stroke="${PANEL_LINE}" stroke-width="2"/>`;

  // Notebook page: margin, rules, working lines with "=" in one column
  const n = state.lines.length, first = divider + 88, margin = 240;
  const step = Math.max(54, Math.min(76, (1030 - first) / Math.max(1, n - 1)));
  const fs = step >= 66 ? 36 : 32;
  const base = (i: number) => first + i * step;
  const notes = (["TRAP", "TRICK"] as const).map((kind) => ({ kind, ...note(kind === "TRAP" ? state.notes.trap : state.notes.trick) })).filter((x) => x.text);
  for (let i = 0; i < n; i += 1) s += `<line x1="${margin}" y1="${base(i) + 12}" x2="1140" y2="${base(i) + 12}" stroke="${RULE}" stroke-width="1.5"/>`;
  s += `<line x1="${margin - 14}" y1="${divider + 18}" x2="${margin - 14}" y2="${base(n - 1) + 40}" stroke="#4a2a3a" stroke-width="2"/>`;
  s += hand("Sol.", 100, divider + 46, 30, MUTED).svg;
  const split = state.lines.map((line) => { const at = line.text.indexOf(" = "); return at > 0 ? { left: line.text.slice(0, at), right: line.text.slice(at + 3) } : { left: "", right: line.text }; });
  const leftWidth = Math.max(0, ...split.map((p) => (p.left ? (handText(p.left, 0, 0, fs, INK)?.width ?? systemWidth(p.left, fs)) : 0)));
  const eqX = Math.max(520, Math.min(760, margin + 40 + leftWidth + 22));
  state.lines.forEach((line, i) => {
    if (i >= state.shown) return;
    const y = base(i), { left, right } = split[i];
    const tag = notes.find((x) => x.line === i);
    const l = left ? hand(left, eqX - 22, y, fs, INK, "end", eqX - 22 - margin - 30) : null;
    const r = hand(right, left ? eqX + 24 : margin + 30, y, fs, INK, "start", 1130 - (left ? eqX + 24 : margin + 30));
    const x1 = (l ? Math.min(l.left, eqX) : margin + 30) - 18, x2 = (left ? eqX + 24 : margin + 30) + r.width + 18;
    let g = "";
    if (tag) g += `<rect x="${x1.toFixed(1)}" y="${y - 44}" width="${(x2 - x1).toFixed(1)}" height="58" rx="10" fill="${KIND[tag.kind]}" opacity="0.11"/>`;
    if (line.answer) g += therefore(x1 - 26, y, Y);
    g += (l ? l.svg + hand("=", eqX, y, fs, INK, "middle").svg : "") + r.svg;
    if (line.answer) g += `<rect x="${(x1 - 44).toFixed(1)}" y="${y - 48}" width="${(x2 - x1 + 50).toFixed(1)}" height="66" rx="10" fill="none" stroke="${Y}" stroke-width="4"/>`;
    const writing = i === state.shown - 1 && state.shown > state.shownBefore;
    if (writing && pace < 1) {
      if (pace <= 0) return;
      const id = `w${i}`;
      g = `<clipPath id="${id}"><rect x="${(x1 - 70).toFixed(1)}" y="${y - 60}" width="${((x2 - x1 + 80) * pace).toFixed(1)}" height="90"/></clipPath><g clip-path="url(#${id})">${g}</g>`;
    }
    if (tag) { const w = tag.kind.length * 15 + 26; s += `<g opacity="${writing ? clamp(pace * 4).toFixed(3) : 1}"><rect x="${margin - 30 - w}" y="${y - 32}" width="${w}" height="38" rx="8" fill="${KIND[tag.kind]}"/>${text(margin - 30 - w / 2, y - 6, 19, "#111827", tag.kind, 'font-weight="800" text-anchor="middle" letter-spacing="1.5"')}</g>`; }
    s += g;
  });

  // Right column: drawing of the trick, then the notes in words, then REMEMBER once the answer is written
  const panelTop = divider + 20;
  // With a figure row the board has less height left, so the panel is shorter.
  const panelHeight = state.diagram.kind === "figures" ? 236 : 300;
  s += `<rect x="1200" y="${panelTop}" width="624" height="${panelHeight}" rx="18" fill="${PANEL}" stroke="${PANEL_LINE}" stroke-width="2"/>`;
  if (figures) {
    // The panel shows (X) large while students look for it, then the found option with (X) traced in it.
    const found = figures.found && figures.found.order < state.drawn ? figures.found : null;
    const big = found ? found.file : figures.figures[0].file;
    s += hand(found ? `(${figures.figures[0].label}) inside (${found.label})` : `Find (${figures.figures[0].label})`, 1228, panelTop + 40, 24, found ? "#4fd1a5" : MUTED).svg;
    if (figures.figures[0].order < state.drawn) s += figureTile(state.figureImages, big, 1512 - 85, panelTop + 30, 176, 1, found ? "#4fd1a5" : "");
  } else s += hand("Trick drawing", 1228, panelTop + 40, 24, MUTED).svg + panelDrawing(state.diagram, state.drawn, 1228, panelTop + 56);
  let ny = panelTop + panelHeight + 60;
  for (const tag of notes) {
    if (tag.line >= state.shown && tag.line >= 0) continue;
    if (tag.line < 0 && state.shown === 0) continue;
    const c = KIND[tag.kind], w = tag.kind.length * 15 + 26;
    s += `<rect x="1200" y="${ny - 29}" width="${w}" height="38" rx="8" fill="${c}"/>${text(1200 + w / 2, ny - 3, 19, "#111827", tag.kind, 'font-weight="800" text-anchor="middle" letter-spacing="1.5"')}`;
    s += hand(tag.text, 1200 + w + 14, ny, 29, c, "start", 624 - w - 14).svg;
    ny += 62;
  }
  const remember = note(state.notes.remember).text;
  if (remember && n > 0 && state.shown >= n) {
    const fresh = state.shownBefore < n;
    s += `<g opacity="${fresh ? clamp(pace * 2 - 0.6).toFixed(3) : 1}"><rect x="1200" y="${ny - 14}" width="624" height="104" rx="16" fill="#132034" stroke="${B}" stroke-width="2" stroke-dasharray="10 8"/><rect x="1222" y="${ny + 4}" width="150" height="34" rx="8" fill="${B}"/>${text(1297, ny + 28, 19, "#111827", "REMEMBER", 'font-weight="800" text-anchor="middle" letter-spacing="1.5"')}${hand(remember, 1222, ny + 74, 28, INK, "start", 584).svg}</g>`;
  }
  s += text(1824, 1052, 20, "#4f5d75", "FRAME", 'text-anchor="end" letter-spacing="2"');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${s}</svg>`;
}

export async function createBoardSlide(state: BoardSlideState, progress = 1) {
  return sharp(Buffer.from(boardSlideSvg(state, progress))).png().toBuffer();
}

/** Full-screen card at the start of a question: the trick's name, handwritten, English then Hindi. */
export function boardTrickCardSvg(state: Pick<BoardSlideState, "chapter" | "questionId" | "title" | "emphasis">) {
  const pill = [state.chapter, state.questionId].filter((part) => part.trim()).join(" · ").toUpperCase();
  const bracket = state.title.indexOf(" (");
  const english = bracket > 0 ? state.title.slice(0, bracket) : state.title;
  const hindi = bracket > 0 ? state.title.slice(bracket + 1) : "";
  const emphasis = state.emphasis.trim();
  const parts = emphasis && english.includes(emphasis) ? english.split(emphasis) : [english];
  const runs = parts.flatMap((part, i) => (i < parts.length - 1 ? [{ text: part, fill: INK, bold: true }, { text: emphasis, fill: Y, bold: true }] : [{ text: part, fill: INK, bold: true }])).filter((run) => run.text);
  const title = handText(runs, 960, 570, 92, INK, { anchor: "middle", bold: true, maxWidth: 1640 });
  let s = `<rect width="1920" height="1080" fill="${BG}"/>${text(960, 400, 32, "#8cc4ff", esc(pill), 'text-anchor="middle" letter-spacing="3"')}${hand("Trick", 960, 460, 38, MUTED, "middle").svg}`;
  s += title ? title.svg + handUnderline(title.left + 30, title.left + title.width - 30, 606, Y, state.title, 1, 6) : text(960, 570, 80, INK, esc(english), 'text-anchor="middle" font-weight="800"');
  if (hindi) s += text(960, 690, 48, "#cfd8e6", esc(hindi), 'text-anchor="middle" font-weight="600"');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${s}</svg>`;
}

export async function createBoardTrickCard(state: Pick<BoardSlideState, "chapter" | "questionId" | "title" | "emphasis">) {
  return sharp(Buffer.from(boardTrickCardSvg(state))).png().toBuffer();
}
