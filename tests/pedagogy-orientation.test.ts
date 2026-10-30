import assert from "node:assert/strict";
import test from "node:test";
import { validatePedagogyRows, type PedagogyBriefInputRow } from "../src/lib/pedagogy-brief";
import { parseSolutionDiagram, solutionItems } from "../src/lib/pedagogy-solution";
import { boardSlideSvg, boardSlideSvgPortrait, boardTrickCardSvgPortrait } from "../src/lib/pedagogy-board-slide";
import { solutionSlideSvg, solutionSlideSvgPortrait } from "../src/lib/pedagogy-solution-slide";

const row = (n: number, extra: Partial<PedagogyBriefInputRow> = {}): PedagogyBriefInputRow => ({ sourceRow: n + 1, questionId: "Q1", lineNo: n, time: `0:${String(n * 5).padStart(2, "0")}`, narration: "ये answer 12 years है।", board: "Ages", layout: "solution", ...extra });
const first = { problem: "A is 7, B is 9.", steps: "a = 1 | Answer: b = 2", diagram: "none" };

test("a sheet without the orientation column stays landscape (older sheets unchanged)", () => {
  const rows = validatePedagogyRows([row(1, first), row(2)]);
  assert.deepEqual(rows.map((r) => r.effectiveOrientation), ["landscape", "landscape"]);
});

test("portrait is set once on the first row and carries through the sheet", () => {
  const rows = validatePedagogyRows([row(1, { ...first, orientation: "Portrait" }), row(2), row(3, { orientation: "portrait" })]);
  assert.deepEqual(rows.map((r) => r.effectiveOrientation), ["portrait", "portrait", "portrait"]);
});

test("orientation errors: unknown value, a change later in the sheet, a non-solution row in portrait", () => {
  assert.throws(() => validatePedagogyRows([row(1, { ...first, orientation: "square" })]), /orientation must be "landscape", "portrait", or blank/);
  assert.throws(() => validatePedagogyRows([row(1, first), row(2, { orientation: "portrait" })]), /Row 3: orientation is set once, on the first row/);
  assert.throws(() => validatePedagogyRows([row(1, { ...first, orientation: "portrait" }), row(2, { layout: "concept" })]), /Row 3: orientation "portrait" draws layout = solution only/);
});

test("portrait slides are 1080 × 1920; landscape slides are still 1920 × 1080", () => {
  const diagram = parseSolutionDiagram("table", solutionItems("When = A | Now = 7"));
  const board = { chapter: "Ages", questionId: "Q1", title: "Both Terms (दोनों)", emphasis: "Terms", problem: "A : B was *7 : 9* / हिंदी", diagram, lines: [{ text: "a = 1", answer: false }, { text: "b = 2", answer: true }], shown: 2, shownBefore: 1, drawn: 2, drawnBefore: 2, timeLabel: "", notes: { trap: "1 | units", trick: "", remember: "Gap stays" } };
  assert.match(boardSlideSvg(board), /width="1920" height="1080"/);
  assert.match(boardSlideSvgPortrait(board), /width="1080" height="1920"/);
  assert.match(boardSlideSvgPortrait(board), /REMEMBER/);
  assert.match(boardTrickCardSvgPortrait(board), /width="1080" height="1920"/);
  const cards = { chapter: "Ages", questionId: "Q1", title: "The Wall", emphasis: "Wall", problem: "Ritu scores *24%*", diagram, steps: [{ text: "Step one", answer: false }, { text: "31%", answer: true }], shown: 2, shownBefore: 1, drawn: 2, drawnBefore: 2, timeLabel: "", options: ["31%", "30%"] };
  assert.match(solutionSlideSvg(cards), /width="1920" height="1080"/);
  const portrait = solutionSlideSvgPortrait(cards);
  assert.match(portrait, /width="1080" height="1920"/);
  assert.match(portrait, /ANSWER/);
});
