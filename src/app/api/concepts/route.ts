import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { Concept } from "@/lib/types";
import { supportedPlatforms } from "@/lib/image-prompt";
import { classifyOpenAIError } from "@/lib/openai-error";

type ConceptBrief = {
  brandProduct?: string;
  audience?: string;
  proposition?: string;
  visualTones?: string[];
  platform?: string;
};

const conceptFields = ["conceptName", "idea", "hook", "story", "productRole", "visualWorld", "ending"] as const;
const visualToneOptions = ["Cinematic", "Luxury", "Raw", "Playful", "Emotional", "Bold", "Minimal", "Surreal"];

const conceptsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["concepts"],
  properties: {
    concepts: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: conceptFields,
        properties: {
          conceptName: { type: "string" },
          idea: { type: "string" },
          hook: { type: "string" },
          story: { type: "string" },
          productRole: { type: "string" },
          visualWorld: { type: "string" },
          ending: { type: "string" },
        },
      },
    },
  },
} as const;

function isConcept(value: unknown): value is Concept {
  if (!value || typeof value !== "object") return false;
  const concept = value as Record<string, unknown>;
  return conceptFields.every((field) => typeof concept[field] === "string" && concept[field].trim().length > 0)
    && (concept.conceptName as string).trim().split(/\s+/).length <= 5;
}

function parseConcepts(outputText: string): Concept[] | null {
  try {
    const parsed = JSON.parse(outputText) as { concepts?: unknown };
    if (!Array.isArray(parsed.concepts) || parsed.concepts.length !== 3 || !parsed.concepts.every(isConcept)) return null;
    return parsed.concepts;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: ConceptBrief;
  try {
    body = (await request.json()) as ConceptBrief;
  } catch {
    return NextResponse.json({ error: "The creative brief could not be read. Please try again." }, { status: 400 });
  }

  const brandProduct = body.brandProduct?.trim();
  const audience = body.audience?.trim();
  const proposition = body.proposition?.trim();
  const platform = body.platform?.trim();
  const visualTones = body.visualTones?.map((tone) => tone.trim()).filter(Boolean);

  if (!brandProduct || !audience || !proposition || !platform || !visualTones?.length) {
    return NextResponse.json({ error: "Please complete the brief before generating concepts." }, { status: 400 });
  }
  if (visualTones.length > 3) {
    return NextResponse.json({ error: "Choose no more than three visual tones." }, { status: 400 });
  }
  if (!supportedPlatforms.includes(platform) || visualTones.some((tone) => !visualToneOptions.includes(tone))) {
    return NextResponse.json({ error: "Choose the available platform and visual tone options." }, { status: 400 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Add OPENAI_API_KEY before generating concepts." }, { status: 500 });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let response;
  try {
    response = await client.responses.create({
      model: "gpt-5-mini",
      instructions: `You are the Creative Director of an elite advertising studio.

Your job is NOT to immediately write an advertisement.

Your job is to find a simple, memorable creative idea that dramatizes the product truth.

STEP 1 — FIND THE HUMAN TENSION

Identify internally:
- What does this audience want?
- What frustrates them about the category?
- What emotional or functional tension exists?
- What product truth resolves that tension?

STEP 2 — CREATE EXACTLY 3 DISTINCT AD IDEAS

Concept 1: Human / Emotional
Concept 2: Product / Craft-led
Concept 3: Unexpected / Conceptual

For each concept:
- conceptName is a maximum of 5 words.
- idea is one sentence explaining the central creative device.
- hook describes what happens visually in the first 2 seconds.
- story is a 30-second narrative described in 3–5 concise sentences.
- productRole explains why the product is essential to the story.
- visualWorld describes location, production design, wardrobe, lighting, texture, and cinematic language.
- ending is the final emotional or visual payoff.

RULES

The three concepts must be fundamentally different.

They must not reuse the same central device, setting, opening-hook mechanism, narrative arc, or product demonstration with cosmetic changes. If two ideas could be described by the same one-sentence device, replace the weaker one before responding.

Avoid generic lifestyle advertising, a smiling model holding the product, meaningless slow motion, generic luxury imagery, floating products, random metaphors, unnecessary text overlays, and exposition-heavy voiceover.

Prioritize visual storytelling. Each concept should still largely work with sound off. Every concept must make the single-minded proposition impossible to miss. Do not create a script, shot list, storyboard, or images.`,
      input: `INPUT
Brand/Product: ${brandProduct}
Audience: ${audience}
Single-minded proposition: ${proposition}
Desired tone: ${visualTones.join(", ")}
Platform: ${platform}`,
      text: { format: { type: "json_schema", name: "creative_concepts", strict: true, schema: conceptsSchema } },
    });
  } catch (error) {
    console.error("OpenAI concept generation failed", error);
    const kind = classifyOpenAIError(error);
    if (kind === "rate_limit") return NextResponse.json({ error: "We're receiving too many generation requests. Try again shortly." }, { status: 429 });
    if (kind === "quota" || kind === "configuration") return NextResponse.json({ error: "Concept generation is not available for this project right now." }, { status: 503 });
    return NextResponse.json({ error: "We couldn't develop the concepts. Try again." }, { status: 502 });
  }

  const concepts = parseConcepts(response.output_text);
  if (!concepts) {
    console.error("OpenAI concept generation returned malformed output");
    return NextResponse.json({ error: "The concepts came back incomplete. Please generate them again." }, { status: 502 });
  }

  return NextResponse.json({ concepts });
}
