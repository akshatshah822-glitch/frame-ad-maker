import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { buildAdjustedPedagogyTimeline, validatePedagogyRows } from "../src/lib/pedagogy-brief";
import { trimNarrationSilence } from "../src/lib/pedagogy-narration-duration";

const exec = promisify(execFile);
const ffmpeg = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");

const rows = [
  { sourceRow: 2, questionId: "Q", lineNo: "1", time: "0:00", narration: "One.", board: "a", emphasis: "", pauseAfter: "" },
  { sourceRow: 3, questionId: "Q", lineNo: "2", time: "0:10", narration: "Two.", board: "b", emphasis: "", pauseAfter: "haan" },
  { sourceRow: 4, questionId: "Q", lineNo: "3", time: "0:30", narration: "Three.", board: "c", emphasis: "", pauseAfter: "" },
];

test("pack mode ignores timestamps and places lines back to back with a 0.25 s gap", () => {
  const parsed = validatePedagogyRows(rows);
  const timeline = buildAdjustedPedagogyTimeline(parsed, [6.55, 7.56, 2], { pack: true });
  assert.deepEqual(timeline.audit.map((row) => Number(row.allocatedDuration.toFixed(3))), [6.8, 8.56, 2.25]);
  assert.deepEqual(timeline.audit.map((row) => Number(row.adjustedGeneratedTime.toFixed(3))), [0, 6.8, 15.36]);
  assert.ok(Math.abs(timeline.totalDuration - 17.61) < 0.000001);
});

test("pack mode keeps a deliberate pause_after haan as a 1 s gap", () => {
  const parsed = validatePedagogyRows(rows);
  const timeline = buildAdjustedPedagogyTimeline(parsed, [6.55, 7.56, 2], { pack: true });
  assert.ok(Math.abs(timeline.audit[1].allocatedDuration - 8.56) < 0.000001, "row 3 is haan: 7.56 + 1.0");
});

test("pack OFF keeps the existing timestamp timeline exactly", () => {
  const parsed = validatePedagogyRows(rows);
  assert.deepEqual(buildAdjustedPedagogyTimeline(parsed, [6.55, 7.56, 2], { pack: false }), buildAdjustedPedagogyTimeline(parsed, [6.55, 7.56, 2]));
});

test("trims leading and trailing silence but keeps the spoken part", async () => {
  const directory = await mkdtemp(join(tmpdir(), "frame-pack-test-"));
  const input = join(directory, "padded.mp3");
  await exec(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono:d=0.6", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=24000:duration=1", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono:d=0.8", "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1", input]);
  const result = await trimNarrationSilence(input, join(directory, "trimmed.wav"), 7);
  assert.equal(result.trimmed, true);
  assert.ok(result.durationBefore > 2.3, `before ${result.durationBefore}`);
  assert.ok(result.durationAfter > 0.95 && result.durationAfter < 1.2, `after ${result.durationAfter}`);
});

test("falls back to the untrimmed clip and logs it when trimming fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "frame-pack-test-"));
  const broken = join(directory, "broken.mp3");
  await writeFile(broken, "not audio");
  const logged: unknown[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { logged.push(args); };
  try {
    const result = await trimNarrationSilence(broken, join(directory, "out.wav"), 9);
    assert.equal(result.trimmed, false);
    assert.equal(result.path, broken);
  } finally { console.warn = original; }
  assert.match(JSON.stringify(logged), /Pedagogy narration trim fell back to untrimmed clip/);
  assert.match(JSON.stringify(logged), /"sourceRow":9/);
});
