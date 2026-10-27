import assert from "node:assert/strict";
import test from "node:test";
import { validatePedagogyRows, type PedagogyBriefInputRow } from "../src/lib/pedagogy-brief";
import { parseSolutionDiagram, parseSolutionSteps, solutionItems } from "../src/lib/pedagogy-solution";
import { createSolutionSlide, solutionSlideSvg } from "../src/lib/pedagogy-solution-slide";

const base = (overrides: Partial<PedagogyBriefInputRow>, sourceRow = 2): PedagogyBriefInputRow => ({
  sourceRow, questionId: "Q1", lineNo: sourceRow - 1, time: `0:${String(sourceRow).padStart(2, "0")}`, narration: "Chalo dekhte hain.", board: "", ...overrides,
});

const wall = "Ritu · 24% @ 24 | Priya · 40% @ 40 | wall PASS WALL @ 31 | arc 28 marks short @ 24 > 31 | arc 36 marks above @ 40 > 31 | bracket 16% = 28 + 36 = 64 @ 24 > 40";
const steps = "16% = 64 marks | 1% = 4 → Total = 400 | 28 of 400 = 7% → 24% + 7% | Answer: Pass mark = 31%";

test("solution rows carry problem, diagram and steps forward; diagram_step counts cards", () => {
  const rows = validatePedagogyRows([
    base({ layout: "solution", questionText: "Percentage", board: "The Wall Concept", emphasis: "Wall", problem: "Ritu scores 24%...", diagram: "numberline", diagramItems: wall, steps }, 2),
    base({ layout: "solution", diagramStep: "1" }, 3),
    base({ layout: "solution" }, 4),
    base({ layout: "solution", diagramStep: "4" }, 5),
  ]);
  assert.deepEqual(rows.map((row) => row.diagramStep), [0, 1, 1, 4]);
  assert.ok(rows.every((row) => row.diagram === "numberline" && row.effectiveProblem === "Ritu scores 24%..." && row.effectiveSteps === steps));
  assert.equal(rows[3].diagramItems.length, 6);
});

test("a new question_id starts clean", () => {
  const rows = validatePedagogyRows([
    base({ layout: "solution", board: "A", problem: "P1", diagram: "chain", diagramItems: "100 | × 2 > 200", steps: "x | Answer: y", diagramStep: "2" }, 2),
    base({ layout: "solution", questionId: "Q2", board: "B", steps: "only" }, 3),
  ]);
  assert.equal(rows[1].effectiveProblem, "");
  assert.equal(rows[1].diagram, "none");
  assert.equal(rows[1].diagramStep, 0);
});

test("sheets without layout = solution are unchanged", () => {
  const rows = validatePedagogyRows([base({ board: "Board text" }, 2), base({ layout: "concept", questionText: "Topic", board: "Notes" }, 3)]);
  assert.deepEqual(rows.map((row) => [row.layout, row.effectiveProblem, row.effectiveSteps]), [["board", "", ""], ["concept", "", ""]]);
});

test("clear row errors", () => {
  const bad = (overrides: Partial<PedagogyBriefInputRow>) => () => validatePedagogyRows([base({ layout: "solution", board: "T", ...overrides })]);
  assert.throws(bad({ steps: "a | b", diagramStep: "3" }), /Row 2: diagram_step must be a whole number from 0 to 2/);
  assert.throws(bad({ diagram: "pie", diagramItems: "x" }), /Row 2: diagram "pie" is not a solution diagram/);
  assert.throws(bad({ steps: "Answer: 5 | step" }), /Row 2: the "Answer:" card must be the last/);
  assert.throws(bad({ diagram: "units", diagramItems: "A @ 25 @ x" }), /whole number of units from 1 to 20/);
  assert.throws(bad({ diagram: "numberline", diagramItems: "only @ 3" }), /numberline needs 2–5 points/);
  assert.throws(bad({ layout: "solutions" }), /layout must be/);
});

test("diagram formats parse", () => {
  const line = parseSolutionDiagram("numberline", solutionItems(wall));
  assert.equal(line.kind, "numberline");
  if (line.kind === "numberline") { assert.equal(line.points.length, 2); assert.equal(line.wall?.at, 31); assert.equal(line.arcs.length, 2); assert.equal(line.bracket?.label, "16% = 28 + 36 = 64"); }
  const units = parseSolutionDiagram("units", solutionItems("Milk @ 13 @ 13a [white] | Water @ 7 @ 7a + 120 = 13a [blue] | note Water needs 6 more units"));
  assert.ok(units.kind === "units" && units.rows[0].colour === "#e8eef9" && units.note?.text.startsWith("Water") && units.note.order === 2);
  const negative = parseSolutionDiagram("numberline", solutionItems("Loss @ −18 | Gain @ +13 | wall COST PRICE @ 0"));
  assert.ok(negative.kind === "numberline" && negative.points[0].at === -18);
  const table = parseSolutionDiagram("table", solutionItems("Items = Cost | 2 = ₹200 | 3 = *₹300*"));
  assert.ok(table.kind === "table" && table.rows.length === 3 && table.rows[0].order === 0); // header is drawable row 0
  assert.deepEqual(parseSolutionSteps(steps).map((step) => step.answer), [false, false, false, true]);
});

test("slide shows only the cards revealed so far and paints the emphasis yellow", async () => {
  const state = { chapter: "Percentage", questionId: "Q1", title: "The Wall Concept", emphasis: "Wall", problem: "Ritu scores 24% and fails by 28 marks.", diagram: parseSolutionDiagram("numberline", solutionItems(wall)), steps: parseSolutionSteps(steps), timeLabel: "0:12", drawn: 6, drawnBefore: 6, shownBefore: 4 };
  const none = solutionSlideSvg({ ...state, shown: 0 });
  const two = solutionSlideSvg({ ...state, shown: 2 });
  assert.equal((none.match(/STEP \d/g) ?? []).length, 0);
  assert.equal((two.match(/STEP \d/g) ?? []).length, 2);
  assert.ok(!two.includes("ANSWER"));
  assert.match(solutionSlideSvg({ ...state, shown: 4 }), /ANSWER/);
  assert.match(two, /<tspan fill="#ffc857">Wall<\/tspan>/);
  assert.match(two, /PERCENTAGE · Q1/);
  const png = await createSolutionSlide({ ...state, shown: 4 });
  assert.equal(png.readUInt32BE(16), 1920);
  assert.equal(png.readUInt32BE(20), 1080);
});

test("draw: blank on the first row draws everything; later rows carry it; numbers are checked", () => {
  const rows = validatePedagogyRows([
    base({ layout: "solution", board: "T", diagram: "numberline", diagramItems: wall, steps }, 2),
    base({ layout: "solution", questionId: "Q2", board: "T", diagram: "numberline", diagramItems: wall, steps, draw: "0" }, 3),
    base({ layout: "solution", questionId: "Q2", draw: "2" }, 4),
    base({ layout: "solution", questionId: "Q2" }, 5),
  ]);
  assert.deepEqual(rows.map((row) => row.solutionDrawn), [6, 0, 2, 2]);
  assert.equal(validatePedagogyRows([base({ board: "x" })])[0].solutionDrawn, 0);
  assert.throws(() => validatePedagogyRows([base({ layout: "solution", board: "T", diagram: "numberline", diagramItems: wall, draw: "7" })]), /Row 2: draw must be a whole number from 0 to 6/);
});

test("the diagram draws as narrated: only drawn items show, and a new arc traces part-way mid-animation", () => {
  const diagram = parseSolutionDiagram("numberline", solutionItems(wall));
  const state = { chapter: "", questionId: "Q1", title: "T", emphasis: "", problem: "", diagram, steps: [], shown: 0, shownBefore: 0, timeLabel: "0:00" };
  const circles = (svg: string) => (svg.match(/<circle /g) ?? []).length;
  assert.equal(circles(solutionSlideSvg({ ...state, drawn: 0, drawnBefore: 0 })), 0);
  assert.equal(circles(solutionSlideSvg({ ...state, drawn: 1, drawnBefore: 0 })), 1);
  assert.ok(!solutionSlideSvg({ ...state, drawn: 3, drawnBefore: 0 }).includes("28 marks short"));
  // Item 4 (the red arc) drawing on this row: half-way it ends before the wall; done it reaches the wall.
  const tip = (svg: string) => Number(/M[\d.]+ \d+ Q[\d.]+ [\d.]+ ([\d.]+) /.exec(svg)?.[1]);
  const half = tip(solutionSlideSvg({ ...state, drawn: 4, drawnBefore: 3 }, 0.3));
  const full = tip(solutionSlideSvg({ ...state, drawn: 4, drawnBefore: 3 }, 1));
  assert.ok(half < full, `arc tip ${half} should be short of ${full} mid-draw`);
});

test("reviewed rows sent back for rendering keep the solution columns (render route round trip)", async () => {
  const reviewed = validatePedagogyRows([
    base({ layout: "solution", board: "T", problem: "P", diagram: "numberline", diagramItems: wall, steps, draw: "0" }, 2),
    base({ layout: "solution", draw: "3", diagramStep: "1" }, 3),
  ]);
  const route = await import("node:fs").then((fs) => fs.readFileSync(new URL("../src/app/api/question/pedagogy/render/route.ts", import.meta.url), "utf8"));
  // The route rebuilds sheet columns from the reviewed JSON; mirror that mapping here and check nothing is lost.
  assert.match(route, /problem: row\.effectiveProblem, steps: row\.effectiveSteps, draw: row\.solutionDrawn/);
  const json = JSON.parse(JSON.stringify(reviewed)) as Record<string, unknown>[];
  const again = validatePedagogyRows(json.map((row) => ({
    sourceRow: Number(row.sourceRow), questionId: row.questionId, lineNo: row.lineNo, time: row.sourceTime, narration: row.narration, board: row.board, emphasis: row.emphasis,
    questionText: row.questionText, layout: row.layout, diagram: row.diagram, diagramStep: row.diagramStep, diagramItems: (row.diagramItems as string[]).join(" | "),
    problem: row.effectiveProblem, steps: row.effectiveSteps, draw: row.solutionDrawn,
  })));
  assert.deepEqual(again.map((row) => [row.effectiveProblem, row.effectiveSteps, row.solutionDrawn, row.diagramStep, row.diagramItems.length]), reviewed.map((row) => [row.effectiveProblem, row.effectiveSteps, row.solutionDrawn, row.diagramStep, row.diagramItems.length]));
});
