import type { Concept, Generation, Shot, TreatmentData, VisualBible } from "@/lib/types";

const EMPTY_DIALOGUE = /^(none|n\/a|no dialogue|no voiceover|silent)$/i;

export function hasDialogue(value: string) {
  return value.trim().length > 0 && !EMPTY_DIALOGUE.test(value.trim());
}

function concise(value: string, maxWords = 20) {
  const firstSentence = value.trim().split(/(?<=[.!?])\s+/)[0] || value.trim();
  const words = firstSentence.split(/\s+/);
  return words.length > maxWords ? `${words.slice(0, maxWords).join(" ")}…` : firstSentence;
}

export function getShotDisplay(shot: Shot) {
  return {
    visual: shot.displayVisual?.trim() || concise(shot.visualDescription),
    camera: shot.displayCamera?.trim() || concise([shot.cameraFraming, shot.lensSuggestion, shot.cameraMovement].filter(Boolean).join(" · "), 16),
    action: shot.displayAction?.trim() || concise(shot.subjectAction),
  };
}

export function summarizeVisualBible(bible: VisualBible) {
  return [
    `Subject: ${bible.subject}`,
    `Product: ${bible.product}`,
    `Location: ${bible.location}`,
    `Palette: ${bible.colorPalette.join(", ")}`,
    `Lighting: ${bible.lighting}`,
    `Cinematography: ${bible.cinematography}`,
    `Texture: ${bible.texture}`,
  ].join("\n");
}

export function formatTreatmentText({ brief, concept, generation }: TreatmentData) {
  const shots = generation.shots.map((shot) => {
    const display = getShotDisplay(shot);
    const audio = [hasDialogue(shot.voiceoverOrDialogue) ? `VO / Dialogue: ${shot.voiceoverOrDialogue}` : "", `Audio: ${shot.audio}`].filter(Boolean).join("\n");
    return `SHOT ${String(shot.shotNumber).padStart(2, "0")} — ${shot.narrativeBeat || shot.purpose} — ${shot.startTime}–${shot.endTime} sec\nVisual: ${display.visual}\nCamera: ${display.camera}\nAction: ${display.action}\n${audio}`;
  }).join("\n\n");

  const strategy = brief.intent === "cinematic"
    ? `LOGLINE\n${concept.logline || concept.idea}\n\nHUMAN TRUTH\n${concept.humanTruth || ""}\n\nEMOTIONAL ARC\n${concept.emotionalArc || ""}`
    : `WHAT THIS TESTS\n${concept.whatThisTests || brief.testObjective || ""}`;
  return `FRAME\n\n${brief.intent === "cinematic" ? "Story / Subject" : "Brand / Product"}: ${brief.brandProduct}\nPlatform: ${brief.platform}\nSelected Concept: ${concept.conceptName}\n\nCONCEPT\n${concept.conceptName}\n${concept.idea}\n\n${strategy}\n\nSTORY\n${concept.story}\n\nVISUAL DIRECTION\n${summarizeVisualBible(generation.visualBible)}\n\n${shots}`;
}

export function parseStoredTreatment(record: Record<string, unknown>): TreatmentData | null {
  try {
    const concept = JSON.parse(String(record.selectedConcept ?? "")) as Concept;
    const visualBible = JSON.parse(String(record.visualBible ?? "")) as VisualBible;
    const brandBible = record.brandBible ? JSON.parse(String(record.brandBible)) : undefined;
    const creativeGrammar = record.creativeGrammar ? JSON.parse(String(record.creativeGrammar)) : undefined;
    const shots = JSON.parse(String(record.shotList ?? "")) as Shot[];
    if (!concept?.conceptName || !visualBible?.subject || !Array.isArray(shots) || shots.length < 4 || shots.length > 10) return null;
    return {
      id: String(record._id ?? ""),
      brief: {
        intent: record.intent === "cinematic" ? "cinematic" : "performance",
        brandProduct: String(record.brandProduct ?? ""),
        audience: String(record.audience ?? ""),
        proposition: String(record.proposition ?? ""),
        platform: String(record.platform ?? ""),
        visualTones: Array.isArray(record.visualTones) ? record.visualTones.map(String) : [],
        testObjective: record.testObjective ? String(record.testObjective) : undefined,
        testObjectiveOther: record.testObjectiveOther ? String(record.testObjectiveOther) : undefined,
        preserveDetails: record.preserveDetails ? String(record.preserveDetails) : undefined,
      },
      concept,
      generation: { title: String(record.title ?? concept.conceptName), duration: "30 seconds", brandBible, creativeGrammar, visualBible, shots },
    };
  } catch {
    return null;
  }
}

export function isConcept(value: unknown): value is Concept {
  if (!value || typeof value !== "object") return false;
  const concept = value as Record<string, unknown>;
  return ["conceptName", "idea", "hook", "story", "productRole", "visualWorld", "ending"].every(
    (field) => typeof concept[field] === "string" && Boolean((concept[field] as string).trim()),
  );
}

export function isGeneration(value: unknown): value is Generation {
  if (!value || typeof value !== "object") return false;
  const generation = value as Partial<Generation>;
  return Boolean(generation.visualBible?.subject && Array.isArray(generation.shots) && generation.shots.length >= 4 && generation.shots.length <= 10);
}
