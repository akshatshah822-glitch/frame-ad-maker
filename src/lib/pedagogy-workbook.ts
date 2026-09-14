import * as XLSX from "xlsx";
import { PedagogyBriefValidationError, pedagogyRequiredColumns, type PedagogyBriefInputRow } from "@/lib/pedagogy-brief";

export function extractPedagogyRowsFromWorkbook(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new PedagogyBriefValidationError("The workbook has no worksheets.");
  const worksheet = workbook.Sheets[sheetName];
  const headerValues = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "", raw: false })[0] ?? [];
  const headers = headerValues.map((header) => typeof header === "string" ? header : String(header ?? ""));
  const missing = pedagogyRequiredColumns.filter((column) => !headers.includes(column));
  if (missing.length) throw new PedagogyBriefValidationError(`The first worksheet is missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: false, blankrows: false });
  return rows.map((row, index) => ({
    sourceRow: index + 2,
    questionId: row.question_id,
    lineNo: row.line_no,
    time: row.time,
    narration: row.sir_ka_vaakya,
    board: row.board,
    emphasis: row.emphasis,
    pauseAfter: row.pause_after,
  } satisfies PedagogyBriefInputRow));
}
