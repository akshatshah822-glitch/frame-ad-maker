import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { NextResponse } from "next/server";
import { assertSolveMatchesSource, buildQuestionNarration, QuestionValidationError, validateQuestionSolve, validateQuestionSource } from "@/lib/question-generation";
import { validateQuestionNarrationGrammar } from "@/lib/question-narration";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";

export const maxDuration = 60;

const post = async (request: Request) => {
  const body = await request.json().catch(() => null) as { type?: unknown; title?: unknown; solve?: unknown; source?: unknown } | null;
  let solve;
  let source;
  try {
    if (body?.type === "question") {
      source = validateQuestionSource(body.source);
      assertSolveMatchesSource(body.solve, source);
    }
    solve = validateQuestionSolve(body?.type, body?.solve);
  } catch (error) {
    if (error instanceof QuestionValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
  if (!solve || !source) return NextResponse.json({ error: "Invalid type: this route accepts only question generations." }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Question narration grammar review is not configured." }, { status: 503 });
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return NextResponse.json({ error: "Question generation storage is not configured." }, { status: 503 });
  const script = buildQuestionNarration(solve);
  const review = await validateQuestionNarrationGrammar(script);
  if (!review.passes) return NextResponse.json({ error: `Invalid script: grammar review failed. ${review.issues.join(" ")}` }, { status: 422 });
  const suppliedTitle = String(body?.title ?? "").trim();
  const title = suppliedTitle || solve.question.slice(0, 80);
  const generationId = await new ConvexHttpClient(convexUrl).mutation(anyApi.generations.saveQuestion, { title, solve, script, sourceFileName: source.fileName, sourceSlideNumber: source.slideNumber });
  return NextResponse.json({ generationId, type: "question", sourceFileName: source.fileName, sourceSlideNumber: source.slideNumber, solve, script, grammarReview: review }, { status: 201 });
};

export const POST = withJsonErrors(post);
export const GET = methodNotAllowed(["POST"]);
export const HEAD = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const OPTIONS = methodNotAllowed(["POST"]);
