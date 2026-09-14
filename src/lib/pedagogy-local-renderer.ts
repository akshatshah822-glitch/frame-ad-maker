import { lstat, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join } from "node:path";
import { PedagogyBriefValidationError, type PedagogyRow } from "@/lib/pedagogy-brief";
import { PedagogyGrammarReviewError, reviewPedagogyNarration } from "@/lib/pedagogy-narration";
import { PedagogyNarrationMeasurementError } from "@/lib/pedagogy-narration-duration";
import { PedagogySlideRenderError, renderPedagogyVideoToFile } from "@/lib/pedagogy-video";
import { extractPedagogyRowsFromWorkbook } from "@/lib/pedagogy-workbook";
import { validatePedagogyRows } from "@/lib/pedagogy-brief";

export type LocalPedagogyRenderArgs = { inputPath: string; outputPath: string };
export type LocalPedagogyRenderResult = {
  outputPath: string;
  auditPath: string;
  temporaryDirectory: string;
  rowCount: number;
  grammarWarningCount: number;
  timingAudit: Awaited<ReturnType<typeof renderPedagogyVideoToFile>>["qa"]["timingAudit"];
  qa: Awaited<ReturnType<typeof renderPedagogyVideoToFile>>["qa"];
  narrationEqual: boolean;
  boardEqual: boolean;
};

function absolutePath(value: string | undefined, label: "input" | "output") {
  if (!value) throw new Error(`Missing required --${label} absolute path.`);
  if (!isAbsolute(value)) throw new Error(`--${label} must be an absolute path.`);
  return value;
}

export function parseLocalPedagogyRenderArgs(argv: string[]): LocalPedagogyRenderArgs {
  if (argv.length !== 4) throw new Error("Use exactly: --input /absolute/path/to/file.xlsx --output /absolute/path/to/output.mp4");
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if ((flag !== "--input" && flag !== "--output") || values.has(flag) || !value) {
      throw new Error("Use exactly: --input /absolute/path/to/file.xlsx --output /absolute/path/to/output.mp4");
    }
    values.set(flag, value);
  }
  const inputPath = absolutePath(values.get("--input"), "input");
  const outputPath = absolutePath(values.get("--output"), "output");
  if (extname(inputPath).toLowerCase() !== ".xlsx") throw new Error("--input must point to an .xlsx file.");
  if (extname(outputPath).toLowerCase() !== ".mp4") throw new Error("--output must end with .mp4.");
  return { inputPath, outputPath };
}

export function pedagogyTimingAuditPath(outputPath: string) {
  return `${outputPath}.timing-audit.csv`;
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function boardChangeStatus(rows: PedagogyRow[], index: number) {
  const row = rows[index];
  const previousBoard = index === 0 ? "" : rows[index - 1].effectiveBoard;
  if (!row.board.trim()) return "retained";
  return row.effectiveBoard === previousBoard ? "unchanged" : "changed";
}

export function createPedagogyTimingAuditCsv(
  rows: PedagogyRow[],
  audit: LocalPedagogyRenderResult["timingAudit"],
) {
  const header = [
    "source row",
    "source timestamp",
    "original video start",
    "adjusted video start",
    "original available duration",
    "measured narration duration",
    "allocated duration",
    "added duration",
    "board-change status",
  ];
  const lines = audit.map((entry, index) => [
    entry.sourceRow,
    entry.sourceTime,
    entry.originalGeneratedTime.toFixed(6),
    entry.adjustedGeneratedTime.toFixed(6),
    entry.originalAvailableDuration === null ? null : entry.originalAvailableDuration.toFixed(6),
    entry.narrationDuration.toFixed(6),
    entry.allocatedDuration.toFixed(6),
    entry.addedDuration.toFixed(6),
    boardChangeStatus(rows, index),
  ].map(csvCell).join(","));
  return `${header.map(csvCell).join(",")}\n${lines.join("\n")}\n`;
}

async function assertReadableInput(inputPath: string) {
  let inputStats: Awaited<ReturnType<typeof stat>>;
  try {
    inputStats = await stat(inputPath);
  } catch {
    throw new Error(`Input spreadsheet does not exist or cannot be read: ${inputPath}`);
  }
  if (!inputStats.isFile()) throw new Error(`Input spreadsheet is not a file: ${inputPath}`);
}

async function assertAbsent(path: string, label: string) {
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new Error(`Cannot inspect ${label}: ${path}`);
  }
  throw new Error(`${label} already exists and will not be overwritten: ${path}`);
}

function equalImportedText(rows: PedagogyRow[], inputs: ReturnType<typeof extractPedagogyRowsFromWorkbook>, field: "narration" | "board") {
  const originalByRow = new Map(inputs.map((row) => [row.sourceRow, String(row[field] ?? "")]));
  return rows.every((row) => originalByRow.get(row.sourceRow) === row[field]);
}

export async function renderPedagogyBriefLocally(
  args: LocalPedagogyRenderArgs,
  onProgress: (line: string) => void = console.log,
): Promise<LocalPedagogyRenderResult> {
  await assertReadableInput(args.inputPath);
  const outputDirectory = dirname(args.outputPath);
  let outputDirectoryStats: Awaited<ReturnType<typeof stat>>;
  try {
    outputDirectoryStats = await stat(outputDirectory);
  } catch {
    throw new Error(`Output directory does not exist: ${outputDirectory}`);
  }
  if (!outputDirectoryStats.isDirectory()) throw new Error(`Output parent is not a directory: ${outputDirectory}`);

  const auditPath = pedagogyTimingAuditPath(args.outputPath);
  await assertAbsent(args.outputPath, "Output MP4");
  await assertAbsent(auditPath, "Timing audit CSV");

  let temporaryDirectory: string | null = null;
  try {
    onProgress("Parsing spreadsheet");
    const file = await readFile(args.inputPath);
    const importedRows = extractPedagogyRowsFromWorkbook(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
    const rows = validatePedagogyRows(importedRows);
    const narrationEqual = equalImportedText(rows, importedRows, "narration");
    const boardEqual = equalImportedText(rows, importedRows, "board");
    if (!narrationEqual || !boardEqual) throw new Error("Imported pedagogy text changed before local rendering.");

    onProgress(`Reviewing grammar: 0/${rows.length}`);
    const grammarWarnings = [...new Set(await reviewPedagogyNarration(rows, undefined, ({ completed, total }) => {
      onProgress(`Reviewing grammar: ${completed}/${total}`);
    }))];

    temporaryDirectory = await mkdtemp(join(outputDirectory, `.frame-pedagogy-${basename(args.outputPath, ".mp4")}-`));
    const temporaryVideoPath = join(temporaryDirectory, "pedagogy-explainer.mp4");
    const render = await renderPedagogyVideoToFile(rows, {
      directory: temporaryDirectory,
      outputPath: temporaryVideoPath,
      onProgress: (progress) => {
        if (progress.phase === "generating-narration") onProgress(`Generating narration: ${progress.completed}/${progress.total}`);
        if (progress.phase === "building-timeline") onProgress("Building adjusted timeline");
        if (progress.phase === "rendering-slides") onProgress(`Rendering slides: ${progress.completed}/${progress.total}`);
        if (progress.phase === "assembling-mp4") onProgress("Assembling MP4");
      },
    });
    const auditCsv = createPedagogyTimingAuditCsv(rows, render.qa.timingAudit);
    const temporaryAuditPath = join(temporaryDirectory, "timing-audit.csv");
    await writeFile(temporaryAuditPath, auditCsv, "utf8");
    await rename(temporaryVideoPath, args.outputPath);
    await rename(temporaryAuditPath, auditPath);

    const overflowCountBeforeAdjustment = render.qa.timingAudit.filter((entry) => entry.originalAvailableDuration !== null && entry.narrationDuration + 0.5 > entry.originalAvailableDuration).length;
    const overlapCount = render.qa.timingAudit.slice(0, -1).filter((entry, index) => entry.adjustedGeneratedTime + entry.allocatedDuration > render.qa.timingAudit[index + 1].adjustedGeneratedTime + 0.000001).length;
    const rowSummary = (sourceRow: number) => render.qa.timingAudit.find((entry) => entry.sourceRow === sourceRow);
    const finalAuditRow = render.qa.timingAudit.at(-1);
    const finalEnd = finalAuditRow ? finalAuditRow.adjustedGeneratedTime + finalAuditRow.allocatedDuration : 0;
    onProgress(`Timing summary: rows=${rows.length}; short-slots-extended=${overflowCountBeforeAdjustment}; overlaps=${overlapCount}; final-end=${finalEnd}`);
    onProgress(`Row 3 timing: ${JSON.stringify(rowSummary(3))}`);
    onProgress(`Row 8 timing: ${JSON.stringify(rowSummary(8))}`);
    onProgress(`Narration equality: ${narrationEqual ? "PASS" : "FAIL"} (${rows.length}/${rows.length} character-for-character)`);
    onProgress(`Board equality: ${boardEqual ? "PASS" : "FAIL"} (${rows.length}/${rows.length} character-for-character)`);
    onProgress(`Grammar warnings: ${grammarWarnings.length} unique, non-blocking`);

    const successfulTemporaryDirectory = temporaryDirectory;
    await rm(temporaryDirectory, { recursive: true, force: false });
    temporaryDirectory = null;
    return {
      outputPath: args.outputPath,
      auditPath,
      temporaryDirectory: successfulTemporaryDirectory,
      rowCount: rows.length,
      grammarWarningCount: grammarWarnings.length,
      timingAudit: render.qa.timingAudit,
      qa: render.qa,
      narrationEqual,
      boardEqual,
    };
  } catch (error) {
    if (temporaryDirectory) onProgress(`Local render failed. Temporary files kept at: ${temporaryDirectory}`);
    throw error;
  }
}

export function localPedagogyErrorMessage(error: unknown) {
  if (error instanceof PedagogyBriefValidationError || error instanceof PedagogyNarrationMeasurementError || error instanceof PedagogyGrammarReviewError || error instanceof PedagogySlideRenderError) {
    const row = error.sourceRow === null ? "" : ` Row ${error.sourceRow}.`;
    return `${error.code}.${row} ${error.message}`.trim();
  }
  return error instanceof Error ? error.message : "Local pedagogy render failed.";
}
