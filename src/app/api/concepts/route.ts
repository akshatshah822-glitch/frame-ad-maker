import { NextResponse } from "next/server";
import OpenAI from "openai";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { Concept } from "@/lib/types";
import { supportedPlatforms } from "@/lib/image-prompt";
import { classifyOpenAIError } from "@/lib/openai-error";
import { findUnsupportedProof, neutralizeUnsupportedProof, proofSafetyInstruction } from "@/lib/proof-safety";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";

type ConceptBrief = {
  intent?: string;
  brandProduct?: string;
  audience?: string;
  proposition?: string;
  visualTones?: string[];
  platform?: string;
  testObjective?: string;
  testObjectiveOther?: string;
  preserveDetails?: string;
  runId?: string | number;
};

async function updateRun(runId: string | undefined, action: "ready" | "failed", value: Concept[] | string) {
  if (!runId || !process.env.NEXT_PUBLIC_CONVEX_URL) return;
  try {
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
    if (action === "ready") await convex.mutation(anyApi.runs.directionsReady, { id: runId, concepts: JSON.stringify(value) });
    else await convex.mutation(anyApi.runs.fail, { id: runId, step: "Writing creative directions", error: String(value) });
  } catch (error) {
    console.warn("Run status could not be updated", error);
  }
}

const conceptFields = ["conceptName", "idea", "hook", "story", "productRole", "visualWorld", "ending", "creativeMechanism", "proofMechanism", "whatThisTests", "logline", "humanTruth", "mainCharacter", "centralConflict", "emotionalArc", "coreMessage"] as const;
const visualToneOptions = ["Cinematic", "Luxury", "Raw", "Playful", "Emotional", "Bold", "Minimal", "Surreal"];
const testOptions = ["New Hook", "New Pitch", "Creative Fatigue", "Product Proof", "Offer", "New Audience", "Other"];

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
          creativeMechanism: { type: "string" }, proofMechanism: { type: "string" }, whatThisTests: { type: "string" },
          logline: { type: "string" }, humanTruth: { type: "string" }, mainCharacter: { type: "string" }, centralConflict: { type: "string" }, emotionalArc: { type: "string" }, coreMessage: { type: "string" },
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

const post = async (request: Request) => {
  let body: ConceptBrief;
  try {
    body = (await request.json()) as ConceptBrief;
  } catch {
    return NextResponse.json({ error: "The creative brief could not be read. Please try again." }, { status: 400 });
  }

  const brandProduct = String(body.brandProduct ?? "").trim();
  const intent = body.intent === "cinematic" ? "cinematic" : "performance";
  const audience = String(body.audience ?? "").trim();
  const proposition = String(body.proposition ?? "").trim();
  const platform = String(body.platform ?? "").trim();
  const visualTones = Array.isArray(body.visualTones) ? body.visualTones.map((tone) => String(tone ?? "").trim()).filter(Boolean) : [];
  const testObjective = String(body.testObjective ?? "").trim();
  const testObjectiveOther = String(body.testObjectiveOther ?? "").trim();
  const preserveDetails = String(body.preserveDetails ?? "").trim();
  const runId = String(body.runId ?? "").trim();

  if (!brandProduct || !audience || !proposition || !platform || !visualTones.length) {
    return NextResponse.json({ error: "Please complete the brief before generating concepts." }, { status: 400 });
  }
  if (intent === "performance" && (!testObjective || !testOptions.includes(testObjective) || (testObjective === "Other" && !testObjectiveOther))) {
    return NextResponse.json({ error: "Choose what you want this ad to test." }, { status: 400 });
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
      model: "gpt-4.1-mini",
      instructions: `You are the Creative Director of an elite advertising studio. You use one shared creative engine, adapting strategy to the user's intent.

Your job is NOT to immediately write an advertisement.

Your job is to find a simple, memorable creative idea that dramatizes the product truth.

STEP 1 — FIND THE HUMAN TENSION

Identify internally:
- What does this audience want?
- What frustrates them about the category?
- What emotional or functional tension exists?
- What product truth resolves that tension?

STEP 2 — CREATE EXACTLY 3 DISTINCT IDEAS

The three directions must use genuinely different creative mechanisms, openings, narrative structures, and visual worlds.

For each concept:
- conceptName is a maximum of 5 words.
- idea is one sentence explaining the central creative device.
- hook describes what happens visually in the first 2 seconds.
- story is a 30-second narrative described in 3–5 concise sentences.
- productRole explains why the product is essential to the story.
- visualWorld describes location, production design, wardrobe, lighting, texture, and cinematic language.
- ending is the final emotional or visual payoff.
- creativeMechanism plainly names how the idea works.
- proofMechanism explains what makes the claim believable.
- whatThisTests is one plain sentence describing the hypothesis this direction tests.
- logline, humanTruth, mainCharacter, centralConflict, emotionalArc, and coreMessage describe the cinematic story strategy.

INTENT ROUTING

For PERFORMANCE AD:
- Build all three around the stated test objective, but test it in three meaningfully different ways.
- Each direction must accomplish attention, message, proof, and action in the order best suited to the idea.
- Do not force a fixed six-beat structure.
- whatThisTests must explicitly say what response the direction compares or learns.
- Use "Not applicable" for cinematic-only fields.

For CINEMATIC STORY:
- Derive the human truth, character want, obstacle, conflict, turning point, transformation, payoff, and core message internally.
- Concepts must be visual stories, not performance ads with emotional styling.
- Treat Indian aspirants and small-town or working characters with dignity and specificity. Avoid pity, poverty imagery, melodrama, and generic struggle porn.
- Use "Not applicable" for performance-only fields.

RULES

The three concepts must be fundamentally different.

They must not reuse the same central device, setting, opening mechanism, narrative arc, or demonstration with cosmetic changes. If two ideas could be described by the same one-sentence device, replace the weaker one before responding.

Avoid generic lifestyle advertising, a smiling model holding the product, meaningless slow motion, generic luxury imagery, floating products, random metaphors, unnecessary text overlays, and exposition-heavy voiceover.

${proofSafetyInstruction}

Prioritize visual storytelling. Each concept should still largely work with sound off. Every concept must make the single-minded proposition impossible to miss. Do not create a script, shot list, storyboard, or images.`,
      input: `INPUT
Intent: ${intent === "performance" ? "PERFORMANCE AD" : "CINEMATIC STORY"}
${intent === "performance" ? "Brand/Product" : "Story/Subject"}: ${brandProduct}
Audience: ${audience}
${intent === "performance" ? "Single-minded proposition" : "What they should feel or remember"}: ${proposition}
Desired tone: ${visualTones.join(", ")}
Platform: ${platform}
${intent === "performance" ? `Test objective: ${testObjective === "Other" ? testObjectiveOther : testObjective}` : `Character, setting or cultural detail to preserve: ${preserveDetails || "None supplied"}`}`,
      text: { format: { type: "json_schema", name: "creative_concepts", strict: true, schema: conceptsSchema } },
    });
  } catch (error) {
    console.error("OpenAI concept generation failed", error);
    const kind = classifyOpenAIError(error);
    const message = kind === "rate_limit" ? "We're receiving too many generation requests. Try again shortly." : kind === "quota" || kind === "configuration" ? "Concept generation is not available for this project right now." : "We couldn't develop the concepts. Try again.";
    await updateRun(runId, "failed", message);
    return NextResponse.json({ error: message }, { status: kind === "rate_limit" ? 429 : kind === "quota" || kind === "configuration" ? 503 : 502 });
  }

  const concepts = parseConcepts(response.output_text);
  if (!concepts) {
    console.error("OpenAI concept generation returned malformed output");
    const message = "The concepts came back incomplete. Please generate them again.";
    await updateRun(runId, "failed", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const suppliedSource = [brandProduct, audience, proposition, testObjectiveOther, preserveDetails].filter(Boolean).join("\n");
  const proofIssues = findUnsupportedProof(concepts, suppliedSource);
  if (proofIssues.length) {
    try {
      const repaired = await client.responses.create({
        model: "gpt-4.1-mini",
        instructions: `You are a strict advertising compliance editor. Repair the supplied three concepts without changing their central creative mechanisms or making them less distinct.\n\n${proofSafetyInstruction}`,
        input: `USER-SUPPLIED SOURCE OF TRUTH\n${suppliedSource}\n\nUNSUPPORTED PROOF FOUND\n${proofIssues.join(", ")}\n\nCONCEPTS TO REPAIR\n${JSON.stringify({ concepts })}\n\nReturn all three complete concepts. Replace unsupported evidence with observable product-based proof or neutral phrasing.`,
        text: { format: { type: "json_schema", name: "repaired_creative_concepts", strict: true, schema: conceptsSchema } },
      });
      const repairedConcepts = parseConcepts(repaired.output_text);
      if (!repairedConcepts) {
        console.error("Concept proof-safety repair remained unsafe", proofIssues);
        const message = "We couldn't develop claim-safe concepts from this brief. Add a supported reason to believe or try again.";
        await updateRun(runId, "failed", message);
        return NextResponse.json({ error: message }, { status: 422 });
      }
      const safeConcepts = neutralizeUnsupportedProof(repairedConcepts, suppliedSource);
      if (findUnsupportedProof(safeConcepts, suppliedSource).length) {
        console.error("Concept proof-safety deterministic repair remained unsafe", proofIssues);
        const message = "We couldn't safely verify the proof in these concepts. Try again.";
        await updateRun(runId, "failed", message);
        return NextResponse.json({ error: message }, { status: 422 });
      }
      await updateRun(runId, "ready", safeConcepts);
      return NextResponse.json({ concepts: safeConcepts });
    } catch (error) {
      console.error("Concept proof-safety repair failed", error);
      const message = "We couldn't safely verify the proof in these concepts. Try again.";
      await updateRun(runId, "failed", message);
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  await updateRun(runId, "ready", concepts);
  return NextResponse.json({ concepts });
};

export const POST = withJsonErrors(post);
export const GET = methodNotAllowed(["POST"]);
export const HEAD = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const OPTIONS = methodNotAllowed(["POST"]);
