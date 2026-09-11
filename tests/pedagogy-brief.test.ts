import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { assertNarrationFits, pedagogyWarnings, validatePedagogyRows } from "../src/lib/pedagogy-brief";
import { createPedagogySlide } from "../src/lib/pedagogy-slide";
import { extractPedagogyRowsFromWorkbook } from "../src/lib/pedagogy-workbook";

const rows = [
  { sourceRow: 2, questionId: "Q-20", lineNo: "1", time: "3:54", narration: "Read the expression carefully.", board: "x + y", emphasis: "x", pauseAfter: "" },
  { sourceRow: 3, questionId: "Q-20", lineNo: "2", time: "4:00", narration: "We now combine the terms.", board: "", emphasis: "missing", pauseAfter: "haan" },
  { sourceRow: 4, questionId: "Q-20", lineNo: "3", time: "4:13", narration: "The answer is x plus y.", board: "Answer: x + y", emphasis: "x + y", pauseAfter: "nahi" },
];

test("normalizes the first timestamp and retains a blank board", () => {
  const parsed = validatePedagogyRows(rows);
  assert.deepEqual(parsed.map((row) => row.generatedTimeLabel), ["0:00", "0:06", "0:19"]);
  assert.equal(parsed[1].effectiveBoard, "x + y");
  assert.equal(parsed[0].narration, rows[0].narration);
  assert.deepEqual(pedagogyWarnings(parsed), ["Row 3: emphasis \"missing\" does not exist on the current board; no highlight was added."]);
});

test("imports the first worksheet and preserves narration character-for-character", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.map((row) => ({ question_id: row.questionId, line_no: row.lineNo, time: row.time, sir_ka_vaakya: row.narration, emphasis: row.emphasis, pause_after: row.pauseAfter, board: row.board }))), "Pedagogy");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["not", "the", "first", "sheet"]]), "Ignored");
  const imported = validatePedagogyRows(extractPedagogyRowsFromWorkbook(XLSX.write(workbook, { bookType: "xlsx", type: "array" })));
  assert.equal(imported[0].narration, rows[0].narration);
  assert.deepEqual(imported.map((row) => `${row.sourceTime} -> ${row.generatedTimeLabel}`), ["3:54 -> 0:00", "4:00 -> 0:06", "4:13 -> 0:19"]);
});

test("draws emphasis only when its exact phrase exists", async () => {
  const highlighted = await createPedagogySlide({ questionId: "Q-20", board: "x + y", emphasis: "x", generatedTimeLabel: "0:00" });
  const noMatch = await createPedagogySlide({ questionId: "Q-20", board: "x + y", emphasis: "missing", generatedTimeLabel: "0:00" });
  assert.ok(highlighted.byteLength > 1000);
  assert.notDeepEqual(highlighted, noMatch);
});

test("rejects duplicate line numbers and backward timestamps", () => {
  assert.throws(() => validatePedagogyRows([{ ...rows[0], lineNo: "2" }, { ...rows[1], lineNo: "2" }]), /duplicate line_no 2/);
  assert.throws(() => validatePedagogyRows([{ ...rows[0], lineNo: "1", time: "4:00" }, { ...rows[1], lineNo: "2", time: "3:54" }]), /moves backwards/);
});

test("reports a timing error with row and both durations", () => {
  assert.throws(() => assertNarrationFits(4, 2, 2.4), /Row 4: available duration 2.000 seconds; required narration duration 2.400 seconds/);
});
