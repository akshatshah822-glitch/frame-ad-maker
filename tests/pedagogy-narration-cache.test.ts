import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { validatePedagogyRows } from "../src/lib/pedagogy-brief";
import { createPedagogyNarrationTracks } from "../src/lib/pedagogy-narration-duration";
import { createCachedGrammarReviewer } from "../src/lib/pedagogy-narration";

const exec = promisify(execFile);
const ffmpeg = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");

async function toneMp3(seconds: number) {
  const directory = await mkdtemp(join(tmpdir(), "frame-cache-tone-"));
  const path = join(directory, "tone.mp3");
  await exec(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=300:sample_rate=24000:duration=${seconds}`, path]);
  return new Uint8Array(await readFile(path));
}

const rows = (second: string) => validatePedagogyRows([
  { sourceRow: 2, questionId: "Q", lineNo: "1", time: "0:00", narration: "पहली लाइन।", board: "a" },
  { sourceRow: 3, questionId: "Q", lineNo: "2", time: "0:05", narration: second, board: "b" },
]);

test("voice is generated once per line: the second run reuses cached audio", async () => {
  const cacheDirectory = await mkdtemp(join(tmpdir(), "frame-cache-"));
  const audio = await toneMp3(1.2);
  const calls: string[] = [];
  const generate = async (narration: string) => { calls.push(narration); return audio; };
  const first = await createPedagogyNarrationTracks(rows("दूसरी लाइन।"), await mkdtemp(join(tmpdir(), "run1-")), undefined, { cacheDirectory, generate });
  assert.equal(calls.length, 2, "first run (upload) generates both lines");
  assert.equal(first.usage.generated, 2);
  assert.ok((first.usage.estimatedUsd ?? 0) > 0);
  const second = await createPedagogyNarrationTracks(rows("दूसरी लाइन।"), await mkdtemp(join(tmpdir(), "run2-")), undefined, { cacheDirectory, generate });
  assert.equal(calls.length, 2, "second run (Generate) makes no new voice calls");
  assert.equal(second.usage.cacheHits, 2);
  assert.equal(second.usage.estimatedUsd, 0);
  assert.deepEqual(second.narrationDurations.map((d) => d.toFixed(2)), first.narrationDurations.map((d) => d.toFixed(2)));
});

test("changed text is voiced again; unchanged lines are still reused", async () => {
  const cacheDirectory = await mkdtemp(join(tmpdir(), "frame-cache-"));
  const audio = await toneMp3(1);
  const calls: string[] = [];
  const generate = async (narration: string) => { calls.push(narration); return audio; };
  await createPedagogyNarrationTracks(rows("दूसरी लाइन।"), await mkdtemp(join(tmpdir(), "a-")), undefined, { cacheDirectory, generate });
  const edited = await createPedagogyNarrationTracks(rows("बदली हुई लाइन।"), await mkdtemp(join(tmpdir(), "b-")), undefined, { cacheDirectory, generate });
  assert.deepEqual(calls, ["पहली लाइन।", "दूसरी लाइन।", "बदली हुई लाइन।"]);
  assert.equal(edited.usage.cacheHits, 1);
  assert.equal(edited.usage.generated, 1);
});

test("useCache false always generates (old behaviour available)", async () => {
  const cacheDirectory = await mkdtemp(join(tmpdir(), "frame-cache-"));
  const audio = await toneMp3(1);
  let count = 0;
  const generate = async () => { count += 1; return audio; };
  for (let run = 0; run < 2; run += 1) await createPedagogyNarrationTracks(rows("x।"), await mkdtemp(join(tmpdir(), "c-")), undefined, { cacheDirectory, generate, useCache: false });
  assert.equal(count, 4);
});

test("grammar review runs once per exact text, then comes from cache", async () => {
  const cacheDirectory = await mkdtemp(join(tmpdir(), "frame-cache-"));
  let calls = 0;
  const reviewer = createCachedGrammarReviewer(async () => { calls += 1; return { passes: false, issues: ["Sentence \"x\": missing verb."] }; }, cacheDirectory);
  const first = await reviewer("एक लाइन।");
  const second = await reviewer("एक लाइन।");
  await reviewer("दूसरी लाइन।");
  assert.equal(calls, 2);
  assert.deepEqual(second, first);
});
