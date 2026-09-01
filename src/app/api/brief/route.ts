import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { Brief } from "@/lib/types";
import { classifyOpenAIError } from "@/lib/openai-error";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";

export const maxDuration = 60;

const platforms = ["Instagram / Reels", "Meta Ads", "YouTube", "TV / OTT"] as const;
const visualTones = ["Cinematic", "Luxury", "Raw", "Playful", "Emotional", "Bold", "Minimal", "Surreal"] as const;
const testObjectives = ["New Hook", "New Pitch", "Creative Fatigue", "Product Proof", "Offer", "New Audience", "Other"] as const;

const briefSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "brandProduct", "audience", "proposition", "platform", "visualTones", "testObjective", "testObjectiveOther", "preserveDetails"],
  properties: {
    intent: { type: "string", enum: ["performance", "cinematic"] },
    brandProduct: { type: "string" }, audience: { type: "string" }, proposition: { type: "string" },
    platform: { type: "string", enum: platforms },
    visualTones: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", enum: visualTones } },
    testObjective: { type: "string", enum: testObjectives }, testObjectiveOther: { type: "string" }, preserveDetails: { type: "string" },
  },
} as const;

function parseBrief(output: string): Brief | null {
  try {
    const value = JSON.parse(output) as Record<string, unknown>;
    const intent = value.intent === "cinematic" ? "cinematic" : value.intent === "performance" ? "performance" : null;
    const brandProduct = String(value.brandProduct ?? "").trim();
    const audience = String(value.audience ?? "").trim();
    const proposition = String(value.proposition ?? "").trim();
    const platform = String(value.platform ?? "").trim();
    const tones = Array.isArray(value.visualTones) ? value.visualTones.map((tone) => String(tone).trim()) : [];
    const testObjective = String(value.testObjective ?? "").trim();
    const testObjectiveOther = String(value.testObjectiveOther ?? "").trim();
    const preserveDetails = String(value.preserveDetails ?? "").trim();
    if (!intent || !brandProduct || !audience || !proposition || !platforms.includes(platform as typeof platforms[number])) return null;
    if (!tones.length || tones.length > 3 || new Set(tones).size !== tones.length || tones.some((tone) => !visualTones.includes(tone as typeof visualTones[number]))) return null;
    if (!testObjectives.includes(testObjective as typeof testObjectives[number]) || (testObjective === "Other" && !testObjectiveOther)) return null;
    return { intent, brandProduct, audience, proposition, platform, visualTones: tones, testObjective, testObjectiveOther, preserveDetails };
  } catch { return null; }
}

const post = async (request: Request) => {
  const body = await request.json().catch(() => null) as { topic?: unknown } | null;
  const topic = String(body?.topic ?? "").trim();
  if (topic.length < 3) return NextResponse.json({ error: "Describe the topic or product in at least three characters." }, { status: 400 });
  if (topic.length > 240) return NextResponse.json({ error: "Keep the topic or product idea under 240 characters." }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Brief generation is not configured." }, { status: 503 });
  try {
    const response = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 50_000, maxRetries: 1 }).responses.create({
      model: "gpt-4.1-mini",
      instructions: `You turn a one-line topic or product idea into a concise creative brief for a 30-second film.

Return exactly the supplied schema and never add fields.

Choose intent "performance" only when the input clearly names a product, brand, service, offer or campaign that should persuade an audience. Choose "cinematic" for a historical event, social subject, person, place, theme or story idea.

brandProduct must clearly state what is being advertised or what story is being told. audience must name a specific likely viewer. proposition must contain one memorable takeaway, not several messages. Choose one supported platform and one to three supported visual tones. For cinematic briefs, use "New Hook" for testObjective, an empty testObjectiveOther, and use preserveDetails for factual, cultural, character or setting details that must remain respectful and accurate. For performance briefs, choose the most useful supported testObjective and use preserveDetails only when continuity is genuinely required.

Do not invent product specifications, prices, performance results, certifications, customer evidence, historical quotations or disputed facts. Use neutral wording when the one-line input does not supply proof. Keep every field ready for the user to edit before continuing.`,
      input: `ONE-LINE TOPIC OR PRODUCT IDEA\n${topic}`,
      text: { format: { type: "json_schema", name: "creative_brief", strict: true, schema: briefSchema } },
    });
    const brief = parseBrief(response.output_text);
    if (!brief) {
      console.error("Brief generation returned malformed output");
      return NextResponse.json({ error: "The generated brief came back incomplete. Try again." }, { status: 502 });
    }
    return NextResponse.json({ brief });
  } catch (error) {
    console.error("OpenAI brief generation failed", error);
    const kind = classifyOpenAIError(error);
    const message = kind === "rate_limit" ? "Brief generation is busy. Try again shortly." : kind === "quota" || kind === "configuration" ? "Brief generation is not available right now." : "The brief could not be generated. Try again.";
    return NextResponse.json({ error: message }, { status: kind === "rate_limit" ? 429 : kind === "quota" || kind === "configuration" ? 503 : 502 });
  }
};

export const POST = withJsonErrors(post);
export const GET = methodNotAllowed(["POST"]);
export const HEAD = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const OPTIONS = methodNotAllowed(["POST"]);
