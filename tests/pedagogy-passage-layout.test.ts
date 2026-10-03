import assert from "node:assert/strict";
import test from "node:test";
import { validatePedagogyRows, pedagogyWarnings, type PedagogyBriefInputRow } from "../src/lib/pedagogy-brief";
import { createPassageSlideSvg, phraseRanges } from "../src/lib/pedagogy-passage-slide";

const passage = "Every October, the nation remembers Gandhi.\nHis insistence on non-violence was never a sign of weakness.";
const row = (overrides: Partial<PedagogyBriefInputRow>, sourceRow = 2): PedagogyBriefInputRow => ({
  sourceRow, questionId: "P", lineNo: sourceRow - 1, time: `0:0${sourceRow}`, narration: "एक लाइन।", board: "word = matlab", layout: "passage", questionText: passage, ...overrides,
});

test("passage layout is accepted and the emphasis is checked against the passage, not the board", () => {
  const rows = validatePedagogyRows([row({ emphasis: "insistence" }), row({ emphasis: "not in passage" }, 3)]);
  assert.equal(rows[0].layout, "passage");
  assert.deepEqual(pedagogyWarnings(rows), ['Row 3: emphasis "not in passage" does not appear in the passage; no highlight was added.']);
});

test("phrase ranges are case-insensitive and find every occurrence", () => {
  assert.deepEqual(phraseRanges("Gandhi and gandhi", ["GANDHI"]), [[0, 6], [11, 17]]);
});

test("the whole passage is on one slide, the current word is highlighted and earlier words underlined", async () => {
  const svg = await createPassageSlideSvg({ passage, emphasis: "insistence", taught: ["October"], board: "insistence = zid", title: "Read with me", timeLabel: "0:05" });
  for (const word of ["Every", "October,", "Gandhi.", "His", "weakness."]) assert.match(svg, new RegExp(`>${word.replace(".", "\\.")}<`));
  assert.equal((svg.match(/rx="8" fill="#ffd166"\/>/g) ?? []).length, 1, "one highlight box for the current word");
  assert.equal((svg.match(/height="4" rx="2" fill="#4fd1c5"/g) ?? []).length, 1, "one underline for the earlier word");
});
