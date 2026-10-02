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
