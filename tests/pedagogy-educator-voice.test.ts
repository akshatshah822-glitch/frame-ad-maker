import assert from "node:assert/strict";
import test from "node:test";
import { buildEducatorSpeechRequest, resolvePedagogyVoice } from "../src/lib/pedagogy-voice";

const full = { PEDAGOGY_VOICE: "educator", ELEVENLABS_API_KEY: "test-only-not-a-key", ELEVENLABS_EDUCATOR_VOICE_ID: "voice123", PEDAGOGY_EDUCATOR_CONSENT_REF: "consent-doc-1" };

test("default teacher voice is used unless educator voice is explicitly turned on", () => {
  assert.equal(resolvePedagogyVoice({}).label, "default-teacher");
  assert.equal(resolvePedagogyVoice({ ...full, PEDAGOGY_VOICE: "" }).label, "default-teacher");
});

test("educator voice needs the key, the voice id and a consent reference", () => {
  assert.deepEqual(resolvePedagogyVoice(full), { provider: "elevenlabs", label: "educator", voiceId: "voice123", consentRef: "consent-doc-1" });
  const logs: unknown[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { logs.push(args); };
  try {
    assert.equal(resolvePedagogyVoice({ ...full, PEDAGOGY_EDUCATOR_CONSENT_REF: "" }).label, "default-teacher");
  } finally {
    console.warn = original;
  }
  const logged = JSON.stringify(logs);
  assert.match(logged, /default-teacher-fallback/);
  assert.match(logged, /PEDAGOGY_EDUCATOR_CONSENT_REF/);
  assert.doesNotMatch(logged, /test-only-not-a-key/, "the API key is never logged");
});

test("educator request uses the multilingual model and keeps the script word for word", () => {
  const request = buildEducatorSpeechRequest("  छियानवे गुणा अट्ठानवे।  ", "voice 1");
  assert.equal(request.url, "https://api.elevenlabs.io/v1/text-to-speech/voice%201?output_format=mp3_44100_128");
  assert.equal(request.body.text, "छियानवे गुणा अट्ठानवे।");
  assert.equal(request.body.model_id, "eleven_multilingual_v2");
  assert.throws(() => buildEducatorSpeechRequest("  ", "v"), /blank/);
});

test("real-person clones need a consent reference; library and designed voices do not", async () => {
  const { decideEducatorVoice } = await import("../src/lib/pedagogy-voice");
  assert.equal(decideEducatorVoice("premade", "").allowed, true);
  assert.equal(decideEducatorVoice("generated", "").allowed, true);
  assert.equal(decideEducatorVoice("cloned", "elevenlabs voice, type to be checked before first render").allowed, false);
  assert.equal(decideEducatorVoice("professional", "").allowed, false);
  assert.equal(decideEducatorVoice("professional", "https://example.com/signed-consent.pdf").allowed, true);
  assert.equal(decideEducatorVoice("something-new", "x").allowed, false, "unknown voice types are blocked");
});

test("the voice check blocks a clone without consent before any audio is made", async () => {
  const { assertEducatorVoiceAllowed } = await import("../src/lib/pedagogy-voice");
  const voice = { provider: "elevenlabs" as const, label: "educator" as const, voiceId: "clone-1", consentRef: "elevenlabs voice, type to be checked before first render" };
  const fakeFetch = (async () => new Response(JSON.stringify({ name: "Some Teacher", category: "cloned" }), { status: 200 })) as typeof fetch;
  const original = console.info;
  console.info = () => {};
  try {
    await assert.rejects(assertEducatorVoiceAllowed(voice, fakeFetch), /Educator voice blocked: this voice is a clone of a real person/);
  } finally {
    console.info = original;
  }
});

test("Gujarati narration switches the educator voice to eleven_v3; Hindi stays on multilingual v2", async () => {
  const { educatorVoiceModel, pedagogyVoiceCacheIdentity } = await import("../src/lib/pedagogy-voice");
  const gujarati = buildEducatorSpeechRequest("બાળકનો વિકાસ સતત ચાલે છે.", "v");
  assert.equal(gujarati.body.model_id, "eleven_v3");
  assert.equal(gujarati.body.voice_settings?.stability, 0.5);
  assert.equal(educatorVoiceModel("छियानवे गुणा अट्ठानवे।"), "eleven_multilingual_v2");
  const voice = { provider: "elevenlabs" as const, label: "educator" as const, voiceId: "v", consentRef: "c" };
  assert.equal(pedagogyVoiceCacheIdentity(voice, "છ")?.model, "eleven_v3");
  assert.equal(pedagogyVoiceCacheIdentity(voice, "छह")?.model, "eleven_multilingual_v2");
});

test("Hindi/English lines use the voice's own saved settings; Gujarati keeps 0.9; both are part of the cache identity", async () => {
  const { EDUCATOR_VOICE_SPEED, EDUCATOR_VOICE_SETTINGS, pedagogyVoiceCacheIdentity } = await import("../src/lib/pedagogy-voice");
  assert.equal(EDUCATOR_VOICE_SPEED, 0.9);
  assert.equal(buildEducatorSpeechRequest("छह", "v").body.voice_settings, undefined, "no forced settings: the voice sounds as saved");
  assert.equal(buildEducatorSpeechRequest("છ", "v").body.voice_settings?.speed, 0.9);
  const voice = { provider: "elevenlabs" as const, label: "educator" as const, voiceId: "v", consentRef: "c" };
  assert.equal(pedagogyVoiceCacheIdentity(voice, "छह")?.speed, EDUCATOR_VOICE_SETTINGS, "audio made with forced settings is not reused");
  assert.equal(pedagogyVoiceCacheIdentity(voice, "છ")?.speed, 0.9);
});

test("a refused educator line keeps ElevenLabs' reason in the error, without the key", async () => {
  const { createPedagogyNarrationTracks } = await import("../src/lib/pedagogy-narration-duration");
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "voice-err-"));
  const row = { sourceRow: 4, narration: "छह" } as never;
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { errors.push(JSON.stringify(args)); };
  try {
    await assert.rejects(
      createPedagogyNarrationTracks([row], dir, undefined, { useCache: false, generate: async () => { throw new Error("Educator voice request failed with HTTP 401 (quota_exceeded)."); } }),
      /Row 4: FRAME could not complete narration speech generation\. Reason: Educator voice request failed with HTTP 401 \(quota_exceeded\)/,
    );
  } finally {
    console.error = original;
  }
  assert.match(errors.join(""), /speech-generation-failed/);
  assert.doesNotMatch(errors.join(""), /test-only-not-a-key/);
});
