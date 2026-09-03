import OpenAI from "openai";

type GrammarReview = { passes: boolean; issues: string[] };

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["passes", "issues"],
  properties: {
    passes: { type: "boolean" },
    issues: { type: "array", items: { type: "string" } },
  },
} as const;

export async function validateQuestionNarrationGrammar(script: string): Promise<GrammarReview> {
  const narration = script.trim();
  if (!narration) return { passes: false, issues: ["Narration is empty."] };
  const response = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 50_000, maxRetries: 1 }).responses.create({
    model: "gpt-4.1-mini",
    instructions: "Review this exam-question narration for correct grammar, subject-verb agreement, clear references, complete sentences, and natural spoken phrasing. Do not fact-check or rewrite it. Return passes true only when every sentence is grammatical and easy to say aloud. List each exact problem in issues.",
    input: narration,
    text: { format: { type: "json_schema", name: "question_narration_grammar", strict: true, schema: reviewSchema } },
  });
  try {
    const review = JSON.parse(response.output_text) as GrammarReview;
    if (typeof review.passes !== "boolean" || !Array.isArray(review.issues) || review.issues.some((issue) => typeof issue !== "string")) throw new Error("Malformed review");
    return review;
  } catch {
    throw new Error("Question narration grammar review returned an unreadable result.");
  }
}
