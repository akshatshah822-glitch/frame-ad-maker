import assert from "node:assert/strict";
import test from "node:test";
import { buildSarvamSpeechRequest, generateSarvamNarrationTrack, pedagogyVoiceCacheIdentity, resolvePedagogyVoice, sarvamLanguageCode } from "../src/lib/pedagogy-voice";

const VOICE = "svc-194fbcfd-5e98-4d79-9a49-a8b477b5ae00";
const KEY = "test-only-not-a-key";

function captureLogs(run: () => void) {
  const logs: unknown[] = [];
  const warn = console.warn;
  const info = console.info;
  console.warn = (...args: unknown[]) => { logs.push(args); };
  console.info = (...args: unknown[]) => { logs.push(args); };
  try { run(); } finally { console.warn = warn; console.info = info; }
  return JSON.stringify(logs);
}

test("Sarvam voice is off unless PEDAGOGY_SARVAM_VOICE_ID is set", () => {
  assert.equal(resolvePedagogyVoice({ SARVAM_API_KEY: KEY }).label, "default-teacher");
});

test("Sarvam voice wins over PEDAGOGY_VOICE when id and key are set, and the path is logged", () => {
  let voice;
  const logged = captureLogs(() => { voice = resolvePedagogyVoice({ PEDAGOGY_SARVAM_VOICE_ID: VOICE, SARVAM_API_KEY: KEY, PEDAGOGY_VOICE: "educator" }); });
  assert.deepEqual(voice, { provider: "sarvam", label: "sarvam-clone", voiceId: VOICE });
  assert.match(logged, /sarvam-clone/);
  assert.doesNotMatch(logged, new RegExp(KEY), "the API key is never logged");
});

test("Sarvam voice without a key falls back to PEDAGOGY_VOICE and logs the skipped path", () => {
  let voice;
  const logged = captureLogs(() => { voice = resolvePedagogyVoice({ PEDAGOGY_SARVAM_VOICE_ID: "svc-00000000-0000-0000-0000-000000000001" }); });
  assert.equal(voice!.label, "default-teacher");
  assert.match(logged, /sarvam-skipped/);
  assert.match(logged, /SARVAM_API_KEY/);
});

test("a malformed Sarvam voice id is skipped and logged", () => {
  let voice;
  const logged = captureLogs(() => { voice = resolvePedagogyVoice({ PEDAGOGY_SARVAM_VOICE_ID: "krupa", SARVAM_API_KEY: KEY }); });
  assert.equal(voice!.label, "default-teacher");
  assert.match(logged, /sarvam-skipped/);
});

test("language follows the line's script; English words inside a Gujarati line stay in that request", () => {
  assert.equal(sarvamLanguageCode("કેમ છો? Tell me about yourself"), "gu-IN");
  assert.equal(sarvamLanguageCode("रुको, यहाँ ratio देखो"), "hi-IN");
  assert.equal(sarvamLanguageCode("See you in the next class!"), "en-IN");
});

test("request keeps the script word for word and asks for mp3", () => {
  const request = buildSarvamSpeechRequest("  હું Krupa, Tell me about yourself.  ", VOICE);
  assert.equal(request.url, "https://api.sarvam.ai/voices/clone");
  assert.deepEqual(request.fields, { text: "હું Krupa, Tell me about yourself.", voice_id: VOICE, language_code: "gu-IN", pace: "1", output_audio_codec: "mp3", speech_sample_rate: "44100" });
  assert.throws(() => buildSarvamSpeechRequest("   ", VOICE), /blank/);
  assert.throws(() => buildSarvamSpeechRequest("ક".repeat(1001), VOICE), /at most 1000/);
});

test("cache identity separates Sarvam audio from other voices and languages", () => {
  const voice = { provider: "sarvam" as const, label: "sarvam-clone" as const, voiceId: VOICE };
  const gu = pedagogyVoiceCacheIdentity(voice, "કેમ છો?");
  assert.deepEqual(gu, { provider: "sarvam", voiceId: VOICE, languageCode: "gu-IN", pace: 1, codec: "mp3-44100" });
  assert.notDeepEqual(gu, pedagogyVoiceCacheIdentity(voice, "Hello"));
});

test("Sarvam audio is decoded from audio_b64; a failed line fails loudly with status and code, never the key", async () => {
  process.env.SARVAM_API_KEY = KEY;
  try {
    let seen: { url: string; key: string | null; fields: Record<string, string> } | null = null;
    const ok = (async (url: string, init: RequestInit) => {
      const form = init.body as FormData;
      seen = { url, key: new Headers(init.headers).get("api-subscription-key"), fields: Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])) };
      return new Response(JSON.stringify({ audio_b64: Buffer.from("ID3-audio").toString("base64"), request_id: "r1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const audio = await generateSarvamNarrationTrack("કેમ છો?", VOICE, ok);
    assert.equal(Buffer.from(audio).toString(), "ID3-audio");
    assert.equal(seen!.key, KEY);
    assert.equal(seen!.fields.voice_id, VOICE);

    const bad = (async () => new Response(JSON.stringify({ error: { code: "insufficient_quota_error", message: "x" } }), { status: 429 })) as unknown as typeof fetch;
    await assert.rejects(generateSarvamNarrationTrack("કેમ છો?", VOICE, bad), (error: Error) => {
      assert.match(error.message, /HTTP 429 \(insufficient_quota_error\)/);
      assert.doesNotMatch(error.message, new RegExp(KEY));
      return true;
    });

    const empty = (async () => new Response(JSON.stringify({ audio_b64: "" }), { status: 200 })) as unknown as typeof fetch;
    await assert.rejects(generateSarvamNarrationTrack("કેમ છો?", VOICE, empty), /no audio/);
  } finally {
    delete process.env.SARVAM_API_KEY;
  }
});
