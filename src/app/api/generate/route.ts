import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import OpenAI from "openai";
import { buildImagePrompt } from "@/lib/image-prompt";
import type { BrandBible, Concept, CreativeGrammar, Generation, Shot, VisualBible } from "@/lib/types";
import { classifyOpenAIError } from "@/lib/openai-error";

type StoryboardBrief = { brandProduct?: string; audience?: string; proposition?: string; platform?: string; visualTones?: string[]; selectedConcept?: unknown };
type ModelShot = Omit<Shot, "imagePrompt" | "imageStatus" | "imageUrl" | "imageStorageId" | "imageError">;
type ModelGeneration = { title: string; duration: string; brandBible: BrandBible; creativeGrammar: CreativeGrammar; visualBible: VisualBible; shots: ModelShot[] };

const platforms = ["Instagram / Reels", "Meta Ads", "YouTube", "TV / OTT"];
const visualToneOptions = ["Cinematic", "Luxury", "Raw", "Playful", "Emotional", "Bold", "Minimal", "Surreal"];
const conceptFields = ["conceptName", "idea", "hook", "story", "productRole", "visualWorld", "ending"] as const;
const stringShotFields = ["purpose", "displayVisual", "displayCamera", "displayAction", "visualDescription", "subjectAction", "cameraFraming", "cameraAngle", "lensSuggestion", "cameraMovement", "lighting", "audio", "voiceoverOrDialogue", "productPresence", "locationAndProps"] as const;
const requiredShotContentFields = ["displayVisual", "displayCamera", "displayAction", "visualDescription", "subjectAction", "cameraFraming", "cameraAngle", "lensSuggestion", "cameraMovement", "lighting", "audio", "productPresence", "locationAndProps"] as const;
const visualBibleStringFields = ["subject", "product", "location", "lighting", "cinematography", "texture"] as const;
const brandBibleStringFields = ["brandName", "category", "product", "audience", "singleMindedProposition", "reasonToBelieve", "toneOfVoice", "visualLanguage"] as const;
const brandBibleArrayFields = ["brandPersonality", "brandColors", "productDesignLocks", "packagingLocks", "logoRules", "characterOrMascotRules", "thingsBrandWouldDo", "thingsBrandWouldNeverDo"] as const;
const grammarFields = ["creativeArchetype", "emotionalArc", "hookMechanism", "productRevealStrategy", "performanceStyle", "editingRhythm", "cameraPhilosophy", "copyDensity", "humourLevel", "audioRole", "brandRevealStyle", "ctaBehaviour", "platformBehaviour"] as const;
const motionFields = ["startState", "endState", "startPosition", "movementPath", "endPosition", "subjectMotion", "productMotion", "cameraMotion", "environmentMotion", "focusMotion", "performanceBeat", "gazeAndExpression", "transitionIntent"] as const;
const shotStructure = [
  { shotNumber: 1, startTime: 0, endTime: 3, purpose: "HOOK" },
  { shotNumber: 2, startTime: 3, endTime: 7, purpose: "TENSION" },
  { shotNumber: 3, startTime: 7, endTime: 12, purpose: "PRODUCT" },
  { shotNumber: 4, startTime: 12, endTime: 18, purpose: "PROOF / ESCALATION" },
  { shotNumber: 5, startTime: 18, endTime: 25, purpose: "PAYOFF" },
  { shotNumber: 6, startTime: 25, endTime: 30, purpose: "BRAND ENDING" },
] as const;

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
        required: ["shotNumber", "startTime", "endTime", ...stringShotFields, "motionDirection"],
        properties: {
          shotNumber: { type: "integer" }, startTime: { type: "integer" }, endTime: { type: "integer" },
          purpose: { type: "string", enum: shotStructure.map((shot) => shot.purpose) },
          displayVisual: { type: "string" }, displayCamera: { type: "string" }, displayAction: { type: "string" },
          visualDescription: { type: "string" }, subjectAction: { type: "string" }, cameraFraming: { type: "string" },
          cameraAngle: { type: "string" }, lensSuggestion: { type: "string" }, cameraMovement: { type: "string" },
          lighting: { type: "string" }, audio: { type: "string" }, voiceoverOrDialogue: { type: "string" },
          productPresence: { type: "string" }, locationAndProps: { type: "string" },
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
    const grammarValid = grammar && grammarFields.every((field) => typeof grammar[field] === "string" && Boolean((grammar[field] as string).trim()));
    if (typeof parsed.title !== "string" || !parsed.title.trim() || typeof parsed.duration !== "string" || !brandValid || !grammarValid || !bibleValid || !Array.isArray(parsed.shots) || parsed.shots.length !== 6) return null;
    const valid = parsed.shots.every((shot) => {
      if (!shot || typeof shot !== "object") return false;
      const stringsComplete = requiredShotContentFields.every((field) => typeof shot[field] === "string" && shot[field].trim().length > 0)
        && typeof shot.voiceoverOrDialogue === "string";
      const motion = shot.motionDirection as unknown as Record<string, unknown> | undefined;
      const motionValid = motion && motionFields.every((field) => typeof motion[field] === "string" && Boolean((motion[field] as string).trim())) && ["restrained", "moderate", "energetic"].includes(String(motion.motionIntensity));
      return stringsComplete && motionValid;
    });
    if (!valid) return null;
    return {
      title: parsed.title,
      duration: parsed.duration,
      visualBible: parsed.visualBible,
      shots: parsed.shots.map((shot, index) => ({ ...shot, ...shotStructure[index] })),
    } as ModelGeneration;
  } catch {
    return null;
  }
}

async function makeGeneration({ brandProduct, audience, proposition, platform, visualTones, selectedConcept }: { brandProduct: string; audience: string; proposition: string; platform: string; visualTones: string[]; selectedConcept: Concept }) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: "gpt-5-mini",
    input: `You are the storyboard director of an elite advertising studio. Develop the approved creative concept into one coherent, shoot-ready 30-second advertisement.

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

Generate exactly 6 shots using this narrative structure:

Shot 1 — HOOK — 0–3 seconds
Shot 2 — TENSION — 3–7 seconds
Shot 3 — PRODUCT — 7–12 seconds
Shot 4 — PROOF / ESCALATION — 12–18 seconds
Shot 5 — PAYOFF — 18–25 seconds
Shot 6 — BRAND ENDING — 25–30 seconds

CONTINUITY RULES
- All six shots must feel like scenes from one commercial, not six disconnected images.
- Preserve the same character where applicable, including physical description and age.
- Preserve the same wardrobe, product appearance, location logic, visual palette, and cinematic style.
- Make the narrative action progress clearly from shot to shot.
- Keep the approved concept fixed. Do not replace it with a new idea.
- Make the single-minded proposition impossible to miss through visual storytelling.
- Keep voiceover or dialogue natural and deliverable within each shot's timing.
- Adapt framing and composition to the selected platform.

VISUAL BIBLE
- Generate one shared Visual Bible before defining the shots.
- Subject must lock exact appearance, approximate age, wardrobe, styling, hair, and distinguishing characteristics.
- Product must lock exact materials, shape, proportions, finish, surface texture, and defining visual features.
- Location must lock the environment, architecture, surfaces, props, and background details.
- Use no more than four dominant colors.
- Lighting must define source, direction, softness, contrast, time of day, and practical lights.
- Cinematography must define camera character, lens family, depth of field, framing philosophy, and movement style.
- Texture must define skin, fabric, material, atmosphere, and film character.
- Continuity locks must explicitly list everything that cannot change across the six shots.
- Avoid plastic skin, inconsistent faces, random background objects, unnecessary neon, excessive bokeh, inconsistent wardrobe, inconsistent product shape, warped jewellery or products, and text inside images.

BRAND BIBLE AND CREATIVE GRAMMAR
- Derive a compact Brand Bible only from this brief and approved concept. Never invent official colours, logos, packaging, mascots, claims, legal rules, or established brand behaviour; use empty arrays when unavailable.
- Identify the audience desire, category tension, human truth, product truth, reason to believe, single-minded message and creative opportunity internally.
- Select the most fitting creative archetype. Do not default to premium slow motion.
- Creative Grammar must define how this specific ad communicates: arc, hook, reveal, performance, edit rhythm, camera, copy, humour, audio, brand reveal, CTA and platform behaviour.

SHOT DIRECTION
- displayVisual must be one plain, filmable sentence of roughly 8–20 words.
- displayCamera must be one concise instruction combining framing, lens, and movement, such as "85mm close-up · slow push-in".
- displayAction must be one concise, physical action sentence.
- Keep the detailed production fields complete. The display fields are summaries for a producer, not replacements.
- motionDirection must lock start/end states, blocking positions, movement path, subject/product/camera/environment/focus motion, intensity, performance, gaze and the editable transition beat.
- Camera movement must serve story, emotion, product or reveal. Locked-off is valid. Choose lens character from scene geometry rather than random numbers.
- Direct micro-expression, gaze, gesture, body language and product interaction. Never default to smiling at camera.
- For every shot, locationAndProps must specify only the set dressing and props visible in that frame while staying inside the shared location logic.
- Vary action, framing, angle, lens, and movement so the sequence progresses visually.
- Do not write final image prompts. The application constructs them from the shared Visual Bible and shot direction.

Return only the structured storyboard.`,
    text: { format: { type: "json_schema", name: "concept_led_storyboard", strict: true, schema: outputSchema } },
  });
  const modelGeneration = parseGeneration(response.output_text);
  if (!modelGeneration) return null;
  const sharedPromptContext = {
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

export async function POST(request: Request) {
  let body: StoryboardBrief;
  try { body = (await request.json()) as StoryboardBrief; }
  catch { return NextResponse.json({ error: "The storyboard brief could not be read. Please try again." }, { status: 400 }); }

  const brandProduct = body.brandProduct?.trim();
  const audience = body.audience?.trim();
  const proposition = body.proposition?.trim();
  const platform = body.platform?.trim();
  const visualTones = body.visualTones?.map((tone) => tone.trim()).filter(Boolean);
  const selectedConcept = body.selectedConcept;

  if (!brandProduct || !audience || !proposition || !platform || !visualTones?.length) return NextResponse.json({ error: "Please complete the current creative brief." }, { status: 400 });
  if (!platforms.includes(platform)) return NextResponse.json({ error: "Choose one of the available platforms." }, { status: 400 });
  if (visualTones.length > 3 || visualTones.some((tone) => !visualToneOptions.includes(tone))) return NextResponse.json({ error: "Choose one to three available visual tones." }, { status: 400 });
  if (!isConcept(selectedConcept)) return NextResponse.json({ error: "Choose a complete creative direction before generating the storyboard." }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Add OPENAI_API_KEY before generating the storyboard." }, { status: 500 });

  let generation: Generation | null;
  try { generation = await makeGeneration({ brandProduct, audience, proposition, platform, visualTones, selectedConcept }); }
  catch (error) {
    console.error("OpenAI storyboard generation failed", error);
    const kind = classifyOpenAIError(error);
    if (kind === "rate_limit") return NextResponse.json({ error: "We're receiving too many generation requests. Try again shortly." }, { status: 429 });
    if (kind === "quota" || kind === "configuration") return NextResponse.json({ error: "Storyboard generation is not available for this project right now." }, { status: 503 });
    return NextResponse.json({ error: "We couldn't build the storyboard. Try again." }, { status: 502 });
  }
  if (!generation) return NextResponse.json({ error: "The storyboard came back incomplete. Please generate it again." }, { status: 502 });

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    console.warn("Storyboard generated without persistence: NEXT_PUBLIC_CONVEX_URL is missing");
    return NextResponse.json({ generation, saved: false });
  }
  try {
    const client = new ConvexHttpClient(convexUrl);
    const generationId = await client.mutation(anyApi.generations.save, { brandProduct, audience, proposition, platform, visualTones, selectedConcept: JSON.stringify(selectedConcept), brandBible: JSON.stringify(generation.brandBible), creativeGrammar: JSON.stringify(generation.creativeGrammar), visualBible: JSON.stringify(generation.visualBible), title: generation.title, shotList: JSON.stringify(generation.shots) });
    return NextResponse.json({ generation, generationId, saved: true });
  } catch (error) {
    console.warn("Storyboard generated but Convex persistence failed", error);
    return NextResponse.json({ generation, saved: false });
  }
}
