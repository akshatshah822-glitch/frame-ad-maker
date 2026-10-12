import assert from "node:assert/strict";
import test from "node:test";
import { generatePedagogyNarrationTrack, PedagogyClonedVoiceError, pedagogyVoiceProvider } from "../src/lib/pedagogy-voice";

const cloned = { ELEVENLABS_API_KEY: "test-key", ELEVENLABS_VOICE_ID: "voice 123" };

test("uses the existing OpenAI cedar voice unless both cloned-voice variables are set", async () => {
  assert.equal(pedagogyVoiceProvider({}), "openai-cedar");
  assert.equal(pedagogyVoiceProvider({ ELEVENLABS_API_KEY: "only-key" }), "openai-cedar");
  assert.equal(pedagogyVoiceProvider({ ELEVENLABS_VOICE_ID: "only-voice" }), "openai-cedar");
  assert.equal(pedagogyVoiceProvider(cloned), "elevenlabs-cloned");
  const audio = await generatePedagogyNarrationTrack("Start with the 3Cs.", {
    env: {},
    fetch: async () => { throw new Error("must not call the cloned voice"); },
    openaiTrack: async (narration) => new TextEncoder().encode(`cedar:${narration}`),
  });
  assert.equal(new TextDecoder().decode(audio), "cedar:Start with the 3Cs.");
});

test("speaks the exact narration in the cloned voice", async () => {
  let request: { url: string; init: RequestInit } | undefined;
  const audio = await generatePedagogyNarrationTrack("  Start with the 3Cs.  ", {
    env: cloned,
    fetch: (async (url: string, init: RequestInit) => { request = { url, init }; return new Response(new Uint8Array([1, 2, 3]), { status: 200 }); }) as typeof fetch,
    openaiTrack: async () => { throw new Error("must not fall back"); },
  });
  assert.deepEqual([...audio], [1, 2, 3]);
  assert.equal(request?.url, "https://api.elevenlabs.io/v1/text-to-speech/voice%20123?output_format=mp3_44100_128");
  assert.equal((request?.init.headers as Record<string, string>)["xi-api-key"], "test-key");
  const body = JSON.parse(String(request?.init.body));
  assert.equal(body.text, "Start with the 3Cs.");
  assert.equal(body.model_id, "eleven_multilingual_v2");
});

test("fails loudly instead of switching voices mid-video when the cloned voice errors", async () => {
  const fallback = async () => { throw new Error("must not fall back"); };
  await assert.rejects(() => generatePedagogyNarrationTrack("Line.", { env: cloned, fetch: (async () => new Response("quota", { status: 401 })) as typeof fetch, openaiTrack: fallback }), (error: unknown) => error instanceof PedagogyClonedVoiceError && error.status === 401);
  await assert.rejects(() => generatePedagogyNarrationTrack("Line.", { env: cloned, fetch: (async () => { throw new Error("offline"); }) as typeof fetch, openaiTrack: fallback }), PedagogyClonedVoiceError);
});
