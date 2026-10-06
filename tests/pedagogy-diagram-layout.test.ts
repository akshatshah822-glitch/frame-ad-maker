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
  assert.equal(diagramStepCount("gaining-losing-river"), 3);
  assert.equal(diagramStepCount("subsidy-cycle"), 4);
});

test("notes text respects the per-video size cap", async () => {
  const state = { diagram: "three-sources", step: 3, board: "खेत तक पानी के 3 रास्ते", emphasis: "", title: "T", timeLabel: "0:00" };
  assert.equal(await diagramSlideFontSize(state), 40);
  assert.equal(await diagramSlideFontSize({ ...state, maxFontSize: 30 }), 30);
});

test("river and subsidy diagrams build in the teacher's order", async () => {
  const base = { board: "नोट्स", emphasis: "", title: "T", timeLabel: "0:00" };
  const river1 = await createDiagramSlideSvg({ ...base, diagram: "gaining-losing-river", step: 1 });
  assert.ok(river1.includes("Gaining river") && !river1.includes("Losing river"));
  const river3 = await createDiagramSlideSvg({ ...base, diagram: "gaining-losing-river", step: 3 });
  assert.ok(river3.includes("एक ही पानी"));
  const cycle2 = await createDiagramSlideSvg({ ...base, diagram: "subsidy-cycle", step: 2 });
  assert.ok(cycle2.includes("ट्यूबवेल") && !cycle2.includes("बिजली सब्सिडी"));
});

test("diagram_labels=en draws English words inside the diagram; old briefs stay Hindi", async () => {
  const rows = validatePedagogyRows([
    base({ layout: "diagram", diagram: "canal-network", diagramStep: "4", diagramLabels: "en" }, 2),
    base({ layout: "diagram" }, 3),
    base({ questionId: "S1", layout: "diagram", diagram: "subsidy-cycle", diagramStep: "4" }, 4),
  ]);
  assert.deepEqual(rows.map((row) => row.diagramLabels), ["en", "en", "hi"]);
  assert.throws(() => validatePedagogyRows([base({ layout: "diagram", diagram: "canal-network", diagramLabels: "fr" }, 5)]), /Row 5: diagram_labels must be/);
  const state = { diagram: "canal-network", step: 4, board: "IPC vs IPU", emphasis: "", title: "T", timeLabel: "0:00" };
  const english = await createDiagramSlideSvg({ ...state, labels: "en" });
  assert.ok(english.includes(">Main canal<") && english.includes(">Village<") && !/[ऀ-ॿ]/.test(english.replace(/<text[^>]*>IPC vs IPU<\/text>/, "")));
  const hindi = await createDiagramSlideSvg(state);
  assert.ok(hindi.includes(">बड़ी नहर<"));
});

test("infographics (flow, cards, timeline, compare) take their items from the brief and reveal one per step", async () => {
  const rows = validatePedagogyRows([
    base({ questionId: "LD", layout: "diagram", diagram: "cards", diagramItems: "A = one | B = two | C = three", diagramStep: "1" }, 2),
    base({ questionId: "LD", layout: "diagram", diagramStep: "3" }, 3),
  ]);
  assert.deepEqual(rows[1].diagramItems, ["A = one", "B = two", "C = three"]);
  assert.equal(rows[1].diagramStep, 3);
  assert.throws(() => validatePedagogyRows([base({ layout: "diagram", diagram: "flow" }, 4)]), /Row 4: diagram flow needs diagram_items/);
  assert.throws(() => validatePedagogyRows([base({ layout: "diagram", diagram: "compare", diagramItems: "a | b | c" }, 5)]), /Row 5: diagram compare takes at most 2 items/);
  assert.throws(() => validatePedagogyRows([base({ layout: "diagram", diagram: "timeline", diagramItems: "1992 = x | 1995 = y", diagramStep: "3" }, 6)]), /Row 6: diagram_step must be a whole number from 1 to 2/);
  const state = { diagram: "timeline", items: ["1992 = RCI એક્ટ", "2016 = RPwD એક્ટ"], board: "કાયદા", emphasis: "", title: "T", timeLabel: "0:00" };
  const first = await createDiagramSlideSvg({ ...state, step: 1 });
  assert.ok(first.includes("RCI એક્ટ") && !first.includes("RPwD"));
  const both = await createDiagramSlideSvg({ ...state, step: 2 });
  assert.ok(both.includes("RPwD એક્ટ"));
});

test("equality-equity draws equality first, then equity, then the takeaway", async () => {
  assert.equal(diagramStepCount("equality-equity"), 3);
  const base2 = { diagram: "equality-equity", board: "નોંધ", emphasis: "", title: "T", timeLabel: "0:00" };
  const one = await createDiagramSlideSvg({ ...base2, step: 1 });
  assert.ok(one.includes("સમાનતા (Equality)") && !one.includes("સમતા (Equity)") && one.includes("✗"));
  const three = await createDiagramSlideSvg({ ...base2, step: 3 });
  assert.ok(three.includes("જેને જેટલી જરૂર, એટલી મદદ"));
});
