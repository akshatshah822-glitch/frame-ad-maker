import assert from "node:assert/strict";
import test from "node:test";
import { validatePedagogyRows, type PedagogyBriefInputRow } from "../src/lib/pedagogy-brief";
import { createDiagramSlideSvg, diagramSlideFontSize, diagramStepCount } from "../src/lib/pedagogy-diagram-slide";

const base = (overrides: Partial<PedagogyBriefInputRow>, sourceRow = 2): PedagogyBriefInputRow => ({
  sourceRow, questionId: "D4", lineNo: sourceRow - 1, time: `0:0${sourceRow}`, narration: "एक लाइन।", board: "IPC vs IPU", ...overrides,
});

test("old briefs without diagram columns are unchanged", () => {
  const [row] = validatePedagogyRows([base({})]);
  assert.equal(row.layout, "board");
  assert.equal(row.diagram, "");
  assert.equal(row.diagramStep, 0);
});

test("diagram name and step carry forward inside one question, and reset on a new question", () => {
  const rows = validatePedagogyRows([
    base({ layout: "diagram", diagram: "canal-network", diagramStep: "1" }, 2),
    base({ layout: "diagram" }, 3),
    base({ layout: "diagram", diagramStep: 3 }, 4),
    base({ questionId: "F", layout: "diagram", diagram: "three-sources" }, 5),
  ]);
  assert.deepEqual(rows.map((row) => [row.diagram, row.diagramStep]), [["canal-network", 1], ["canal-network", 1], ["canal-network", 3], ["three-sources", 1]]);
});

test("unknown diagrams and out-of-range steps name the row", () => {
  assert.throws(() => validatePedagogyRows([base({ layout: "diagram", diagram: "volcano" }, 7)]), /Row 7: diagram "volcano" is not a FRAME diagram/);
  assert.throws(() => validatePedagogyRows([base({ layout: "diagram", diagram: "canal-network", diagramStep: "9" }, 8)]), /Row 8: diagram_step must be a whole number from 1 to 4/);
  assert.throws(() => validatePedagogyRows([base({ layout: "diagram" }, 9)]), /Row 9: diagram "" is not a FRAME diagram/);
});

test("each step adds drawing, and the newest step fades in with progress", async () => {
  const state = { diagram: "canal-network", board: "IPC vs IPU\nगाँव → हर खेत ✗", emphasis: "IPC vs IPU", title: "T", timeLabel: "0:00" };
  const step1 = await createDiagramSlideSvg({ ...state, step: 1 });
  const step2 = await createDiagramSlideSvg({ ...state, step: 2 });
  assert.ok(!step1.includes("गाँव</text></g>") && !step1.includes(">गाँव<"));
  assert.ok(step2.includes(">गाँव<"));
  const fadingStart = await createDiagramSlideSvg({ ...state, step: 2 }, 0);
  assert.match(fadingStart, /<g opacity="0.00">/);
  assert.equal(diagramStepCount("canal-network"), 4);
  assert.equal(diagramStepCount("three-sources"), 3);
});

test("notes text respects the per-video size cap", async () => {
  const state = { diagram: "three-sources", step: 3, board: "खेत तक पानी के 3 रास्ते", emphasis: "", title: "T", timeLabel: "0:00" };
  assert.equal(await diagramSlideFontSize(state), 40);
  assert.equal(await diagramSlideFontSize({ ...state, maxFontSize: 30 }), 30);
});
