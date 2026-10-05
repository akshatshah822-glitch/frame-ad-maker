import OpenAI from "openai";
import { PedagogyBriefValidationError } from "@/lib/pedagogy-brief";

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
/** eleven_multilingual_v2 cannot speak Gujarati; eleven_v3 can (ElevenLabs language list). */
export const EDUCATOR_GUJARATI_VOICE_MODEL = "eleven_v3";
const GUJARATI_SCRIPT = /[\u0A80-\u0AFF]/;
const loggedModels = new Set<string>();

/** Picks the ElevenLabs model from the script itself: any Gujarati letter -> eleven_v3, else the old model. */
export function educatorVoiceModel(script: string) {
  return GUJARATI_SCRIPT.test(script) ? EDUCATOR_GUJARATI_VOICE_MODEL : EDUCATOR_VOICE_MODEL;
}

export function buildEducatorSpeechRequest(script: string, voiceId: string) {
  const text = script.trim();
  if (!text) throw new Error("Pedagogy narration is blank.");
  const model = educatorVoiceModel(text);
  if (!loggedModels.has(model)) {
    loggedModels.add(model);
    console.info("Pedagogy educator voice model", { path: model === EDUCATOR_GUJARATI_VOICE_MODEL ? "gujarati-v3" : "multilingual-v2", model });
  }
  // eleven_v3 only accepts stability 0, 0.5 or 1 (Creative, Natural, Robust).
  const stability = model === EDUCATOR_GUJARATI_VOICE_MODEL ? 0.5 : 0.45;
  return {
    url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    body: { text, model_id: model, voice_settings: { stability, similarity_boost: 0.8 } },
  };
}

/**
 * Identity of the voice for the narration cache, so educator audio never mixes with default-voice audio.
 * The model follows the line's script, so Hindi lines keep their old cache keys.
 */
export function pedagogyVoiceCacheIdentity(voice: PedagogyVoice = resolvePedagogyVoice(), script = "") {
  return voice.provider === "openai" ? null : { provider: voice.provider, voiceId: voice.voiceId, model: educatorVoiceModel(script) };
}

/** ElevenLabs voice types that are NOT a copy of a real person's voice. */
const NON_PERSON_VOICE_CATEGORIES = new Set(["premade", "generated"]);
/** ElevenLabs voice types that copy a real person's voice and need signed consent. */
const PERSON_CLONE_CATEGORIES = new Set(["cloned", "professional"]);
export const CONSENT_REF_PLACEHOLDER = "type to be checked";
const voiceChecks = new Map<string, Promise<{ name: string; category: string }>>();

export function decideEducatorVoice(category: string, consentRef: string) {
  if (NON_PERSON_VOICE_CATEGORIES.has(category)) return { allowed: true as const, reason: "not a real person's voice" };
  if (PERSON_CLONE_CATEGORIES.has(category)) {
    const hasConsent = consentRef.trim() !== "" && !consentRef.toLowerCase().includes(CONSENT_REF_PLACEHOLDER);
    return hasConsent
      ? { allowed: true as const, reason: "real-person clone with a consent reference" }
      : { allowed: false as const, reason: "this voice is a clone of a real person; set PEDAGOGY_EDUCATOR_CONSENT_REF to the signed consent document" };
  }
  return { allowed: false as const, reason: `unknown ElevenLabs voice type "${category}"` };
}

/**
 * Runs before any educator-voice audio is made (cached or not): looks up the voice type
 * on ElevenLabs and refuses a real-person clone that has no consent reference.
 */
export async function assertEducatorVoiceAllowed(voice: PedagogyVoice, fetchImpl: typeof fetch = fetch) {
  if (voice.provider !== "elevenlabs") return;
  let check = voiceChecks.get(voice.voiceId);
  if (!check) {
    check = (async () => {
      const response = await fetchImpl(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voice.voiceId)}`, { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as { name?: unknown; category?: unknown };
      return { name: String(body.name ?? ""), category: String(body.category ?? "") };
    })();
    voiceChecks.set(voice.voiceId, check);
    check.catch(() => voiceChecks.delete(voice.voiceId));
  }
  let info: { name: string; category: string };
  try {
    info = await check;
  } catch (error) {
    const reason = `could not look up the educator voice on ElevenLabs (${error instanceof Error ? error.message : "unknown error"})`;
    console.error("Pedagogy educator voice check", { path: "blocked", reason });
    throw new PedagogyBriefValidationError(`Educator voice blocked: ${reason}.`, { safeReason: reason });
  }
  const decision = decideEducatorVoice(info.category, voice.consentRef);
  console.info("Pedagogy educator voice check", { path: decision.allowed ? "allowed" : "blocked", name: info.name, category: info.category, consentRef: voice.consentRef, reason: decision.reason });
  if (!decision.allowed) throw new PedagogyBriefValidationError(`Educator voice blocked: ${decision.reason}.`, { safeReason: decision.reason });
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
