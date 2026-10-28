import assert from "node:assert/strict";
import test from "node:test";
import { validatePedagogyRows, type PedagogyBriefInputRow } from "../src/lib/pedagogy-brief";
import { parseSolutionDiagram, solutionDiagramFiles, solutionItems } from "../src/lib/pedagogy-solution";
import { boardSlideSvg } from "../src/lib/pedagogy-board-slide";

const ITEMS = "X = q66_x.png | a = q66_a.png | b = q66_b.png | c = q66_c.png | d = q66_d.png | found a = q66_a_found.png";
const row = (n: number, extra: Partial<PedagogyBriefInputRow> = {}): PedagogyBriefInputRow => ({ sourceRow: n + 1, questionId: "Q66", lineNo: n, time: `0:${String(n * 5).padStart(2, "0")}`, narration: "ये figure (a) में छिपा है।", board: "Hidden figure", layout: "solution", ...extra });

test("figures: the question figure, options and the found answer; files listed for loading", () => {
  const d = parseSolutionDiagram("figures", solutionItems(ITEMS));
  assert.equal(d.kind, "figures");
  if (d.kind !== "figures") return;
  assert.equal(d.figures.length, 5);
  assert.deepEqual(d.found, { label: "a", file: "q66_a_found.png", order: 5 });
  assert.equal(solutionDiagramFiles(d).length, 6);
  assert.throws(() => parseSolutionDiagram("figures", solutionItems("X = x.png | a = a.png")), /question figure and 2–5 options/);
  assert.throws(() => parseSolutionDiagram("figures", solutionItems("X = x.png | a = a.png | b = b.png | found e = e.png")), /names no option/);
  assert.throws(() => parseSolutionDiagram("figures", solutionItems("X = x.png | a = a.pdf | b = b.png")), /picture file name/);
});

test("figures needs the board theme; a blank draw on the first row keeps the answer hidden", () => {
  assert.throws(() => validatePedagogyRows([row(1, { diagram: "figures", diagramItems: ITEMS, steps: "x | Answer: (a)", problem: "P" })]), /Row 2: diagram "figures" needs theme = board/);
  const rows = validatePedagogyRows([
    row(1, { theme: "board", diagram: "figures", diagramItems: ITEMS, steps: "x | Answer: (a)", problem: "P", diagramStep: "0" }),
    row(2, { draw: "6", diagramStep: "2" }),
  ]);
  assert.equal(rows[0].solutionDrawn, 5);
  assert.equal(rows[1].solutionDrawn, 6);
});

test("the board draws the figure row, a placeholder for a missing file, and frames the found option", () => {
  const diagram = parseSolutionDiagram("figures", solutionItems(ITEMS));
  const images = new Map([["q66_x.png", { href: "data:image/png;base64,AA==", width: 10, height: 10 }]]);
  const base = { chapter: "Embedded figures", questionId: "Q66", title: "Hidden figure", emphasis: "", problem: "Find (X).", diagram, lines: [{ text: "(a)", answer: true }], shownBefore: 0, timeLabel: "", notes: { trap: "", trick: "", remember: "" }, figureImages: images };
  const question = boardSlideSvg({ ...base, shown: 0, drawn: 5, drawnBefore: 0 });
  assert.match(question, /Missing picture: q66_a.png/);
  assert.match(question, /Find \(X\)|Find/);
  assert.doesNotMatch(question, /#4fd1a5" stroke-width="7"/);
  const answer = boardSlideSvg({ ...base, shown: 1, drawn: 6, drawnBefore: 5 });
  assert.match(answer, /stroke="#4fd1a5" stroke-width="7"/);
});
