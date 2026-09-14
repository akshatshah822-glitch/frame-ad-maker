import { NextResponse } from "next/server";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";
import { PedagogyBriefValidationError, validatePedagogyRows, type PedagogyBriefInputRow } from "@/lib/pedagogy-brief";
import { PedagogyNarrationMeasurementError } from "@/lib/pedagogy-narration-duration";
import { validateQuestionNarrationGrammar } from "@/lib/question-narration";
import { renderPedagogyVideo } from "@/lib/pedagogy-video";

export const maxDuration = 900;
export const runtime = "nodejs";

export function renderValidationFailure(error: PedagogyBriefValidationError) {
  const diagnostic = { error: error.message, code: error.code, sourceRow: error.sourceRow };
  console.error("Pedagogy render validation failed", { code: error.code, sourceRow: error.sourceRow, reason: error.safeReason });
  return NextResponse.json(diagnostic, { status: 422 });
}

function renderMeasurementFailure(error: PedagogyNarrationMeasurementError) {
  const diagnostic = { error: error.message, code: error.code, sourceRow: error.sourceRow };
  console.error("Pedagogy render measurement failed", { code: error.code, sourceRow: error.sourceRow, reason: error.safeReason });
  return NextResponse.json(diagnostic, { status: 422 });
}

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
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Pedagogy narration audio and grammar review are not configured.", code: "PEDAGOGY_SERVICE_UNAVAILABLE", sourceRow: null }, { status: 503 });
  try {
    const body = await request.json().catch(() => null) as { rows?: unknown } | null;
    const rows = validatePedagogyRows(suppliedRows(body?.rows));
    const grammarWarnings = [...new Set((await Promise.all(rows.map(async (row) => {
      const review = await validateQuestionNarrationGrammar(row.narration);
      return review.passes ? [] : review.issues.map((issue) => `Row ${row.sourceRow}: grammar warning: ${issue}`);
    }))).flat())];
    if (grammarWarnings.length) console.warn("Pedagogy grammar warnings", { count: grammarWarnings.length });
    const result = await renderPedagogyVideo(rows);
    return new NextResponse(result.bytes, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": "inline; filename=frame-pedagogy-explainer.mp4",
        "X-Frame-Pedagogy-QA": JSON.stringify(result.qa),
      },
    });
  } catch (error) {
    if (error instanceof PedagogyBriefValidationError) return renderValidationFailure(error);
    if (error instanceof PedagogyNarrationMeasurementError) return renderMeasurementFailure(error);
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
