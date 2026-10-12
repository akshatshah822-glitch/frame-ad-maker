import assert from "node:assert/strict";
import test from "node:test";
import { generatePedagogyNarrationTrack, PedagogyElevenLabsVoiceError, pedagogyVoiceProvider } from "../src/lib/pedagogy-voice";

const elevenLabs = { ELEVENLABS_API_KEY: "test-key", ELEVENLABS_VOICE_ID: "MPaTa7NVsOK1Jo2FOqXo" };

test("uses the existing OpenAI cedar voice unless both ElevenLabs variables are set", async () => {
  assert.equal(pedagogyVoiceProvider({}), "openai-cedar");
  assert.equal(pedagogyVoiceProvider({ ELEVENLABS_API_KEY: "only-key" }), "openai-cedar");
  assert.equal(pedagogyVoiceProvider({ ELEVENLABS_VOICE_ID: "only-voice" }), "openai-cedar");
  assert.equal(pedagogyVoiceProvider(elevenLabs), "elevenlabs");
  const audio = await generatePedagogyNarrationTrack("Start with the 3Cs.", {
    env: {},
    fetch: async () => { throw new Error("must not call ElevenLabs"); },
    openaiTrack: async (narration) => new TextEncoder().encode(`cedar:${narration}`),
  });
  assert.equal(new TextDecoder().decode(audio), "cedar:Start with the 3Cs.");
});

test("speaks the exact narration in the configured ElevenLabs voice", async () => {
  let request: { url: string; init: RequestInit } | undefined;
  const audio = await generatePedagogyNarrationTrack("  Start with the 3Cs.  ", {
    env: elevenLabs,
    fetch: (async (url: string, init: RequestInit) => { request = { url, init }; return new Response(new Uint8Array([1, 2, 3]), { status: 200 }); }) as typeof fetch,
    openaiTrack: async () => { throw new Error("must not fall back"); },
  });
  assert.deepEqual([...audio], [1, 2, 3]);
  assert.equal(request?.url, "https://api.elevenlabs.io/v1/text-to-speech/MPaTa7NVsOK1Jo2FOqXo?output_format=mp3_44100_128");
  assert.equal((request?.init.headers as Record<string, string>)["xi-api-key"], "test-key");
  const body = JSON.parse(String(request?.init.body));
  assert.equal(body.text, "Start with the 3Cs.");
  assert.equal(body.model_id, "eleven_multilingual_v2");
});

test("fails loudly instead of switching voices mid-video when ElevenLabs errors", async () => {
  const fallback = async () => { throw new Error("must not fall back"); };
  await assert.rejects(() => generatePedagogyNarrationTrack("Line.", { env: elevenLabs, fetch: (async () => new Response("quota", { status: 401 })) as typeof fetch, openaiTrack: fallback }), (error: unknown) => error instanceof PedagogyElevenLabsVoiceError && error.status === 401);
  await assert.rejects(() => generatePedagogyNarrationTrack("Line.", { env: elevenLabs, fetch: (async () => { throw new Error("offline"); }) as typeof fetch, openaiTrack: fallback }), PedagogyElevenLabsVoiceError);
});
