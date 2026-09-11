import { NextResponse } from "next/server";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";
import { PedagogyBriefValidationError, pedagogyWarnings, validatePedagogyRows } from "@/lib/pedagogy-brief";
import { extractPedagogyRowsFromWorkbook } from "@/lib/pedagogy-workbook";
import { validateQuestionNarrationGrammar } from "@/lib/question-narration";

export const maxDuration = 300;
export const runtime = "nodejs";

function worksheetRows(file: File) {
  return file.arrayBuffer().then(extractPedagogyRowsFromWorkbook);
}

const post = async (request: Request) => {
  const formData = await request.formData();
  const file = formData.get("brief");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: "Choose an .xlsx pedagogy brief." }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Pedagogy narration grammar review is not configured." }, { status: 503 });
  try {
    const rows = validatePedagogyRows(await worksheetRows(file));
    const grammarWarnings = (await Promise.all(rows.map(async (row) => {
      const review = await validateQuestionNarrationGrammar(row.narration);
      return review.passes ? [] : review.issues.map((issue) => `Row ${row.sourceRow}: grammar warning: ${issue}`);
    }))).flat();
    const warnings = pedagogyWarnings(rows);
    warnings.forEach((warning) => console.warn("Pedagogy brief warning", warning));
    grammarWarnings.forEach((warning) => console.warn("Pedagogy grammar warning", warning));
    return NextResponse.json({ rows, warnings, grammarWarnings });
  } catch (error) {
    if (error instanceof PedagogyBriefValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
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
