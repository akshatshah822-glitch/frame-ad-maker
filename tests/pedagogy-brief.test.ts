import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as XLSX from "xlsx";
import { buildAdjustedPedagogyTimeline, pedagogyWarnings, validatePedagogyRows } from "../src/lib/pedagogy-brief";
import { createPedagogySlide } from "../src/lib/pedagogy-slide";
import { PedagogyGrammarReviewError, reviewPedagogyNarration } from "../src/lib/pedagogy-narration";
import { extractPedagogyRowsFromWorkbook } from "../src/lib/pedagogy-workbook";
import { encodePedagogyPreviewEvent, readPedagogyPreviewStream } from "../src/lib/pedagogy-preview-stream";

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

test("cascades an adjusted timeline after measuring every narration line", () => {
  const parsed = validatePedagogyRows(rows);
  const timeline = buildAdjustedPedagogyTimeline(parsed, [6.55, 7.56, 2]);
  assert.equal(timeline.audit[0].originalAvailableDuration, 6);
  assert.equal(timeline.audit[0].allocatedDuration, 7.05);
  assert.ok(Math.abs(timeline.audit[0].addedDuration - 1.05) < 0.000001);
  assert.equal(timeline.audit[1].adjustedGeneratedTime, 7.05);
  assert.equal(timeline.audit[1].originalAvailableDuration, 13);
  assert.equal(timeline.audit[1].allocatedDuration, 13);
  assert.ok(Math.abs(timeline.audit[2].adjustedGeneratedTime - 20.05) < 0.000001);
  assert.equal(timeline.audit[2].allocatedDuration, 2.5);
  assert.ok(Math.abs(timeline.totalDuration - 22.55) < 0.000001);
});

test("reads every streamed narration progress update before the preview result", async () => {
  const parsed = validatePedagogyRows(rows);
  const timeline = buildAdjustedPedagogyTimeline(parsed, [2, 2, 2]);
  const response = new Response([
    encodePedagogyPreviewEvent({ type: "progress", phase: "checking-grammar", completed: 0, total: 3 }),
    encodePedagogyPreviewEvent({ type: "progress", phase: "measuring-narration", completed: 1, total: 3 }),
    encodePedagogyPreviewEvent({ type: "progress", phase: "measuring-narration", completed: 2, total: 3 }),
    encodePedagogyPreviewEvent({ type: "progress", phase: "measuring-narration", completed: 3, total: 3 }),
    encodePedagogyPreviewEvent({ type: "result", result: { rows: parsed, warnings: [], grammarWarnings: [], timingAudit: timeline.audit } }),
  ].join(""), { headers: { "Content-Type": "application/x-ndjson" } });
  const progress: string[] = [];
  const result = await readPedagogyPreviewStream(response, (event) => progress.push(`${event.phase}:${event.completed}/${event.total}`));
  assert.deepEqual(progress, ["checking-grammar:0/3", "measuring-narration:1/3", "measuring-narration:2/3", "measuring-narration:3/3"]);
  assert.equal(result.timingAudit?.length, 3);
});
