import { NextResponse } from "next/server";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";
import { PedagogyBriefValidationError, validatePedagogyRows, type PedagogyBriefInputRow } from "@/lib/pedagogy-brief";
import { validateQuestionNarrationGrammar } from "@/lib/question-narration";
import { renderPedagogyVideo } from "@/lib/pedagogy-video";

export const maxDuration = 300;
export const runtime = "nodejs";

function suppliedRows(value: unknown): PedagogyBriefInputRow[] {
  if (!Array.isArray(value)) throw new PedagogyBriefValidationError("A reviewed pedagogy brief is required.");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new PedagogyBriefValidationError("Each pedagogy row must be an object.");
    const row = entry as Record<string, unknown>;
    return {
      sourceRow: Number(row.sourceRow), questionId: row.questionId, lineNo: row.lineNo, time: row.sourceTime,
      narration: row.narration, board: row.board, emphasis: row.emphasis, pauseAfter: row.pauseAfter,
    };
  });
}

const post = async (request: Request) => {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Pedagogy narration audio and grammar review are not configured." }, { status: 503 });
  try {
    const body = await request.json().catch(() => null) as { rows?: unknown } | null;
    const rows = validatePedagogyRows(suppliedRows(body?.rows));
    const grammarWarnings = (await Promise.all(rows.map(async (row) => {
      const review = await validateQuestionNarrationGrammar(row.narration);
      return review.passes ? [] : review.issues.map((issue) => `Row ${row.sourceRow}: grammar warning: ${issue}`);
    }))).flat();
    grammarWarnings.forEach((warning) => console.warn("Pedagogy grammar warning", warning));
    const result = await renderPedagogyVideo(rows);
    return new NextResponse(result.bytes, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": "inline; filename=frame-pedagogy-explainer.mp4",
        "X-Frame-Pedagogy-QA": JSON.stringify(result.qa),
      },
    });
  } catch (error) {
    if (error instanceof PedagogyBriefValidationError) return NextResponse.json({ error: error.message }, { status: 422 });
    throw error;
  }
};

export const POST = withJsonErrors(post);
export const GET = methodNotAllowed(["POST"]);
export const HEAD = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const OPTIONS = methodNotAllowed(["POST"]);
