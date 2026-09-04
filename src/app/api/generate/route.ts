import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import OpenAI from "openai";
import { buildImagePrompt } from "@/lib/image-prompt";
import type { BrandBible, Concept, CreativeGrammar, Generation, Shot, TreatmentData, VisualBible } from "@/lib/types";
import { classifyOpenAIError } from "@/lib/openai-error";
import { findUnsupportedProof, neutralizeUnsupportedProof, proofSafetyInstruction } from "@/lib/proof-safety";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";
import { generateStoryboardNarration } from "@/lib/voiceover-script";
import { cameraDirectionError } from "@/lib/camera-direction";
import { findDuplicateWordIssue } from "@/lib/treatment-copy-quality";

type StoryboardBrief = { intent?: string; testObjective?: string; testObjectiveOther?: string; preserveDetails?: string; brandProduct?: string; audience?: string; proposition?: string; platform?: string; visualTones?: string[]; selectedConcept?: unknown; qaTargetShotCount?: number; runId?: string | number };
type ModelShot = Omit<Shot, "imagePrompt" | "imageStatus" | "imageUrl" | "imageStorageId" | "imageError">;
type ModelGeneration = { title: string; duration: string; brandBible: BrandBible; creativeGrammar: CreativeGrammar; visualBible: VisualBible; shots: ModelShot[] };
type ExternalApiCall = <T>(call: () => Promise<T>) => Promise<T>;
type ValidatedStoryboardBrief = Required<Pick<StoryboardBrief, "brandProduct" | "audience" | "proposition" | "platform" | "visualTones" | "selectedConcept">> & { intent: "performance" | "cinematic"; testObjective: string; testObjectiveOther: string; preserveDetails: string; qaTargetShotCount?: number; runId: string };

const platforms = ["Instagram / Reels", "Meta Ads", "YouTube", "TV / OTT"];
const visualToneOptions = ["Cinematic", "Luxury", "Raw", "Playful", "Emotional", "Bold", "Minimal", "Surreal"];
const conceptFields = ["conceptName", "idea", "hook", "story", "productRole", "visualWorld", "ending"] as const;
const stringShotFields = ["narrativeBeat", "purpose", "displayVisual", "displayCamera", "displayAction", "visualDescription", "subjectAction", "productAction", "performanceDirection", "cameraFraming", "cameraAngle", "lensSuggestion", "cameraMovement", "focusBehaviour", "lighting", "audio", "audioIntent", "voiceoverOrDialogue", "copyOrDialogue", "on_screen_text", "productPresence", "locationAndProps", "transitionIntent"] as const;
const requiredShotContentFields = ["displayVisual", "displayCamera", "displayAction", "visualDescription", "subjectAction", "cameraFraming", "cameraAngle", "lensSuggestion", "cameraMovement", "lighting", "audio", "productPresence", "locationAndProps"] as const;
const visualBibleStringFields = ["subject", "product", "location", "lighting", "cinematography", "texture"] as const;
const brandBibleStringFields = ["brandName", "category", "product", "audience", "singleMindedProposition", "reasonToBelieve", "toneOfVoice", "visualLanguage"] as const;
const brandBibleArrayFields = ["brandPersonality", "brandColors", "productDesignLocks", "packagingLocks", "logoRules", "characterOrMascotRules", "thingsBrandWouldDo", "thingsBrandWouldNeverDo"] as const;
const grammarFields = ["creativeArchetype", "emotionalArc", "hookMechanism", "productRevealStrategy", "performanceStyle", "editingRhythm", "cameraPhilosophy", "copyDensity", "humourLevel", "audioRole", "brandRevealStyle", "ctaBehaviour", "platformBehaviour"] as const;
const motionFields = ["startState", "endState", "startPosition", "movementPath", "endPosition", "subjectMotion", "productMotion", "cameraMotion", "environmentMotion", "focusMotion", "performanceBeat", "gazeAndExpression", "transitionIntent"] as const;

function jsonByteLength(value: unknown) {
  const json = JSON.stringify(value);
  return json ? new TextEncoder().encode(json).length : 0;
}

function loggedJson(body: unknown, init?: ResponseInit) {
  console.log(`RETURNING bytes: ${jsonByteLength(body)}`);
  return NextResponse.json(body, init);
}

function validateStoryboardBrief(value: unknown): { brief: ValidatedStoryboardBrief; error?: never } | { brief?: never; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "request body must be a JSON object." };
  const body = value as Record<string, unknown>;
  const brandProduct = String(body.brandProduct ?? "").trim();
  const audience = String(body.audience ?? "").trim();
  const proposition = String(body.proposition ?? "").trim();
  const platform = String(body.platform ?? "").trim();
  const runId = String(body.runId ?? "").trim();
  const intentValue = String(body.intent ?? "performance").trim();
  const testObjective = String(body.testObjective ?? "").trim();
  const testObjectiveOther = String(body.testObjectiveOther ?? "").trim();
  const preserveDetails = String(body.preserveDetails ?? "").trim();
  if (body.visualTones != null && !Array.isArray(body.visualTones)) return { error: "visualTones must be an array." };
  const visualTones = (body.visualTones ?? []).map((tone) => String(tone ?? "").trim()).filter(Boolean);
  if (!brandProduct) return { error: "brandProduct is required." };
  if (!audience) return { error: "audience is required." };
  if (!proposition) return { error: "proposition is required." };
  if (!platform) return { error: "platform is required." };
  if (!visualTones.length) return { error: "visualTones must contain at least one value." };
  if (!runId) return { error: "runId is required." };
  if (intentValue !== "performance" && intentValue !== "cinematic") return { error: "intent must be performance or cinematic." };
  if (!body.selectedConcept || typeof body.selectedConcept !== "object" || Array.isArray(body.selectedConcept)) return { error: "selectedConcept must be an object." };
  if (body.qaTargetShotCount != null && (!Number.isInteger(body.qaTargetShotCount) || Number(body.qaTargetShotCount) < 4 || Number(body.qaTargetShotCount) > 8)) return { error: "qaTargetShotCount must be an integer from 4 to 8." };
  return { brief: { brandProduct, audience, proposition, platform, visualTones, runId, intent: intentValue, testObjective, testObjectiveOther, preserveDetails, selectedConcept: body.selectedConcept, qaTargetShotCount: body.qaTargetShotCount as number | undefined } };
}

function isConcept(value: unknown): value is Concept {
  if (!value || typeof value !== "object") return false;
  const concept = value as Record<string, unknown>;
  return conceptFields.every((field) => typeof concept[field] === "string" && concept[field].trim().length > 0);
}

const outputSchema = {
  type: "object",
  additionalProperties: false,
    required: ["title", "duration", "brandBible", "creativeGrammar", "visualBible", "shots"],
    properties: {
      title: { type: "string" },
      duration: { type: "string" },
      brandBible: {
        type: "object", additionalProperties: false, required: [...brandBibleStringFields, ...brandBibleArrayFields],
        properties: {
          brandName: { type: "string" }, category: { type: "string" }, product: { type: "string" }, audience: { type: "string" }, singleMindedProposition: { type: "string" }, reasonToBelieve: { type: "string" }, toneOfVoice: { type: "string" }, visualLanguage: { type: "string" },
          brandPersonality: { type: "array", items: { type: "string" } }, brandColors: { type: "array", items: { type: "string" } }, productDesignLocks: { type: "array", items: { type: "string" } }, packagingLocks: { type: "array", items: { type: "string" } }, logoRules: { type: "array", items: { type: "string" } }, characterOrMascotRules: { type: "array", items: { type: "string" } }, thingsBrandWouldDo: { type: "array", items: { type: "string" } }, thingsBrandWouldNeverDo: { type: "array", items: { type: "string" } },
        },
      },
      creativeGrammar: {
        type: "object", additionalProperties: false, required: [...grammarFields],
        properties: Object.fromEntries(grammarFields.map((field) => [field, { type: "string" }])),
      },
    visualBible: {
      type: "object",
      additionalProperties: false,
      required: [...visualBibleStringFields, "colorPalette", "continuityLocks"],
      properties: {
        subject: { type: "string" }, product: { type: "string" }, location: { type: "string" },
        colorPalette: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
        lighting: { type: "string" }, cinematography: { type: "string" }, texture: { type: "string" },
        continuityLocks: { type: "array", minItems: 1, items: { type: "string" } },
      },
    },
    shots: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["shotNumber", "sceneNumber", "startTime", "endTime", ...stringShotFields, "motionDirection"],
        properties: {
          shotNumber: { type: "integer" }, sceneNumber: { type: "integer" }, startTime: { type: "integer" }, endTime: { type: "integer" },
          narrativeBeat: { type: "string" }, purpose: { type: "string" },
          displayVisual: { type: "string" }, displayCamera: { type: "string" }, displayAction: { type: "string" },
          visualDescription: { type: "string" }, subjectAction: { type: "string" }, cameraFraming: { type: "string" },
          cameraAngle: { type: "string" }, lensSuggestion: { type: "string" }, cameraMovement: { type: "string" },
          lighting: { type: "string" }, audio: { type: "string" }, voiceoverOrDialogue: { type: "string" }, on_screen_text: { type: "string" },
          productPresence: { type: "string" }, locationAndProps: { type: "string" }, productAction: { type: "string" }, performanceDirection: { type: "string" }, focusBehaviour: { type: "string" }, copyOrDialogue: { type: "string" }, audioIntent: { type: "string" }, transitionIntent: { type: "string" },
          motionDirection: {
            type: "object", additionalProperties: false, required: [...motionFields, "motionIntensity"],
            properties: { ...Object.fromEntries(motionFields.map((field) => [field, { type: "string" }])), motionIntensity: { type: "string", enum: ["restrained", "moderate", "energetic"] } },
          },
        },
      },
    },
  },
} as const;

function isNonEmptyStringArray(value: unknown, maxItems?: number): value is string[] {
  return Array.isArray(value) && value.length > 0 && (!maxItems || value.length <= maxItems) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function parseGeneration(outputText: string): ModelGeneration | null {
  try {
    const parsed = JSON.parse(outputText) as Partial<ModelGeneration>;
    const bible = parsed.visualBible as Record<string, unknown> | undefined;
    const brand = parsed.brandBible as unknown as Record<string, unknown> | undefined;
    const grammar = parsed.creativeGrammar as unknown as Record<string, unknown> | undefined;
    const bibleValid = bible && visualBibleStringFields.every((field) => typeof bible[field] === "string" && (bible[field] as string).trim().length > 0)
      && isNonEmptyStringArray(bible.colorPalette, 4) && isNonEmptyStringArray(bible.continuityLocks);
    const brandValid = brand && brandBibleStringFields.every((field) => typeof brand[field] === "string") && brandBibleArrayFields.every((field) => Array.isArray(brand[field]));
    const grammarValid = grammar && grammarFields.every((field) => typeof grammar[field] === "string");
    if (typeof parsed.title !== "string" || typeof parsed.duration !== "string" || !brandValid || !grammarValid || !bibleValid || !Array.isArray(parsed.shots) || parsed.shots.length !== 6) return null;
    const structurallyValid = parsed.shots.every((shot) => {
      if (!shot || typeof shot !== "object") return false;
      const stringsComplete = requiredShotContentFields.every((field) => typeof shot[field] === "string")
        && typeof shot.voiceoverOrDialogue === "string";
      const motion = shot.motionDirection as unknown as Record<string, unknown> | undefined;
      const motionValid = motion && motionFields.every((field) => typeof motion[field] === "string") && ["restrained", "moderate", "energetic"].includes(String(motion.motionIntensity));
      const cameraValid = !cameraDirectionError(String(shot.cameraMovement ?? "")) && !cameraDirectionError(String(motion?.cameraMotion ?? ""));
      const screenText = String(shot.on_screen_text ?? "").trim();
      const onScreenTextValid = Boolean(screenText) && screenText.length <= 72;
      return stringsComplete && motionValid && cameraValid && onScreenTextValid && Number.isInteger(shot.sceneNumber);
    });
    if (!structurallyValid) return null;
    const boundaries = [0, 4, 10, 14, 20, 26, 30];
    const shots = parsed.shots.map((shot, index) => ({ ...shot, shotNumber: index + 1, startTime: boundaries[index], endTime: boundaries[index + 1] }));
    const generation = {
      title: parsed.title.trim() || "Directed 30-second treatment",
      duration: parsed.duration.trim() || "30 seconds",
      brandBible: parsed.brandBible,
      creativeGrammar: parsed.creativeGrammar,
      visualBible: parsed.visualBible,
      shots,
    } as ModelGeneration;
    if (findDuplicateWordIssue(generation as Generation)) return null;
    return generation;
  } catch {
    return null;
  }
}

function isMissing(value: unknown) {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

function fillMissingFields<T>(source: T, repair: unknown, filled: string[], path = ""): T {
  if (Array.isArray(source) && Array.isArray(repair)) return source.map((value, index) => fillMissingFields(value, repair[index], filled, `${path}[${index}]`)) as T;
  if (!source || typeof source !== "object" || Array.isArray(source) || !repair || typeof repair !== "object" || Array.isArray(repair)) return source;
  const merged = { ...(source as Record<string, unknown>) };
  for (const [key, repairValue] of Object.entries(repair as Record<string, unknown>)) {
    const fieldPath = path ? `${path}.${key}` : key;
    if (isMissing(merged[key]) && !isMissing(repairValue)) {
      merged[key] = repairValue;
      filled.push(fieldPath);
    } else if (merged[key] && typeof merged[key] === "object" && repairValue && typeof repairValue === "object") {
      merged[key] = fillMissingFields(merged[key], repairValue, filled, fieldPath);
    }
  }
  return merged as T;
}

async function makeGeneration({ intent, testObjective, preserveDetails, brandProduct, audience, proposition, platform, visualTones, selectedConcept, qaTargetShotCount, externalApiCall }: { intent: "performance" | "cinematic"; testObjective?: string; preserveDetails?: string; brandProduct: string; audience: string; proposition: string; platform: string; visualTones: string[]; selectedConcept: Concept; qaTargetShotCount?: number; externalApiCall: ExternalApiCall }) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await externalApiCall(() => client.responses.create({
    model: "gpt-5-mini",
    reasoning: { effort: "minimal" },
    input: `You are the narrative architect and storyboard director of an elite advertising studio. Develop the approved creative concept into one coherent, production-ready 30-second ${intent === "performance" ? "performance advertisement" : "cinematic visual story"}.

INTENT
${intent === "performance" ? "PERFORMANCE AD" : "CINEMATIC STORY"}

BRAND
${brandProduct}

AUDIENCE
${audience}

SINGLE-MINDED PROPOSITION
${proposition}

PLATFORM
${platform}

TONE
${visualTones.join(", ")}

SELECTED CREATIVE CONCEPT
Name: ${selectedConcept.conceptName}
Idea: ${selectedConcept.idea}
Hook: ${selectedConcept.hook}
Story: ${selectedConcept.story}
Product role: ${selectedConcept.productRole}
Visual world: ${selectedConcept.visualWorld}
Ending: ${selectedConcept.ending}
${intent === "performance" ? `Creative mechanism: ${selectedConcept.creativeMechanism || selectedConcept.idea}\nProof mechanism: ${selectedConcept.proofMechanism || "Choose the most credible proof for the brief"}\nWhat this tests: ${selectedConcept.whatThisTests || testObjective}` : `Logline: ${selectedConcept.logline || selectedConcept.idea}\nHuman truth: ${selectedConcept.humanTruth || "Derive from the approved story"}\nMain character: ${selectedConcept.mainCharacter || "Derive from the approved story"}\nCentral conflict: ${selectedConcept.centralConflict || selectedConcept.story}\nEmotional arc: ${selectedConcept.emotionalArc || "Derive from the approved story"}\nCore message: ${selectedConcept.coreMessage || proposition}\nDetails to preserve: ${preserveDetails || "None supplied"}`}

NARRATIVE ARCHITECTURE
- Choose the structure that best serves this exact concept. Do not use a universal Hook/Tension/Product/Proof/Payoff/Brand template.
- Generate exactly 6 shots. Each shot must earn its place and the six together must form one coherent film.
${qaTargetShotCount ? `- PRODUCTION QA REQUIREMENT: Keep exactly 6 shots while preserving the requested QA intent.` : ""}
- The first shot starts at 0, the final shot ends at 30, timings are contiguous, and shot numbers are sequential.
- narrativeBeat is a short human-readable name specific to that moment, not a forced template label.
${intent === "performance" ? "- The complete sequence must accomplish attention, message, proof, and action. The selected test objective must materially shape the order, proof and opening." : "- Build a clear setup, conflict, turn and payoff appropriate to the story. Preserve dignity and specificity; avoid melodrama and stereotypes."}

CONTINUITY RULES
- All shots must feel like scenes from one film, not disconnected images.
- Preserve character identity through role, action and blocking only; never describe their body, appearance or clothing.
- Preserve the same product appearance, location logic, visual palette, and cinematic style.
- Make the narrative action progress clearly from shot to shot.
- Keep the approved concept fixed. Do not replace it with a new idea.
- Make the single-minded proposition impossible to miss through visual storytelling.
- Keep voiceover or dialogue natural and deliverable within each shot's timing.
- Write clean reader-facing treatment copy. Never repeat a word accidentally, including repeats joined by a conjunction such as "rhythmic and rhythmic".
- Adapt framing and composition to the selected platform.

VISUAL BIBLE
- Generate one shared Visual Bible before defining the shots.
- Subject must describe role, action and blocking only. Never describe body, appearance, age, clothing, wardrobe, styling, hair, skin, ethnicity or physical characteristics.
- Product must lock exact materials, shape, proportions, finish, surface texture, and defining visual features.
- Location must lock the environment, architecture, surfaces, props, and background details.
- Use no more than four dominant colors.
- Lighting must define source, direction, softness, contrast, time of day, and practical lights.
- Cinematography must define camera character, lens family, depth of field, framing philosophy, and movement style.
- Texture must define product material, environment, atmosphere, and film character only.
- Continuity locks must explicitly list everything that cannot change across the complete sequence.
- Avoid plastic skin, inconsistent faces, random background objects, unnecessary neon, excessive bokeh, inconsistent wardrobe, inconsistent product shape, warped jewellery or products, and text inside images.

BRAND BIBLE AND CREATIVE GRAMMAR
- Derive a compact Brand Bible only from this brief and approved concept. Never invent official colours, logos, packaging, mascots, claims, legal rules, or established brand behaviour; use empty arrays when unavailable.
- Identify the audience desire, category tension, human truth, product truth, reason to believe, single-minded message and creative opportunity internally.
- Select the most fitting creative archetype. Do not default to premium slow motion.
- Creative Grammar must define how this specific ad communicates: arc, hook, reveal, performance, edit rhythm, camera, copy, humour, audio, brand reveal, CTA and platform behaviour.

SHOT DIRECTION
- IMAGE SAFETY LOCK: Describe only action, product, environment, lighting and camera. Never describe a person's body, appearance or clothing except the minimum product contact needed to show the advertised product.
- Every shot must depict exactly one continuous moment that can become one edge-to-edge production frame. Never put a match cut, before-and-after, multiple locations, or two moments inside one shot's visualDescription, displayVisual, subjectAction, or productAction. transitionIntent may describe the cut to the next shot, but the current frame must remain a single moment.
- displayVisual must be one plain, filmable sentence of roughly 8–20 words.
- displayCamera must be one concise instruction combining framing, lens, and measurable movement, such as "85mm close-up · 10% push-in over 4 seconds".
- displayAction must be one concise, physical action sentence.
- Keep the detailed production fields complete. The display fields are summaries for a producer, not replacements.
- motionDirection must lock start/end states, blocking positions, movement path, subject/product/camera/environment/focus motion, intensity, performance, gaze and the editable transition beat.
- cameraMovement and motionDirection.cameraMotion must each use digits to specify both movement amount and duration, such as "10% push-in over 4 seconds". A locked camera must be written as "0% movement over 4 seconds". Never use vague terms such as slow, subtle, gentle, slight, gradual, steady, restrained, minimal, micro, noticeable, or "a clearly observable amount".
- Direct micro-expression, gaze, gesture, body language and product interaction. Never default to smiling at camera.
- For every shot, locationAndProps must specify only the set dressing and props visible in that frame while staying inside the shared location logic.
- Vary action, framing, angle, lens, and movement so the sequence progresses visually.
- Do not write final image prompts. The application constructs them from the shared Visual Bible and shot direction.
- Put every exact word, number, symbol, caption, label, or CTA that must appear in the finished frame in on_screen_text, limited to 72 characters. Use "None" when no text is required. Never describe that readable text as already present in displayVisual, visualDescription, locationAndProps, productPresence, or any image-facing field; the application renders on_screen_text later as code. sceneNumber groups shots that share one dramatic scene. productAction, performanceDirection, focusBehaviour, audioIntent, copyOrDialogue and transitionIntent must be concise and useful; use "None" when genuinely not applicable.

${proofSafetyInstruction}

Return only the structured storyboard.`,
    text: { format: { type: "json_schema", name: "concept_led_storyboard", strict: true, schema: outputSchema } },
  }));
  let modelGeneration = parseGeneration(response.output_text);
  if (!modelGeneration) return null;
  const suppliedSource = [brandProduct, audience, proposition, testObjective, preserveDetails].filter(Boolean).join("\n");
  const proofIssues = findUnsupportedProof(modelGeneration, suppliedSource);
  if (proofIssues.length) {
    const repaired = await externalApiCall(() => client.responses.create({
      model: "gpt-5-mini",
      reasoning: { effort: "minimal" },
      instructions: `You are a strict advertising compliance editor. Repair the supplied storyboard without changing its concept, shot count, timings, narrative beats, or visual continuity.\n\n${proofSafetyInstruction}`,
      input: `USER-SUPPLIED SOURCE OF TRUTH\n${suppliedSource}\n\nUNSUPPORTED PROOF FOUND\n${proofIssues.join(", ")}\n\nSTORYBOARD TO REPAIR\n${JSON.stringify(modelGeneration)}\n\nReturn the complete repaired storyboard.`,
      text: { format: { type: "json_schema", name: "repaired_concept_led_storyboard", strict: true, schema: outputSchema } },
    }));
    const filled: string[] = [];
    let repairedOutput: unknown;
    try { repairedOutput = JSON.parse(repaired.output_text); } catch { repairedOutput = null; }
    const preRepairGeneration = modelGeneration;
    const repairedGeneration = repairedOutput ? parseGeneration(JSON.stringify(fillMissingFields(preRepairGeneration, repairedOutput, filled))) : null;
    const retainedKeys = repairedGeneration?.shots.every((shot, index) => {
      const before = Object.keys(preRepairGeneration.shots[index] ?? {}).sort().join(",");
      const after = Object.keys(shot).sort().join(",");
      return before === after;
    });
    if (!repairedGeneration || !retainedKeys) {
      console.log("repair discarded, using pre-repair storyboard");
      modelGeneration = preRepairGeneration;
    } else {
      console.log(`repair applied, filled fields: ${filled.join(", ") || "none"}`);
      modelGeneration = repairedGeneration;
    }
    if (findUnsupportedProof(modelGeneration, suppliedSource).length) modelGeneration = neutralizeUnsupportedProof(modelGeneration, suppliedSource);
  }
  const sharedPromptContext = {
    intent,
    selectedConcept: selectedConcept.idea,
    narrativeStructure: modelGeneration.shots.map((shot) => `${shot.shotNumber}. ${shot.narrativeBeat}`).join(" → "),
    storyContext: selectedConcept.story,
    selectedTone: visualTones.join(", "),
    platform,
    visualBible: modelGeneration.visualBible,
  };
  return {
    ...modelGeneration,
    shots: modelGeneration.shots.map((shot) => ({
      ...shot,
      imagePrompt: buildImagePrompt({ ...sharedPromptContext, ...shot }),
      imageStatus: "pending" as const,
    })),
  };
}

const post = async (request: Request) => {
  let rawBody: unknown;
  try { rawBody = await request.json(); }
  catch { return loggedJson({ error: "The storyboard brief could not be read. Please try again." }, { status: 400 }); }
  const validation = validateStoryboardBrief(rawBody);
  if ("error" in validation) return loggedJson({ error: validation.error }, { status: 400 });
  const body = validation.brief;

  let step = 0;
  const externalApiCall: ExternalApiCall = async (call) => {
    const currentStep = ++step;
    console.log(`STEP ${currentStep} start`);
    const response = await call();
    console.log(`STEP ${currentStep} done, bytes: ${jsonByteLength(response)}`);
    return response;
  };

  const { brandProduct, runId, intent, testObjective: suppliedTestObjective, testObjectiveOther, preserveDetails, audience, proposition, platform, visualTones, selectedConcept } = body;
  const testObjective = suppliedTestObjective === "Other" ? testObjectiveOther : suppliedTestObjective;
  const requestedQaCount = Number.isInteger(body.qaTargetShotCount) && body.qaTargetShotCount! >= 4 && body.qaTargetShotCount! <= 8 ? body.qaTargetShotCount : undefined;
  const qaTargetShotCount = requestedQaCount && process.env.FRAME_QA_TOKEN && request.headers.get("x-frame-qa-token") === process.env.FRAME_QA_TOKEN ? requestedQaCount : undefined;

  if (!platforms.includes(platform)) return loggedJson({ error: "Choose one of the available platforms." }, { status: 400 });
  if (visualTones.length > 3 || visualTones.some((tone) => !visualToneOptions.includes(tone))) return loggedJson({ error: "Choose one to three available visual tones." }, { status: 400 });
  if (!isConcept(selectedConcept)) return loggedJson({ error: "Choose a complete creative direction before generating the storyboard." }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return loggedJson({ error: "Add OPENAI_API_KEY before generating the storyboard." }, { status: 500 });

  if (runId && process.env.NEXT_PUBLIC_CONVEX_URL) {
    try { await externalApiCall(() => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!).mutation(anyApi.runs.setStage, { id: runId, status: "storyboard_generating", step: "Building the storyboard" })); } catch (error) { console.warn("Run storyboard status could not be saved", error); }
  }

  let generation: Generation | null;
  try {
    generation = await makeGeneration({ intent, testObjective, preserveDetails, brandProduct, audience, proposition, platform, visualTones, selectedConcept, qaTargetShotCount, externalApiCall });
    if (!generation) {
      console.warn("Storyboard response was incomplete; retrying once");
      generation = await makeGeneration({ intent, testObjective, preserveDetails, brandProduct, audience, proposition, platform, visualTones, selectedConcept, qaTargetShotCount, externalApiCall });
    }
  }
  catch (error) {
    console.error("OpenAI storyboard generation failed", error);
    const kind = classifyOpenAIError(error);
    if (runId && process.env.NEXT_PUBLIC_CONVEX_URL) {
      try { await externalApiCall(() => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!).mutation(anyApi.runs.fail, { id: runId, step: "Building the storyboard", error: "The storyboard could not be built." })); } catch { /* Preserve the generation error response. */ }
    }
    if (kind === "rate_limit") return loggedJson({ error: "We're receiving too many generation requests. Try again shortly." }, { status: 429 });
    if (kind === "quota" || kind === "configuration") return loggedJson({ error: "Storyboard generation is not available for this project right now." }, { status: 503 });
    return loggedJson({ error: "We couldn't build the storyboard. Try again." }, { status: 502 });
  }
  if (!generation) {
    if (runId && process.env.NEXT_PUBLIC_CONVEX_URL) {
      try {
        await externalApiCall(() => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!).mutation(anyApi.runs.fail, { id: runId, step: "Building the storyboard", error: "The storyboard came back incomplete." }));
      } catch { /* Preserve the generation error response. */ }
    }
    const responseBody = { error: "The storyboard came back incomplete. Please generate it again." };
    return loggedJson(responseBody, { status: 502 });
  }
  const duplicateCopy = findDuplicateWordIssue(generation, selectedConcept);
  if (duplicateCopy) {
    return loggedJson({ error: `The treatment copy repeats "${duplicateCopy.word}" in ${duplicateCopy.field}. Please revise the creative direction before publishing.` }, { status: 422 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    console.warn("Storyboard generated without persistence: NEXT_PUBLIC_CONVEX_URL is missing");
    return loggedJson({ generation, saved: false });
  }

  let narration: Awaited<ReturnType<typeof generateStoryboardNarration>>;
  try {
    const treatment: TreatmentData = {
      brief: { intent, brandProduct, audience, proposition, platform, visualTones, testObjective: suppliedTestObjective, testObjectiveOther, preserveDetails },
      concept: selectedConcept,
      generation,
    };
    const timings = generation.shots.map((shot) => ({ duration: shot.endTime - shot.startTime }));
    narration = await generateStoryboardNarration(treatment, timings, externalApiCall);
  } catch (error) {
    console.error("Voiceover script-writing step failed", error);
    return loggedJson({ error: "The storyboard was completed, but the voiceover script-writing step did not pass validation. Please generate it again." }, { status: 502 });
  }

  const generationWithScript: Generation = { ...generation, script: narration.script };
  try {
    const client = new ConvexHttpClient(convexUrl);
    const generationId = await externalApiCall(() => client.mutation(anyApi.generations.save, { intent, testObjective: suppliedTestObjective, testObjectiveOther, preserveDetails, brandProduct, audience, proposition, platform, visualTones, selectedConcept: JSON.stringify(selectedConcept), brandBible: JSON.stringify(generation.brandBible), creativeGrammar: JSON.stringify(generation.creativeGrammar), visualBible: JSON.stringify(generation.visualBible), title: generation.title, script: narration.script, shotList: JSON.stringify(generation.shots) }));
    if (runId) await externalApiCall(() => client.mutation(anyApi.runs.setStage, { id: runId, status: "images_generating", step: `Drawing frame 1 of ${generation.shots.length}`, currentCount: 0, totalCount: generation.shots.length, generationId }));
    if (runId) await externalApiCall(() => client.mutation(anyApi.runs.setNarrationStatus, { id: runId, status: narration.script ? "passed" : "failed", error: narration.narrationError }));
    return loggedJson({ generation: generationWithScript, generationId, saved: true });
  } catch (error) {
    console.warn("Storyboard generated but Convex persistence failed", error);
    return loggedJson({ generation: generationWithScript, saved: false });
  }
};

export const POST = withJsonErrors(post);
export const GET = methodNotAllowed(["POST"]);
export const HEAD = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const OPTIONS = methodNotAllowed(["POST"]);
