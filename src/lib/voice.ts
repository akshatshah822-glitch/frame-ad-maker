import OpenAI from "openai";

export async function generateNarrationTrack(script: string) {
  const narration = script.trim();
  if (!narration) throw new Error("This generation has no saved voiceover script.");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const speech = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "cedar",
    input: narration,
    instructions: "Speak in clear, natural Indian English with a calm cinematic documentary delivery. Pronounce Indian historical terms carefully and exactly as written. Begin immediately. Do not add, remove, or paraphrase any words.",
    response_format: "mp3",
    speed: 1.1,
  });
  return new Uint8Array(await speech.arrayBuffer());
}
