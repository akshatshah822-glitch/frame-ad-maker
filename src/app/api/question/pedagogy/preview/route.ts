import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";
import { buildAdjustedPedagogyTimeline, PedagogyBriefValidationError, pedagogyWarnings, validatePedagogyRows, type PedagogyRow } from "@/lib/pedagogy-brief";
import { PedagogyGrammarReviewError, reviewPedagogyNarration } from "@/lib/pedagogy-narration";
import { createPedagogyNarrationTracks, PedagogyNarrationMeasurementError } from "@/lib/pedagogy-narration-duration";
import { encodePedagogyPreviewEvent } from "@/lib/pedagogy-preview-stream";
import { extractPedagogyRowsFromWorkbook } from "@/lib/pedagogy-workbook";

export const maxDuration = 300;
export const runtime = "nodejs";

function worksheetRows(file: File) {
  return file.arrayBuffer().then(extractPedagogyRowsFromWorkbook);
}

function previewDiagnostic(error: unknown) {
  if (error instanceof PedagogyBriefValidationError) return { error: error.message, code: error.code, sourceRow: error.sourceRow, reason: error.safeReason };
  if (error instanceof PedagogyNarrationMeasurementError) return { error: error.message, code: error.code, sourceRow: error.sourceRow, reason: error.safeReason };
  if (error instanceof PedagogyGrammarReviewError) return { error: error.message, code: "GRAMMAR_REVIEW_FAILED", sourceRow: null, reason: "Grammar review service failed." };
  return { error: "Pedagogy preview could not measure narration timing.", code: "PEDAGOGY_PREVIEW_FAILED", sourceRow: null, reason: "Pedagogy preview measurement failed." };
}

function logPreviewDiagnostic(diagnostic: ReturnType<typeof previewDiagnostic>) {
  console.error("Pedagogy preview failed", { code: diagnostic.code, sourceRow: diagnostic.sourceRow, reason: diagnostic.reason });
}

function streamPreview(rows: PedagogyRow[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Parameters<typeof encodePedagogyPreviewEvent>[0]) => controller.enqueue(encoder.encode(encodePedagogyPreviewEvent(event)));
      try {
        send({ type: "progress", phase: "checking-grammar", completed: 0, total: rows.length });
        const grammarWarnings = [...new Set(await reviewPedagogyNarration(rows))];
        const directory = await mkdtemp(join(tmpdir(), "frame-pedagogy-preview-"));
        let narrationDurations: number[];
        try {
          ({ narrationDurations } = await createPedagogyNarrationTracks(rows, directory, ({ completed, total }) => {
            send({ type: "progress", phase: "measuring-narration", completed, total });
          }));
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
        send({ type: "progress", phase: "building-timeline", completed: rows.length, total: rows.length });
        const timeline = buildAdjustedPedagogyTimeline(rows, narrationDurations!);
        const warnings = [...new Set(pedagogyWarnings(rows))];
        if (warnings.length) console.warn("Pedagogy brief warnings", { count: warnings.length });
        if (grammarWarnings.length) console.warn("Pedagogy grammar warnings", { count: grammarWarnings.length });
        send({ type: "result", result: { rows, warnings, grammarWarnings, timingAudit: timeline.audit } });
      } catch (error) {
        const diagnostic = previewDiagnostic(error);
        logPreviewDiagnostic(diagnostic);
        send({ type: "error", error: diagnostic.error, code: diagnostic.code, sourceRow: diagnostic.sourceRow });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

const post = async (request: Request) => {
  const formData = await request.formData();
  const file = formData.get("brief");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) {
    const diagnostic = { error: "Choose an .xlsx pedagogy brief.", code: "PEDAGOGY_BRIEF_VALIDATION", sourceRow: null, reason: "A .xlsx pedagogy brief is required." };
    logPreviewDiagnostic(diagnostic);
    return NextResponse.json(diagnostic, { status: 400 });
  }
  try {
    return streamPreview(validatePedagogyRows(await worksheetRows(file)));
  } catch (error) {
    const diagnostic = previewDiagnostic(error);
    logPreviewDiagnostic(diagnostic);
    return NextResponse.json(diagnostic, { status: 400 });
  }
};

export const POST = withJsonErrors(post);
export const GET = methodNotAllowed(["POST"]);
export const HEAD = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const OPTIONS = methodNotAllowed(["POST"]);
