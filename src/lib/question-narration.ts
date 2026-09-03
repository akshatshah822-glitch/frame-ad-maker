import OpenAI from "openai";

type GrammarErrorType = "missing subject" | "missing verb" | "run-on sentence" | "comma splice" | "repeated phrase";
type GrammarIssue = { sentence: string; errorType: GrammarErrorType };
type ModelGrammarReview = { passes: boolean; issues: GrammarIssue[] };
type GrammarReview = { passes: boolean; issues: string[] };

const grammarErrorTypes: GrammarErrorType[] = ["missing subject", "missing verb", "run-on sentence", "comma splice", "repeated phrase"];

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["passes", "issues"],
  properties: {
    passes: { type: "boolean" },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sentence", "errorType"],
        properties: {
          sentence: { type: "string" },
          errorType: { type: "string", enum: grammarErrorTypes },
        },
      },
    },
  },
} as const;

export async function validateQuestionNarrationGrammar(script: string): Promise<GrammarReview> {
  const narration = script.trim();
  if (!narration) return { passes: false, issues: ["Narration is empty."] };
  const response = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 50_000, maxRetries: 1 }).responses.create({
    model: "gpt-4.1-mini",
    instructions: `Check only whether each sentence has one of these grammatical errors:
- missing subject
- missing verb
- run-on sentence
- comma splice
- repeated phrase, such as "because ... because"

Do not evaluate style, tone, length, density, clarity, word choice, repetition of a single connective across different sentences, or how natural the prose sounds. A suggestion such as "slightly awkward", "might feel long", "consider rephrasing", "could be smoother", or preferring one correct word over another is not a grammatical error and must never create an issue.

Return passes false only when at least one exact sentence contains one of the five allowed error types. For every issue, copy the full offending sentence exactly into sentence and choose its specific errorType. Do not fact-check, rewrite, or suggest improvements. Return passes true with an empty issues array when none of those five errors is present.`,
    input: narration,
    text: { format: { type: "json_schema", name: "question_narration_grammar", strict: true, schema: reviewSchema } },
  });
  try {
    const review = JSON.parse(response.output_text) as ModelGrammarReview;
    if (typeof review.passes !== "boolean" || !Array.isArray(review.issues) || review.issues.some((issue) => !issue || typeof issue.sentence !== "string" || !grammarErrorTypes.includes(issue.errorType))) throw new Error("Malformed review");
    if (review.passes !== (review.issues.length === 0)) throw new Error("Malformed review");
    return { passes: review.passes, issues: review.issues.map(({ sentence, errorType }) => `Sentence ${JSON.stringify(sentence)}: ${errorType}.`) };
  } catch {
    throw new Error("Question narration grammar review returned an unreadable result.");
  }
}
