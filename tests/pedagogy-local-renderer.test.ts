import assert from "node:assert/strict";
import test from "node:test";
import { createPedagogyTimingAuditCsv, parseLocalPedagogyRenderArgs, pedagogyTimingAuditPath } from "../src/lib/pedagogy-local-renderer";
import { buildAdjustedPedagogyTimeline, validatePedagogyRows } from "../src/lib/pedagogy-brief";
import { reviewPedagogyNarration } from "../src/lib/pedagogy-narration";

const rows = validatePedagogyRows([
  { sourceRow: 2, questionId: "Q-20", lineNo: "1", time: "3:54", narration: "Read the expression carefully.", board: "x + y", emphasis: "x", pauseAfter: "" },
  { sourceRow: 3, questionId: "Q-20", lineNo: "2", time: "4:00", narration: "We now combine the terms.", board: "", emphasis: "", pauseAfter: "haan" },
]);

test("requires explicit absolute xlsx and mp4 paths", () => {
  assert.deepEqual(
    parseLocalPedagogyRenderArgs(["--input", "/Users/admin/brief.xlsx", "--output", "/Users/admin/output.mp4"]),
    { inputPath: "/Users/admin/brief.xlsx", outputPath: "/Users/admin/output.mp4" },
  );
  assert.throws(() => parseLocalPedagogyRenderArgs(["--input", "brief.xlsx", "--output", "/Users/admin/output.mp4"]), /must be an absolute path/);
  assert.throws(() => parseLocalPedagogyRenderArgs(["--input", "/Users/admin/brief.csv", "--output", "/Users/admin/output.mp4"]), /must point to an .xlsx file/);
  assert.throws(() => parseLocalPedagogyRenderArgs(["--input", "/Users/admin/brief.xlsx", "--output", "/Users/admin/output.mov"]), /must end with .mp4/);
});

test("writes every required timing-audit field without board text", () => {
  const timeline = buildAdjustedPedagogyTimeline(rows, [6.55, 2]);
  const csv = createPedagogyTimingAuditCsv(rows, timeline.audit);
  assert.match(csv, /"source row","source timestamp","original video start","adjusted video start","original available duration","measured narration duration","allocated duration","added duration","board-change status"/);
  assert.match(csv, /"2","3:54","0\.000000","0\.000000","6\.000000","6\.550000","7\.050000","1\.050000","changed"/);
  assert.match(csv, /"3","4:00","6\.000000","7\.050000","","2\.000000","2\.500000","0\.000000","retained"/);
  assert.doesNotMatch(csv, /x \+ y/);
  assert.equal(pedagogyTimingAuditPath("/Users/admin/output.mp4"), "/Users/admin/output.mp4.timing-audit.csv");
});

test("reviews every line sequentially with progress while leaving narration unchanged", async () => {
  const narrationBeforeReview = rows.map((row) => row.narration);
  const progress: string[] = [];
  const warnings = await reviewPedagogyNarration(rows, async (narration) => ({
    passes: narration !== rows[1].narration,
    issues: narration === rows[1].narration ? ["Sentence has a missing subject."] : [],
  }), ({ completed, total }) => progress.push(`${completed}/${total}`));
  assert.deepEqual(progress, ["1/2", "2/2"]);
  assert.deepEqual(rows.map((row) => row.narration), narrationBeforeReview);
  assert.deepEqual(warnings, ["Row 3: grammar warning: Sentence has a missing subject."]);
});
