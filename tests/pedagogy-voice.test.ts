import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildPedagogySpeechRequest } from "../src/lib/pedagogy-voice";

test("pedagogy narration uses a Hinglish teacher voice brief, not the film documentary brief", () => {
  const request = buildPedagogySpeechRequest("  रुको, यहाँ एक गलती होती है।  ");
  assert.equal(request.input, "रुको, यहाँ एक गलती होती है।");
  assert.match(request.instructions, /maths teacher/);
  assert.match(request.instructions, /Hinglish/);
  assert.match(request.instructions, /Do not add, remove, translate, or paraphrase/);
  assert.doesNotMatch(request.instructions, /documentary|historical/);
});

test("rejects blank pedagogy narration", () => {
  assert.throws(() => buildPedagogySpeechRequest("   "), /blank/);
});

test("pedagogy measurement uses the pedagogy voice; film voice file is unchanged", async () => {
  const measurement = await readFile("src/lib/pedagogy-narration-duration.ts", "utf8");
  assert.match(measurement, /from "@\/lib\/pedagogy-voice"/);
  assert.doesNotMatch(measurement, /from "@\/lib\/voice"/);
  const filmVoice = await readFile("src/lib/voice.ts", "utf8");
  assert.match(filmVoice, /calm cinematic documentary delivery/);
});
