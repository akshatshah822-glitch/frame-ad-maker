export const pedagogyRequiredColumns = ["question_id", "line_no", "time", "sir_ka_vaakya", "board"] as const;

export type PedagogyBriefInputRow = {
  sourceRow: number;
  questionId: unknown;
  lineNo: unknown;
  time: unknown;
  narration: unknown;
  board: unknown;
  emphasis?: unknown;
  pauseAfter?: unknown;
};

export type PedagogyRow = {
  sourceRow: number;
  questionId: string;
  lineNo: number;
  sourceTime: string;
  sourceSeconds: number;
  generatedTime: number;
  generatedTimeLabel: string;
  narration: string;
  board: string;
  effectiveBoard: string;
  emphasis: string;
  pauseAfter: "haan" | "nahi";
};

export class PedagogyBriefValidationError extends Error {
  readonly code: "PEDAGOGY_BRIEF_VALIDATION" | "NARRATION_TIMING_OVERFLOW";
  readonly sourceRow: number | null;
  readonly safeReason: string;

  constructor(message: string, options: { code?: "PEDAGOGY_BRIEF_VALIDATION" | "NARRATION_TIMING_OVERFLOW"; sourceRow?: number; safeReason?: string } = {}) {
    super(message);
    this.name = "PedagogyBriefValidationError";
    this.code = options.code ?? "PEDAGOGY_BRIEF_VALIDATION";
    this.sourceRow = options.sourceRow ?? null;
    this.safeReason = options.safeReason ?? "Pedagogy render validation failed.";
  }
}

function rowError(sourceRow: number, message: string) {
  return new PedagogyBriefValidationError(`Row ${sourceRow}: ${message}`, { sourceRow });
}

function valueAsText(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "");
}

export function formatPedagogyTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function parsePedagogyTime(value: unknown, sourceRow: number) {
  const text = valueAsText(value).trim();
  const parts = text.split(":");
  if (parts.length !== 2 && parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) {
    throw rowError(sourceRow, `time ${JSON.stringify(text)} must use m:ss or h:mm:ss.`);
  }
  const numbers = parts.map(Number);
  const seconds = parts.length === 2 ? numbers[1] : numbers[2];
  const minutes = parts.length === 2 ? numbers[0] : numbers[1];
  const hours = parts.length === 3 ? numbers[0] : 0;
  if (seconds >= 60 || minutes >= 60 && parts.length === 3) throw rowError(sourceRow, `time ${JSON.stringify(text)} has an invalid seconds or minutes value.`);
  return hours * 3600 + minutes * 60 + seconds;
}

function parseLineNumber(value: unknown, sourceRow: number) {
  const text = valueAsText(value).trim();
  const lineNo = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(lineNo) || lineNo < 1) throw rowError(sourceRow, "line_no must be a positive whole number.");
  return lineNo;
}

function parsePause(value: unknown, sourceRow: number): "haan" | "nahi" {
  const text = valueAsText(value).trim().toLowerCase();
  if (!text || text === "nahi") return "nahi";
  if (text === "haan") return "haan";
  throw rowError(sourceRow, 'pause_after must be "haan", "nahi", or blank.');
}

export function validatePedagogyRows(inputRows: PedagogyBriefInputRow[]) {
  if (!Array.isArray(inputRows) || inputRows.length === 0) throw new PedagogyBriefValidationError("The first worksheet has no data rows.");
  const rows = inputRows.map((input) => {
    const sourceRow = Number(input.sourceRow);
    if (!Number.isSafeInteger(sourceRow) || sourceRow < 2) throw new PedagogyBriefValidationError("Each pedagogy row needs its worksheet row number.");
    const narration = valueAsText(input.narration);
    if (!narration.trim()) throw rowError(sourceRow, "sir_ka_vaakya must not be blank.");
    const sourceTime = valueAsText(input.time);
    return {
      sourceRow,
      questionId: valueAsText(input.questionId),
      lineNo: parseLineNumber(input.lineNo, sourceRow),
      sourceTime,
      sourceSeconds: parsePedagogyTime(sourceTime, sourceRow),
      narration,
      board: valueAsText(input.board),
      emphasis: valueAsText(input.emphasis),
      pauseAfter: parsePause(input.pauseAfter, sourceRow),
    };
  }).toSorted((left, right) => left.lineNo - right.lineNo);

  let previousLineNo: number | undefined;
  let previousTime: number | undefined;
  let retainedBoard = "";
  const firstTimestamp = rows[0].sourceSeconds;
  return rows.map((row) => {
    if (row.lineNo === previousLineNo) throw rowError(row.sourceRow, `duplicate line_no ${row.lineNo}.`);
    if (previousTime !== undefined && row.sourceSeconds < previousTime) throw rowError(row.sourceRow, `time ${JSON.stringify(row.sourceTime)} moves backwards after line_no ${row.lineNo - 1}.`);
    previousLineNo = row.lineNo;
    previousTime = row.sourceSeconds;
    if (row.board.trim()) retainedBoard = row.board;
    const generatedTime = row.sourceSeconds - firstTimestamp;
    return { ...row, effectiveBoard: retainedBoard, generatedTime, generatedTimeLabel: formatPedagogyTime(generatedTime) } satisfies PedagogyRow;
  });
}

export function pedagogyWarnings(rows: PedagogyRow[]) {
  return rows.flatMap((row) => row.emphasis.trim() && !row.effectiveBoard.includes(row.emphasis)
    ? [`Row ${row.sourceRow}: emphasis ${JSON.stringify(row.emphasis)} does not exist on the current board; no highlight was added.`]
    : []);
}

export function assertNarrationFits(rowNumber: number, availableDuration: number, narrationDuration: number) {
  if (narrationDuration > availableDuration + 0.05) {
    const message = `Row ${rowNumber}: available duration ${availableDuration.toFixed(3)} seconds; required narration duration ${narrationDuration.toFixed(3)} seconds.`;
    throw new PedagogyBriefValidationError(message, { code: "NARRATION_TIMING_OVERFLOW", sourceRow: rowNumber, safeReason: message });
  }
}
