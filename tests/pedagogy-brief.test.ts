import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as XLSX from "xlsx";
import { assertNarrationFits, PedagogyBriefValidationError, pedagogyWarnings, validatePedagogyRows } from "../src/lib/pedagogy-brief";
import { createPedagogySlide } from "../src/lib/pedagogy-slide";
import { PedagogyGrammarReviewError, reviewPedagogyNarration } from "../src/lib/pedagogy-narration";
import { extractPedagogyRowsFromWorkbook } from "../src/lib/pedagogy-workbook";
import { renderValidationFailure } from "../src/app/api/question/pedagogy/render/route";

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

test("uses the configured question grammar reviewer without rewriting uploaded narration", async () => {
  const parsed = validatePedagogyRows(rows);
  const warnings = await reviewPedagogyNarration(parsed, async (narration) => {
    assert.equal(narration, rows.find((row) => row.narration === narration)?.narration);
    return { passes: true, issues: [] };
  });
  assert.deepEqual(warnings, []);
  assert.deepEqual(parsed.map((row) => row.narration), rows.map((row) => row.narration));
});

test("returns grammar concerns as warnings and reports a real grammar service failure", async () => {
  const parsed = validatePedagogyRows(rows);
  const warnings = await reviewPedagogyNarration(parsed, async () => ({ passes: false, issues: ["Sentence \"We now combine the terms.\": missing subject."] }));
  assert.deepEqual(warnings, [
    "Row 2: grammar warning: Sentence \"We now combine the terms.\": missing subject.",
    "Row 3: grammar warning: Sentence \"We now combine the terms.\": missing subject.",
    "Row 4: grammar warning: Sentence \"We now combine the terms.\": missing subject.",
  ]);
  await assert.rejects(() => reviewPedagogyNarration(parsed, async () => { throw new Error("reviewer unavailable"); }), PedagogyGrammarReviewError);
});

test("preview route no longer contains the old pedagogy-specific 503 preflight", async () => {
  const routeSource = await readFile("src/app/api/question/pedagogy/preview/route.ts", "utf8");
  assert.doesNotMatch(routeSource, /Pedagogy narration grammar review is not configured/);
  assert.doesNotMatch(routeSource, /process\.env\.OPENAI_API_KEY/);
});

test("rejects duplicate line numbers and backward timestamps", () => {
  assert.throws(() => validatePedagogyRows([{ ...rows[0], lineNo: "2" }, { ...rows[1], lineNo: "2" }]), /duplicate line_no 2/);
  assert.throws(() => validatePedagogyRows([{ ...rows[0], lineNo: "1", time: "4:00" }, { ...rows[1], lineNo: "2", time: "3:54" }]), /moves backwards/);
});

test("returns a pedagogy render 422 with timing diagnostics", async () => {
  let validationError: unknown;
  try { assertNarrationFits(42, 6, 8.4); } catch (error) { validationError = error; }
  assert.ok(validationError instanceof Error);
  assert.ok(validationError instanceof PedagogyBriefValidationError);
  const response = renderValidationFailure(validationError);
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    error: "Row 42: available duration 6.000 seconds; required narration duration 8.400 seconds.",
    code: "NARRATION_TIMING_OVERFLOW",
    sourceRow: 42,
  });
});
