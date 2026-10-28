// layout = solution (exam-question path only): one full-screen board per question with the chapter pill, a title,
// the problem, a diagram that explains the trick, and step cards ending in a yellow answer card.
// Sheet columns (all optional except on the rows that use them):
//   question_text  chapter, shown in the pill (and used for class tabs)          carries forward
//   board          the trick's title; `emphasis` paints a word of it yellow      carries forward
//   problem        the question as students read it                              carries forward within a question_id
//   diagram        numberline | units | bars | chain | table | none              carries forward within a question_id
//   diagram_items  the diagram's items separated by "|" (formats below)          carries forward within a question_id
//   steps          "step | step | step | Answer: ..." (up to 5 cards)             carries forward within a question_id
//   diagram_step   how many step cards are showing on this row (0 = none yet)    blank = same as the row before
//   draw           how many diagram_items are drawn by this row, in the order written; the new ones draw in as
//                  the line starts (arc traces, bar grows, block fills). Blank = same as the row before; blank on
//                  a question's first row = the whole diagram at once.
//
// diagram_items formats (any item may end with a colour: [red] [green] [blue] [yellow] [purple] [white]):
//   numberline  "Ritu · 24% @ 24 | Priya · 40% @ 40 | wall PASS WALL @ 31 | arc 28 marks short @ 24 > 31 | bracket 16% = 64 @ 24 > 40"
//   units       "P · 60% @ 3 @ 3 units | Other @ 2 @ 2 units | note 1 unit = 1,080"   (label @ count @ caption; count 1–20)
//   bars        "SI @ 30 @ 30% | CI @ 44 @ 44% | note Gap = 14%"                      (label @ length @ caption)
//   chain       "CP 100 | + x% > MP | − 10% > SP 105.3 | note ..."                    (first box, then "operation > box")
//   table       "Items = Cost = Profit | 2 = ₹200 = ₹20 | note ..."                    (first item is the header; *stars* highlight)
//   figures     "X = q66_x.png | a = q66_a.png | b = q66_b.png | c = q66_c.png | d = q66_d.png | found a = q66_a_found.png"
//               (theme = board only) non-verbal figures from the pedagogy-images folder: the question figure X, then
//               2–5 option figures in a row under the problem; "found <option> = file" is the answer step: that option
//               gets a green frame and the file (the option with the figure traced in it) replaces it and fills the
//               trick drawing panel. Put it last and reveal it with `draw` on the answer row.

export const SOLUTION_DIAGRAMS = ["numberline", "units", "bars", "chain", "table", "figures", "none"] as const;
export type SolutionDiagramKind = (typeof SOLUTION_DIAGRAMS)[number];
export const SOLUTION_MAX_CARDS = 5;
/** theme = board writes the solution as working lines on the board: up to 8 lines (the last may be "Answer: …"). */
export const BOARD_MAX_LINES = 8;

export const SOLUTION_COLOURS = { red: "#ff6b6b", green: "#4fd1a5", blue: "#7cb7ff", yellow: "#ffc857", purple: "#b69cff", white: "#e8eef9" } as const;
type ColourName = keyof typeof SOLUTION_COLOURS;
const AUTO: ColourName[] = ["red", "green", "blue", "yellow", "purple"];

/** `order` = the item's position in diagram_items; `draw` reveals items in that order. */
type Note = { text: string; order: number } | null;
export type SolutionDiagram = { parts: number } & (
  | { kind: "none" }
  | { kind: "numberline"; points: { label: string; at: number; colour: string; order: number }[]; wall?: { label: string; at: number; order: number }; arcs: { label: string; from: number; to: number; colour?: string; order: number }[]; bracket?: { label: string; from: number; to: number; order: number } }
  | { kind: "units" | "bars"; rows: { label: string; value: number; caption: string; colour: string; order: number }[]; note: Note }
  | { kind: "chain"; nodes: { text: string; order: number }[]; operations: string[]; note: Note }
  | { kind: "table"; header: string[]; rows: { cells: string[]; order: number }[]; note: Note }
  | { kind: "figures"; figures: { label: string; file: string; order: number }[]; found: { label: string; file: string; order: number } | null });

/** Picture files the figures diagram names (pedagogy-images folder). */
export function solutionDiagramFiles(diagram: SolutionDiagram) {
  return diagram.kind === "figures" ? [...diagram.figures.map((figure) => figure.file), ...(diagram.found ? [diagram.found.file] : [])] : [];
}
const FIGURE_FILE = /^[\w.-]+\.(png|jpe?g|webp)$/i;

export class SolutionParseError extends Error {
  constructor(message: string) { super(message); this.name = "SolutionParseError"; }
}
const fail = (message: string): never => { throw new SolutionParseError(message); };

export function isSolutionDiagram(name: string): name is SolutionDiagramKind {
  return (SOLUTION_DIAGRAMS as readonly string[]).includes(name);
}

function number(text: string, item: string) {
  const value = Number(text.trim().replace(/^−/, "-").replace(/[,%]/g, ""));
  return Number.isFinite(value) ? value : fail(`diagram_items ${JSON.stringify(item)}: ${JSON.stringify(text.trim())} must be a number.`);
}

function colourOf(item: string): { text: string; colour?: string } {
  const match = /\s*\[(red|green|blue|yellow|purple|white)\]\s*$/i.exec(item);
  return match ? { text: item.slice(0, match.index).trim(), colour: SOLUTION_COLOURS[match[1].toLowerCase() as ColourName] } : { text: item.trim() };
}

function keyword(item: string, word: string) {
  const match = new RegExp(`^${word}\\s+`, "i").exec(item);
  return match ? item.slice(match[0].length).trim() : null;
}

/** "label @ a > b" -> label, a, b */
function span(rest: string, item: string) {
  const at = rest.lastIndexOf("@");
  if (at < 0) fail(`diagram_items ${JSON.stringify(item)} needs "@ from > to".`);
  const [from, to] = rest.slice(at + 1).split(">");
  if (to === undefined) fail(`diagram_items ${JSON.stringify(item)} needs "@ from > to".`);
  return { label: rest.slice(0, at).trim(), from: number(from, item), to: number(to, item) };
}

export function solutionItems(text: string) {
  return text.split("|").map((item) => item.trim()).filter(Boolean);
}

export function parseSolutionDiagram(kind: string, items: string[]): SolutionDiagram {
  if (!isSolutionDiagram(kind)) return fail(`diagram ${JSON.stringify(kind)} is not a solution diagram. Use one of: ${SOLUTION_DIAGRAMS.join(", ")}.`);
  const parts = items.length;
  if (kind === "none") return { kind, parts: 0 };
  if (!items.length) return fail(`diagram ${kind} needs diagram_items (items separated by "|").`);
  let note: Note = null;
  const body: { raw: string; order: number }[] = [];
  items.forEach((item, order) => {
    const rest = keyword(item, "note");
    if (rest === null) body.push({ raw: item, order });
    else note = { text: rest, order };
  });
  if (kind === "numberline") {
    const diagram: Extract<SolutionDiagram, { kind: "numberline" }> = { kind, parts, points: [], arcs: [] };
    for (const { raw, order } of body) {
      const { text, colour } = colourOf(raw);
      const wall = keyword(text, "wall"), arc = keyword(text, "arc"), bracket = keyword(text, "bracket");
      if (wall !== null) {
        const at = wall.lastIndexOf("@");
        if (at < 0) fail(`diagram_items ${JSON.stringify(raw)} needs "@ position".`);
        diagram.wall = { label: wall.slice(0, at).trim(), at: number(wall.slice(at + 1), raw), order };
      } else if (arc !== null) diagram.arcs.push({ ...span(arc, raw), colour, order });
      else if (bracket !== null) diagram.bracket = { ...span(bracket, raw), order };
      else {
        const at = text.lastIndexOf("@");
        if (at < 0) fail(`numberline point ${JSON.stringify(raw)} must look like "Ritu · 24% @ 24".`);
        diagram.points.push({ label: text.slice(0, at).trim(), at: number(text.slice(at + 1), raw), colour: colour ?? SOLUTION_COLOURS[AUTO[diagram.points.length % AUTO.length]], order });
      }
    }
    if (note) fail("numberline does not take a note; put the sum in a bracket instead.");
    if (diagram.points.length < 2 || diagram.points.length > 5) fail(`numberline needs 2–5 points; found ${diagram.points.length}.`);
    if (diagram.arcs.length > 4) fail("numberline takes at most 4 arcs.");
    const positions = [...diagram.points.map((point) => point.at), ...(diagram.wall ? [diagram.wall.at] : [])];
    if (Math.max(...positions) === Math.min(...positions)) fail("numberline points must not all sit at the same position.");
    return diagram;
  }
  if (kind === "units" || kind === "bars") {
    const rows = body.map(({ raw, order }, index) => {
      const { text, colour } = colourOf(raw);
      const [label, value, ...caption] = text.split("@").map((part) => part.trim());
      if (value === undefined) fail(`${kind} item ${JSON.stringify(raw)} must look like "label @ ${kind === "units" ? "3" : "30"} @ caption".`);
      const amount = number(value, raw);
      if (amount <= 0) fail(`${kind} item ${JSON.stringify(raw)} needs a value above 0.`);
      if (kind === "units" && (!Number.isInteger(amount) || amount > 20)) fail(`units item ${JSON.stringify(raw)} needs a whole number of units from 1 to 20.`);
      return { label, value: amount, caption: caption.join("@").trim(), colour: colour ?? SOLUTION_COLOURS[AUTO[index % AUTO.length]], order };
    });
    if (rows.length < 1 || rows.length > 5) fail(`${kind} needs 1–5 rows; found ${rows.length}.`);
    return { kind, parts, rows, note };
  }
  if (kind === "chain") {
    const [first, ...rest] = body;
    const nodes = [{ text: first?.raw ?? "", order: first?.order ?? 0 }];
    const operations: string[] = [];
    for (const { raw, order } of rest) {
      const at = raw.lastIndexOf(">");
      if (at < 0) fail(`chain item ${JSON.stringify(raw)} must look like "× 75% > 13,500".`);
      operations.push(raw.slice(0, at).trim());
      nodes.push({ text: raw.slice(at + 1).trim(), order });
    }
    if (nodes.length < 2 || nodes.length > 5) fail(`chain needs 2–5 boxes; found ${nodes.length}.`);
    return { kind, parts, nodes, operations, note };
  }
  if (kind === "figures") {
    const figures: { label: string; file: string; order: number }[] = [];
    let found: { label: string; file: string; order: number } | null = null;
    items.forEach((item, order) => {
      const at = item.indexOf("=");
      if (at < 0) fail(`figures item ${JSON.stringify(item)} must look like "a = q66_a.png".`);
      const left = item.slice(0, at).trim(), file = item.slice(at + 1).trim();
      if (!FIGURE_FILE.test(file)) fail(`figures item ${JSON.stringify(item)}: ${JSON.stringify(file)} must be a picture file name like q66_a.png.`);
      const answer = keyword(left, "found");
      if (answer !== null) {
        if (found) fail("figures takes one \"found\" item.");
        found = { label: answer, file, order };
      } else {
        if (found) fail("the \"found\" item must come last in figures.");
        figures.push({ label: left, file, order });
      }
    });
    if (figures.length < 3 || figures.length > 6) fail(`figures needs the question figure and 2–5 options; found ${figures.length} figures.`);
    const answer = found as { label: string } | null;
    if (answer && !figures.slice(1).some((figure) => figure.label === answer.label)) fail(`figures: "found ${answer.label}" names no option; the options are ${figures.slice(1).map((figure) => figure.label).join(", ")}.`);
    return { kind, parts, figures, found };
  }
  const [header, ...rows] = body.map(({ raw, order }) => ({ cells: raw.split(/\s+=\s+/).map((cell) => cell.trim()), order }));
  if (!header || header.cells.length < 2 || header.cells.length > 5) fail("table needs a header row with 2–5 columns separated by \" = \".");
  if (rows.length < 1 || rows.length > 6) fail(`table needs 1–6 rows under the header; found ${rows.length}.`);
  return { kind: "table", parts, header: header.cells, rows: [{ cells: header.cells, order: header.order }, ...rows.map((row) => ({ cells: header.cells.map((_, column) => row.cells[column] ?? ""), order: row.order }))], note };
}

/** Step cards; an item starting "Answer:" becomes the yellow answer card and must come last. */
export function parseSolutionSteps(text: string, max = SOLUTION_MAX_CARDS) {
  const items = solutionItems(text);
  if (items.length > max) fail(`steps takes at most ${max} ${max === SOLUTION_MAX_CARDS ? "cards" : "lines"}; found ${items.length}.`);
  const answerAt = items.findIndex((item) => /^answer\s*:/i.test(item));
  if (answerAt >= 0 && answerAt !== items.length - 1) fail('the "Answer:" card must be the last item in steps.');
  return items.map((item) => /^answer\s*:/i.test(item) ? { text: item.replace(/^answer\s*:\s*/i, ""), answer: true } : { text: item, answer: false });
}
