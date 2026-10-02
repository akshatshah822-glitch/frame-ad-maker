import OpenAI from "openai";

/**
 * Voice brief for exam-question explainer narration only.
 * The film/ad path keeps its own brief in src/lib/voice.ts.
 */
export const PEDAGOGY_VOICE_INSTRUCTIONS = [
  "You are a warm, energetic Indian maths teacher explaining an SSC exam question to students in a live class.",
  "The text is Hinglish written in Devanagari: Hindi words mixed with everyday English classroom words (ratio, total, amount, divide, part, number) spelled in Devanagari.",
  "Pronounce Hindi words with natural Hindi pronunciation, and the English classroom words exactly as Indian teachers say them in class.",
  "Read numbers naturally, as spoken in a Hindi-medium maths class.",
  "Sound conversational and encouraging. Stress the key numbers and warning words such as रुको and याद रखो.",
  "Begin immediately. Do not add, remove, translate, or paraphrase any words.",
].join(" ");

export function buildPedagogySpeechRequest(script: string) {
  const input = script.trim();
  if (!input) throw new Error("Pedagogy narration is blank.");
  return {
    model: "gpt-4o-mini-tts",
    voice: "cedar",
    input,
    instructions: PEDAGOGY_VOICE_INSTRUCTIONS,
    response_format: "mp3" as const,
    speed: 1.05,
  };
}

/**
 * Optional consented educator voice (ElevenLabs voice clone).
 * Off unless ALL of these are set in the server environment:
 *   PEDAGOGY_VOICE=educator
 *   ELEVENLABS_API_KEY            (never logged)
 *   ELEVENLABS_EDUCATOR_VOICE_ID  (the verified clone made by the educator)
 *   PEDAGOGY_EDUCATOR_CONSENT_REF (where the signed consent lives, e.g. a doc ID)
 * Missing any of them -> the default teacher voice runs, and the log says so.
 */
export type PedagogyVoice =
  | { provider: "openai"; label: "default-teacher" }
  | { provider: "elevenlabs"; label: "educator"; voiceId: string; consentRef: string };

const EDUCATOR_VOICE_ENV = ["ELEVENLABS_API_KEY", "ELEVENLABS_EDUCATOR_VOICE_ID", "PEDAGOGY_EDUCATOR_CONSENT_REF"] as const;
const loggedVoiceDecisions = new Set<string>();

export function resolvePedagogyVoice(env: Record<string, string | undefined> = process.env): PedagogyVoice {
  if (env.PEDAGOGY_VOICE?.trim().toLowerCase() !== "educator") return { provider: "openai", label: "default-teacher" };
  const missing = EDUCATOR_VOICE_ENV.filter((name) => !env[name]?.trim());
  if (missing.length) {
    const key = missing.join(",");
    if (!loggedVoiceDecisions.has(key)) {
      loggedVoiceDecisions.add(key);
      console.warn("Pedagogy voice", { path: "default-teacher-fallback", reason: "educator voice requested but not fully configured", missing });
    }
    return { provider: "openai", label: "default-teacher" };
  }
  return { provider: "elevenlabs", label: "educator", voiceId: env.ELEVENLABS_EDUCATOR_VOICE_ID!.trim(), consentRef: env.PEDAGOGY_EDUCATOR_CONSENT_REF!.trim() };
}

export const EDUCATOR_VOICE_MODEL = "eleven_multilingual_v2";

export function buildEducatorSpeechRequest(script: string, voiceId: string) {
  const text = script.trim();
  if (!text) throw new Error("Pedagogy narration is blank.");
  return {
    url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    body: { text, model_id: EDUCATOR_VOICE_MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.8 } },
  };
}

/** Identity of the voice for the narration cache, so educator audio never mixes with default-voice audio. */
export function pedagogyVoiceCacheIdentity(voice: PedagogyVoice = resolvePedagogyVoice()) {
  return voice.provider === "openai" ? null : { provider: voice.provider, voiceId: voice.voiceId, model: EDUCATOR_VOICE_MODEL };
}

export async function generatePedagogyNarrationTrack(script: string, voice: PedagogyVoice = resolvePedagogyVoice()) {
  if (voice.provider === "elevenlabs") {
    const request = buildEducatorSpeechRequest(script, voice.voiceId);
    const response = await fetch(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "audio/mpeg", "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" },
      body: JSON.stringify(request.body),
    });
    // No silent switch to another voice mid-video: a failed educator line fails the render.
    if (!response.ok) throw new Error(`Educator voice request failed with HTTP ${response.status}.`);
    return new Uint8Array(await response.arrayBuffer());
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const speech = await client.audio.speech.create(buildPedagogySpeechRequest(script));
  return new Uint8Array(await speech.arrayBuffer());
}
