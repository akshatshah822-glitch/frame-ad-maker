import { NextResponse } from "next/server";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";
import { PedagogyBriefValidationError, pedagogyWarnings, validatePedagogyRows } from "@/lib/pedagogy-brief";
import { PedagogyGrammarReviewError, reviewPedagogyNarration } from "@/lib/pedagogy-narration";
import { createPedagogyNarrationTracks, validatePedagogyNarrationTiming } from "@/lib/pedagogy-narration-duration";
import { extractPedagogyRowsFromWorkbook } from "@/lib/pedagogy-workbook";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const maxDuration = 300;
export const runtime = "nodejs";

function worksheetRows(file: File) {
  return file.arrayBuffer().then(extractPedagogyRowsFromWorkbook);
}

const post = async (request: Request) => {
  const formData = await request.formData();
  const file = formData.get("brief");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: "Choose an .xlsx pedagogy brief." }, { status: 400 });
  try {
    const rows = validatePedagogyRows(await worksheetRows(file));
    const grammarWarnings = await reviewPedagogyNarration(rows);
    const directory = await mkdtemp(join(tmpdir(), "frame-pedagogy-preview-"));
    try {
      const { narrationDurations } = await createPedagogyNarrationTracks(rows, directory);
      validatePedagogyNarrationTiming(rows, narrationDurations);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    const warnings = pedagogyWarnings(rows);
    warnings.forEach((warning) => console.warn("Pedagogy brief warning", warning));
    grammarWarnings.forEach((warning) => console.warn("Pedagogy grammar warning", warning));
    return NextResponse.json({ rows, warnings, grammarWarnings });
  } catch (error) {
    if (error instanceof PedagogyBriefValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof PedagogyGrammarReviewError) return NextResponse.json({ error: error.message }, { status: 502 });
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
