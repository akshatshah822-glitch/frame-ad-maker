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
    questionText: row.question_text,
    optionA: row.option_a,
    optionB: row.option_b,
    optionC: row.option_c,
    optionD: row.option_d,
    optionE: row.option_e,
    layout: row.layout,
    working: row.working,
    arcs: row.arcs,
    result: row.result,
    diagram: row.diagram,
    diagramStep: row.diagram_step,
    diagramLabels: row.diagram_labels,
    diagramItems: row.diagram_items,
    visual: row.visual,
    visualData: row.visual_data,
    problem: row.problem,
    steps: row.steps,
    draw: row.draw,
    theme: row.theme,
    orientation: row.orientation,
    card: row.card,
    trap: row.trap,
    trick: row.trick,
    remember: row.remember,
    gsTheme: row.gs_theme,
    camera: row.camera,
    anchoredLabels: row.anchored_labels,
    effects: row.effects,
    caption: row.caption,
    sourceTs: row.source_ts,
    badge: row.badge,
    chapter: row.chapter,
    note: row.note,
    notes: row.notes,
    notesTitle: row.notes_title,
    scene: row.scene,
    sceneTitle: row.scene_title,
    sceneItems: row.scene_items,
    chapterCard: row.chapter_card,
  } satisfies PedagogyBriefInputRow));
}
