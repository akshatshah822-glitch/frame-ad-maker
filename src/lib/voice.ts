import OpenAI from "openai";
import type { Brief, Shot } from "@/lib/types";
import { hasDialogue } from "@/lib/treatment";

export type VoiceSegment = { shotNumber: number; startTime: number; endTime: number; bytes: Uint8Array };

function cleanDialogue(value: string) {
  const voiceLine = value.match(/(?:^|;\s*)(?:VO|VOICEOVER|DIALOGUE)(?:\s*\([^)]*\))?\s*:\s*(.+)$/i)?.[1] ?? value;
  return voiceLine.replace(/^['“]|['”]$/g, "").trim();
}

export async function generateVoiceSegments(shots: Shot[], brief: Brief, narration?: string[]) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  // One voice for the whole film prevents the speed and character changing between shots.
  const voice = "nova";
  const segments: VoiceSegment[] = [];
  for (const shot of shots) {
    const suppliedNarration = narration?.[shot.shotNumber - 1]?.trim();
    const dialogue = suppliedNarration || (hasDialogue(shot.voiceoverOrDialogue) ? cleanDialogue(shot.voiceoverOrDialogue) : "");
    if (!dialogue) continue;
    const speech = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: dialogue,
      instructions: "Speak in clear, natural Indian English with a calm cinematic advertising delivery. Pronounce Indian brand and exam terms carefully and exactly as written. Do not add, remove, or paraphrase any words.",
      response_format: "mp3",
      speed: 1,
    });
    segments.push({ shotNumber: shot.shotNumber, startTime: shot.startTime, endTime: shot.endTime, bytes: new Uint8Array(await speech.arrayBuffer()) });
  }
  return segments;
}
