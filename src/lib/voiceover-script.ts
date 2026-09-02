import OpenAI from "openai";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { TreatmentData, VideoClip } from "@/lib/types";

export type VoiceoverExternalCall = <T>(call: () => Promise<T>) => Promise<T>;
type VoiceoverTiming = { duration: number };
const directCall: VoiceoverExternalCall = (call) => call();

export function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function voiceoverWordBudget(timings: VoiceoverTiming[]) {
  const durationSeconds = timings.reduce((total, timing) => total + (Number.isFinite(timing.duration) && timing.duration > 0 ? timing.duration : 0), 0);
  if (durationSeconds <= 0) throw new Error("The film has no valid clip duration for a voiceover script.");
  return Math.floor(durationSeconds * 2.5);
}

export function buildVoiceoverScriptSource(treatment: TreatmentData) {
  const shots = [...treatment.generation.shots]
    .sort((a, b) => a.shotNumber - b.shotNumber)
    .map((shot) => ({
      shotNumber: shot.shotNumber,
      startTime: shot.startTime,
      endTime: shot.endTime,
      voiceoverOrDialogue: shot.voiceoverOrDialogue,
      copyOrDialogue: shot.copyOrDialogue,
    }));
  return JSON.stringify({ brief: treatment.brief, shots });
}

export type VoiceoverSentenceReview = {
  text: string;
  passes: boolean;
  note: string;
};

export type VoiceoverValidation = {
  passes: boolean;
  sentences: VoiceoverSentenceReview[];
};

const validationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["passes", "sentences"],
  properties: {
    passes: { type: "boolean" },
    sentences: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "grammarPass", "agreementPass", "breathPass", "spokenPass", "note"],
        properties: {
          text: { type: "string" },
          grammarPass: { type: "boolean" },
          agreementPass: { type: "boolean" },
          breathPass: { type: "boolean" },
          spokenPass: { type: "boolean" },
          note: { type: "string" },
        },
      },
    },
  },
} as const;

export async function validateVoiceoverScript(script: string, externalApiCall: VoiceoverExternalCall = directCall): Promise<VoiceoverValidation> {
  const response = await externalApiCall(() => new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).responses.create({
    model: "gpt-5.6",
    reasoning: { effort: "low" },
    instructions: "Act as a strict spoken-English editor. Review every sentence in order. The first sentence must be a natural question that a curious viewer would ask about the images, and every later sentence must help answer that question. A sentence passes only when its grammar is correct, its subject and verb agree, every verb has a clear and natural object when the verb requires one, concrete nouns carry the meaning, no clause is awkward to pronounce, and it can be spoken comfortably in one breath. Treat 20 words as the maximum for one breath. The note must state specific evidence, not merely say that it passes.",
    input: script,
    text: { format: { type: "json_schema", name: "voiceover_read_aloud_validation", strict: true, schema: validationSchema } },
  }));
  const parsed = JSON.parse(response.output_text) as {
    passes: boolean;
    sentences: Array<{ text: string; grammarPass: boolean; agreementPass: boolean; breathPass: boolean; spokenPass: boolean; note: string }>;
  };
  const sentences = parsed.sentences.map((sentence) => {
    const withinBreath = countWords(sentence.text) <= 20;
    const passes = sentence.grammarPass && sentence.agreementPass && sentence.breathPass && sentence.spokenPass && withinBreath;
    const note = withinBreath ? sentence.note : `${sentence.note} It exceeds the 20-word breath limit.`;
    return { text: sentence.text.trim(), passes, note: note.trim() };
  });
  if (sentences[0] && !sentences[0].text.endsWith("?")) sentences[0] = { ...sentences[0], passes: false, note: `${sentences[0].note} The opening sentence is not a question.` };
  return { passes: parsed.passes && sentences.length > 0 && sentences.every((sentence) => sentence.passes), sentences };
}

async function generateDraft(treatment: TreatmentData, wordBudget: number, externalApiCall: VoiceoverExternalCall, rejectedDraft?: string, correctionNotes?: string) {
  const spokenTarget = Math.floor(wordBudget * 0.9);
  const source = JSON.parse(buildVoiceoverScriptSource(treatment)) as Record<string, unknown>;
  const response = await externalApiCall(() => new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).responses.create({
    model: "gpt-5.6",
    reasoning: { effort: "low" },
    instructions: `Write one continuous voiceover script for a finished short film. Use the treatment and storyboard as the only source of truth. The first sentence must always be a natural question that a curious viewer would ask about what the film shows. Every following sentence must help answer that opening question. Write for a narrator speaking aloud: use simple subject-verb-object sentences and one clear idea per sentence; use plain concrete nouns with the necessary articles; keep each sentence at 20 words or fewer; give every verb a clear, natural object when it requires one; prefer familiar spoken phrases over compressed literary verbs, such as "rain becomes scarce" instead of "rain thins"; place modifiers beside the exact noun they describe; keep subjects and verbs in agreement; avoid abstract nouns as sentence subjects; name the exact landscape, object, or natural force instead of vague phrases such as "two worlds", "local forces", or "each side"; avoid stacked clauses, awkward inversions, fragments, and phrases a narrator could stumble over. Use correct grammar and number agreement throughout. Do not write shot labels, stage directions, headings, quotation marks, or commentary. Preserve factual accuracy and follow the story in shot order. Aim for ${spokenTarget} words to leave room for natural pauses, and never exceed the hard ${wordBudget}-word limit. Return only the script text.${correctionNotes ? ` Rewrite the rejected draft and correct every issue from the review. Do not preserve a rejected phrase merely to stay close to the draft.` : ""}`,
    input: correctionNotes ? JSON.stringify({ source, rejectedDraft, correctionNotes }) : JSON.stringify(source),
  }));
  const script = response.output_text.trim();
  if (!script) throw new Error("Voiceover script generation returned no text.");
  return script;
}

export async function generateVoiceoverScript(treatment: TreatmentData, timings: VoiceoverTiming[], externalApiCall: VoiceoverExternalCall = directCall) {
  const wordBudget = voiceoverWordBudget(timings);
  let script = await generateDraft(treatment, wordBudget, externalApiCall);
  let validation = await validateVoiceoverScript(script, externalApiCall);
  const initialWordCount = countWords(script);
  if (initialWordCount > wordBudget) validation = { passes: false, sentences: [...validation.sentences, { text: script, passes: false, note: `The script has ${initialWordCount} words and exceeds the ${wordBudget}-word film budget.` }] };
  if (!validation.passes) {
    const notes = validation.sentences.filter((sentence) => !sentence.passes).map((sentence) => `${sentence.text}: ${sentence.note}`).join("\n");
    const rejectedDraft = script;
    script = await generateDraft(treatment, wordBudget, externalApiCall, rejectedDraft, notes);
    validation = await validateVoiceoverScript(script, externalApiCall);
  }
  const finalWordCount = countWords(script);
  if (finalWordCount > wordBudget) validation = { passes: false, sentences: [...validation.sentences, { text: script, passes: false, note: `The script has ${finalWordCount} words and exceeds the ${wordBudget}-word film budget.` }] };
  if (!validation.passes) throw new Error(`Voiceover script failed its spoken-language validation: ${validation.sentences.filter((sentence) => !sentence.passes).map((sentence) => sentence.note).join(" ")}`);
  return script;
}

export async function ensureVoiceoverScript(generationId: string, treatment: TreatmentData, clips: VideoClip[]) {
  const existing = treatment.generation.script?.trim();
  if (existing) return existing;
  const script = await generateVoiceoverScript(treatment, clips);
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) throw new Error("Voiceover script storage is unavailable.");
  const saved = await new ConvexHttpClient(convexUrl).mutation(anyApi.generations.saveScript, { generationId, script });
  if (!saved) throw new Error("The generated voiceover script could not be saved.");
  return script;
}
