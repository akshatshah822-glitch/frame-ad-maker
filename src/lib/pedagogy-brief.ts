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
  questionText?: unknown;
  optionA?: unknown;
  optionB?: unknown;
  optionC?: unknown;
  optionD?: unknown;
  optionE?: unknown;
  /** Optional. "trick" = animated working layout (digits + arcs + step box + result). Blank = classic board. */
  layout?: unknown;
  /** Optional, trick layout only: the working row, e.g. "12 × 236". Carries forward when blank. */
  working?: unknown;
  /** Optional, trick layout only: arcs between working characters, e.g. "0>3; 1>4 neeche". Not carried forward. */
  arcs?: unknown;
  /** Optional, trick layout only: the result line, e.g. "2 7 _ _". Carries forward when blank. */
  result?: unknown;
};

export type PedagogyArc = { from: number; to: number; below: boolean };

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
  questionText: string;
  options: [string, string, string, string, string];
  effectiveQuestionText: string;
  effectiveOptions: [string, string, string, string, string];
  layout: "board" | "trick";
  working: string;
  effectiveWorking: string;
  arcs: string;
  result: string;
  effectiveResult: string;
};

export type PedagogyTimingAuditRow = {
  sourceRow: number;
  sourceTime: string;
  originalGeneratedTime: number;
  originalGeneratedTimeLabel: string;
  adjustedGeneratedTime: number;
  adjustedGeneratedTimeLabel: string;
  originalAvailableDuration: number | null;
  narrationDuration: number;
  allocatedDuration: number;
  addedDuration: number;
};

export type AdjustedPedagogyRow = PedagogyRow & {
  adjustedGeneratedTime: number;
  adjustedGeneratedTimeLabel: string;
  allocatedDuration: number;
};

export type AdjustedPedagogyTimeline = {
  rows: AdjustedPedagogyRow[];
  audit: PedagogyTimingAuditRow[];
  totalDuration: number;
};

export class PedagogyBriefValidationError extends Error {
  readonly code: "PEDAGOGY_BRIEF_VALIDATION";
  readonly sourceRow: number | null;
  readonly safeReason: string;

  constructor(message: string, options: { code?: "PEDAGOGY_BRIEF_VALIDATION"; sourceRow?: number; safeReason?: string } = {}) {
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

function parseLayout(value: unknown, sourceRow: number): "board" | "trick" {
  const text = valueAsText(value).trim().toLowerCase();
  if (!text || text === "board") return "board";
  if (text === "trick") return "trick";
  throw rowError(sourceRow, 'layout must be "trick", "board", or blank.');
}

/** Non-space characters of the working row; arc indexes count these, starting at 0. */
export function workingCharacters(working: string) {
  return [...working].filter((character) => !/\s/.test(character));
}

export function parsePedagogyArcs(arcs: string, working: string, sourceRow: number): PedagogyArc[] {
  const count = workingCharacters(working).length;
  return arcs.split(/[;,]/).map((part) => part.trim()).filter(Boolean).map((part) => {
    const match = /^(\d+)\s*>\s*(\d+)(?:\s+(neeche|below|upar|above))?$/i.exec(part);
    if (!match) throw rowError(sourceRow, `arc ${JSON.stringify(part)} must look like "0>3" or "1>4 neeche".`);
    const from = Number(match[1]);
    const to = Number(match[2]);
    if (from >= count || to >= count || from === to) throw rowError(sourceRow, `arc ${JSON.stringify(part)} must join two different characters of the working row (0 to ${count - 1}).`);
    return { from, to, below: /neeche|below/i.test(match[3] ?? "") };
  });
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
      questionText: valueAsText(input.questionText),
      options: [valueAsText(input.optionA), valueAsText(input.optionB), valueAsText(input.optionC), valueAsText(input.optionD), valueAsText(input.optionE)] as [string, string, string, string, string],
      layout: parseLayout(input.layout, sourceRow),
      working: valueAsText(input.working),
      arcs: valueAsText(input.arcs).trim(),
      result: valueAsText(input.result),
    };
  }).toSorted((left, right) => left.lineNo - right.lineNo);

  let previousLineNo: number | undefined;
  let previousTime: number | undefined;
  let retainedBoard = "";
  let retainedQuestionText = "";
  let retainedOptions: [string, string, string, string, string] = ["", "", "", "", ""];
  let retainedWorking = "";
  let retainedResult = "";
  const firstTimestamp = rows[0].sourceSeconds;
  return rows.map((row) => {
    if (row.lineNo === previousLineNo) throw rowError(row.sourceRow, `duplicate line_no ${row.lineNo}.`);
    if (previousTime !== undefined && row.sourceSeconds < previousTime) throw rowError(row.sourceRow, `time ${JSON.stringify(row.sourceTime)} moves backwards after line_no ${row.lineNo - 1}.`);
    previousLineNo = row.lineNo;
    previousTime = row.sourceSeconds;
    if (row.board.trim()) retainedBoard = row.board;
    if (row.questionText.trim()) {
      retainedQuestionText = row.questionText;
      retainedOptions = row.options;
    }
    if (row.working.trim()) retainedWorking = row.working;
    if (row.result.trim()) retainedResult = row.result;
    if (row.arcs) parsePedagogyArcs(row.arcs, retainedWorking, row.sourceRow);
    const generatedTime = row.sourceSeconds - firstTimestamp;
    return { ...row, effectiveBoard: retainedBoard, effectiveQuestionText: retainedQuestionText, effectiveOptions: retainedOptions, effectiveWorking: retainedWorking, effectiveResult: retainedResult, generatedTime, generatedTimeLabel: formatPedagogyTime(generatedTime) } satisfies PedagogyRow;
  });
}

export function pedagogyWarnings(rows: PedagogyRow[]) {
  return rows.flatMap((row) => row.emphasis.trim() && !row.effectiveBoard.includes(row.emphasis)
    ? [`Row ${row.sourceRow}: emphasis ${JSON.stringify(row.emphasis)} does not exist on the current board; no highlight was added.`]
    : []);
}

export const PACKED_NARRATION_GAP_SECONDS = 0.25;
export const PACKED_PAUSE_AFTER_SECONDS = 1;

export type PedagogyTimelineOptions = {
  /** When true, ignore source timestamps and place each line right after the previous line's audio. */
  pack?: boolean;
};

export function buildAdjustedPedagogyTimeline(rows: PedagogyRow[], narrationDurations: number[], options: PedagogyTimelineOptions = {}): AdjustedPedagogyTimeline {
  if (rows.length !== narrationDurations.length) throw new PedagogyBriefValidationError("Every pedagogy row needs one measured narration duration.");
  let adjustedGeneratedTime = 0;
  const audit = rows.map((row, index) => {
    const narrationDuration = narrationDurations[index];
    if (!Number.isFinite(narrationDuration) || narrationDuration <= 0) throw new PedagogyBriefValidationError("Pedagogy narration duration must be a positive number.", { sourceRow: row.sourceRow });
    const originalAvailableDuration = index === rows.length - 1 ? null : rows[index + 1].generatedTime - row.generatedTime;
    const allocatedDuration = options.pack
      ? narrationDuration + (row.pauseAfter === "haan" ? PACKED_PAUSE_AFTER_SECONDS : PACKED_NARRATION_GAP_SECONDS)
      : originalAvailableDuration === null
        ? narrationDuration + 0.5
        : Math.max(originalAvailableDuration, narrationDuration + 0.5);
    const auditRow = {
      sourceRow: row.sourceRow,
      sourceTime: row.sourceTime,
      originalGeneratedTime: row.generatedTime,
      originalGeneratedTimeLabel: row.generatedTimeLabel,
      adjustedGeneratedTime,
      adjustedGeneratedTimeLabel: formatPedagogyTime(adjustedGeneratedTime),
      originalAvailableDuration,
      narrationDuration,
      allocatedDuration,
      addedDuration: originalAvailableDuration === null ? 0 : allocatedDuration - originalAvailableDuration,
    } satisfies PedagogyTimingAuditRow;
    adjustedGeneratedTime += allocatedDuration;
    return auditRow;
  });
  return {
    rows: rows.map((row, index) => ({
      ...row,
      adjustedGeneratedTime: audit[index].adjustedGeneratedTime,
      adjustedGeneratedTimeLabel: audit[index].adjustedGeneratedTimeLabel,
      allocatedDuration: audit[index].allocatedDuration,
    })),
    audit,
    totalDuration: adjustedGeneratedTime,
  };
}
