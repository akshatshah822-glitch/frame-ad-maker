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

export async function generatePedagogyNarrationTrack(script: string) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const speech = await client.audio.speech.create(buildPedagogySpeechRequest(script));
  return new Uint8Array(await speech.arrayBuffer());
}
