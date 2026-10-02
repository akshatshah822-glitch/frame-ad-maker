import assert from "node:assert/strict";
import test from "node:test";
import { parsePedagogyArcs, validatePedagogyRows, type PedagogyBriefInputRow } from "../src/lib/pedagogy-brief";
import { createTrickSlideSvg, workingLayout } from "../src/lib/pedagogy-trick-slide";

const base = (overrides: Partial<PedagogyBriefInputRow>, sourceRow = 2): PedagogyBriefInputRow => ({
  sourceRow, questionId: "T1", lineNo: sourceRow - 1, time: `0:0${sourceRow}`, narration: "एक लाइन।", board: "Step", ...overrides,
});

test("old briefs without the new columns stay on the classic board layout", () => {
  const [row] = validatePedagogyRows([base({})]);
  assert.equal(row.layout, "board");
  assert.equal(row.effectiveWorking, "");
  assert.equal(row.effectiveResult, "");
});

test("trick rows carry working and result forward, but not arcs", () => {
  const rows = validatePedagogyRows([
    base({ layout: "trick", working: "12 × 236", arcs: "0>3", result: "2 _ _ _" }, 2),
    base({ layout: "trick" }, 3),
  ]);
  assert.equal(rows[1].effectiveWorking, "12 × 236");
  assert.equal(rows[1].effectiveResult, "2 _ _ _");
  assert.equal(rows[1].arcs, "");
});

test("arcs are parsed against the working row and bad arcs name the row", () => {
  assert.deepEqual(parsePedagogyArcs("0>4; 1>3 neeche", "12 × 236", 5), [{ from: 0, to: 4, below: false }, { from: 1, to: 3, below: true }]);
  assert.throws(() => validatePedagogyRows([base({ layout: "trick", working: "12 × 236", arcs: "0>9" }, 4)]), /Row 4: arc "0>9"/);
  assert.throws(() => validatePedagogyRows([base({ layout: "fancy" }, 6)]), /Row 6: layout must be/);
});

test("arc draws on with progress and the final answer gets a tick box", () => {
  const layout = workingLayout("12 × 236");
  assert.equal(layout.length, 6);
  const state = { title: "T", working: "12 × 236", arcs: [{ from: 0, to: 3, below: false }], step: "Step 1", result: "28.32 ✓", previousResult: "2832", stepIndex: 0 };
  const start = createTrickSlideSvg(state, 0);
  const end = createTrickSlideSvg(state, 1);
  const offset = (svg: string) => Number(/stroke-dashoffset="([\d.]+)"/.exec(svg)?.[1]);
  assert.ok(offset(start) > 0);
  assert.equal(offset(end), 0);
  assert.match(end, /stroke="#7fe08a"/);
});

test("a long arc under the digits stays clear of the step box", () => {
  const svg = createTrickSlideSvg({ title: "T", working: "113 +13 × 116 +16", arcs: [{ from: 12, to: 2, below: true }], step: "Step", result: "", previousResult: "", stepIndex: 0 }, 1);
  const [, , , controlY, , endY] = /d="M ([\d.]+) ([\d.]+) Q ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg)!.slice(1).map(Number);
  const peak = (endY + controlY) / 2;
  assert.ok(peak < 520, `arc peak ${peak} must stay above the step box at 520`);
});
