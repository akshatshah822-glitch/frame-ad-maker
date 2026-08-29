import OpenAI from "openai";
import type { Brief, Shot } from "@/lib/types";
import { hasDialogue } from "@/lib/treatment";

export type VoiceSegment = { shotNumber: number; startTime: number; endTime: number; bytes: Uint8Array };

function cleanDialogue(value: string) {
  return value.replace(/^(VO|VOICEOVER|DIALOGUE)(\s*\([^)]*\))?\s*:\s*/i, "").replace(/^['“]|['”]$/g, "").trim();
}

export async function generateVoiceSegments(shots: Shot[], brief: Brief) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const voice = brief.visualTones.some((tone) => /playful|emotional/i.test(tone)) ? "nova" : "onyx";
  const segments: VoiceSegment[] = [];
  for (const shot of shots) {
    if (!hasDialogue(shot.voiceoverOrDialogue)) continue;
    const speech = await client.audio.speech.create({ model: "tts-1-hd", voice, input: cleanDialogue(shot.voiceoverOrDialogue), response_format: "mp3", speed: 1 });
    segments.push({ shotNumber: shot.shotNumber, startTime: shot.startTime, endTime: shot.endTime, bytes: new Uint8Array(await speech.arrayBuffer()) });
  }
  return segments;
}
