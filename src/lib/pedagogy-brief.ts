import { emphasisPhrases } from "@/lib/pedagogy-emphasis";
import { diagramNames, diagramStepCount } from "@/lib/pedagogy-diagram-slide";
import { parsePedagogyVisual, pedagogyVisualLabels, PedagogyVisualParseError } from "@/lib/pedagogy-visual";
import { INFOGRAPHIC_KINDS, INFOGRAPHIC_MAX_ITEMS, infographicItems, isInfographic } from "@/lib/pedagogy-infographic";
import { JOURNEY_DEFAULT_CAMERA, JOURNEY_MAX_NOTES, JourneyParseError, parseAtlasItems, parseAtlasScene, parseGsTheme, parseTitlePair, type AtlasScene, type AtlasSpec, parseJourneyCamera, parseJourneyEffects, parseJourneyLabels, type JourneyCamera, type JourneyEffect, type JourneyPin, type JourneySpec } from "@/lib/pedagogy-journey-spec";
import { BOARD_MAX_LINES, parseSolutionDiagram, parseSolutionSteps, SOLUTION_MAX_CARDS, solutionItems, SolutionParseError } from "@/lib/pedagogy-solution";
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
  /** Optional. "trick" = animated working layout (digits + arcs + step box + result). "concept" = topic teaching slide (topic name + notes, no question/solution labels). "passage" = whole reading passage on screen with the explained word highlighted. Blank = classic board. */
  layout?: unknown;
  /** Optional, trick layout only: the working row, e.g. "12 × 236". Carries forward when blank. */
  working?: unknown;
  /** Optional, trick layout only: arcs between working characters, e.g. "0>3; 1>4 neeche". Not carried forward. */
  arcs?: unknown;
  /** Optional, trick layout only: the result line, e.g. "2 7 _ _". Carries forward when blank. */
  result?: unknown;
  /** Optional, diagram layout only: which code-drawn diagram, e.g. "canal-network". Carries forward within a question_id. */
  diagram?: unknown;
  /** Optional, diagram layout only: how many steps of the diagram are drawn (1 = first step). Blank = same as the row before. */
  diagramStep?: unknown;
  /** Optional, diagram layout only: language of the words inside the drawing, "en" or "hi". Blank = carry forward, else "hi". */
  diagramLabels?: unknown;
  /** Optional, infographic diagrams only (flow, cards, timeline, compare): items separated by "|". Carries forward within a question. */
  diagramItems?: unknown;
  /** Optional, layout = visual only: text, counter, logo, cards, flowchart, bar, line or waterfall. */
  visual?: unknown;
  /** Optional, layout = visual only: the items for that visual, e.g. "Free SIM > First use" or "2016: 250 | 2018: 10". */
  visualData?: unknown;
  /** Optional, layout = solution only: the problem students read. Carries forward within a question_id. */
  problem?: unknown;
  /** Optional, layout = solution only: step cards "a | b | Answer: c". Carries forward within a question_id. */
  steps?: unknown;
  /** Optional, layout = solution only: how many diagram_items are drawn by this row. Blank = row before (first row: all). */
  draw?: unknown;
  /** Optional, layout = solution only: "classic" (step cards, the look before Oct 23) or "board" (the solution written
   * line by line on the board in a handwriting font). Blank = the row before; a sheet without the column is classic. */
  theme?: unknown;
  /** Optional, theme = board only: margin notes "N | text" (N = working line the arrow points at) or "text".
   * Carry forward within a question_id. */
  trap?: unknown;
  trick?: unknown;
  remember?: unknown;
  /** Optional, whole sheet: "journey" = one continuous 3D Earth (pedagogy-journey.ts); "cinematic" = saved prototype,
   * not drawn yet (today's look is used and the fallback is logged). Carries forward; blank = today's look. */
  gsTheme?: unknown;
  /** Optional, journey only: "lat, lon, distance, tilt". Carries forward until a row names a new view. */
  camera?: unknown;
  /** Optional, journey only: "lat, lon = text = colour | …" pinned labels. Carry forward within a question_id. */
  anchoredLabels?: unknown;
  /** Optional, journey only: "glow …| arc … > …| band …| equator | sink …| ring …". Carry forward within a question_id. */
  effects?: unknown;
  /** Optional, journey only: the educator's own words for the caption bar and where they are in his class. Carry forward within a question_id. */
  caption?: unknown;
  sourceTs?: unknown;
  /** Optional, journey only: header badge (e.g. NEW CONCEPT) and progress-bar chapter. Carry forward through the sheet. */
  badge?: unknown;
  chapter?: unknown;
  /** Optional, journey only: key points for the notes panel on the right. `note` adds one point to this topic's notes;
   * `notes` ("a | b | c") replaces the whole list. *starred* words are highlighted. Carry forward within a question_id.
   * Older sheets have neither column, so they show no notes panel. */
  note?: unknown;
  notes?: unknown;
  /** Optional, journey only: the notes panel heading. Carries forward within a question_id. */
  notesTitle?: unknown;
  /** Optional, gs_theme = atlas only: scene (globe | cutaway | bars | cards | grid), its title ("Title | subtitle") and items.
   * Carry forward within a question_id; a new question_id starts on the globe. */
  scene?: unknown;
  sceneTitle?: unknown;
  sceneItems?: unknown;
  /** Optional, atlas only: "Title | question" chapter title card over the start of this row. Not carried forward. */
  chapterCard?: unknown;
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
  layout: "board" | "trick" | "passage" | "diagram" | "concept" | "visual" | "solution";
  /** layout = solution: the problem and step cards in force on this row ("" on other rows). diagram, diagramItems
   * and diagramStep hold the solution diagram, its items and how many step cards are showing. */
  effectiveProblem: string;
  effectiveSteps: string;
  /** layout = solution: diagram items drawn by this row (0 on other rows). */
  solutionDrawn: number;
  /** layout = solution: theme in force and the margin notes of this question ("" when none). */
  effectiveTheme: "classic" | "board";
  effectiveTrap: string;
  effectiveTrick: string;
  effectiveRemember: string;
  /** gs_theme in force; journey is the spec for this row when gs_theme = journey (null otherwise). */
  gsTheme: "" | "journey" | "cinematic" | "atlas";
  journey: JourneySpec | null;
  /** FRAME look visual for layout = visual ("" on other rows). */
  visual: string;
  visualData: string;
  /** Diagram name and step; "" and 0 on rows that are not diagram rows. */
  diagram: string;
  diagramStep: number;
  diagramLabels: "hi" | "en";
  /** Items of an infographic diagram (flow, cards, timeline, compare); empty for drawn diagrams. */
  diagramItems: string[];
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

function parseLookVisual(layout: unknown, kind: unknown, data: unknown, board: unknown, sourceRow: number) {
  if (valueAsText(layout).trim().toLowerCase() !== "visual") return { visual: "", visualData: "" };
  try {
    const visual = parsePedagogyVisual(kind, data);
    if (visual.kind !== "text" && valueAsText(board).trim().length > 110) throw rowError(sourceRow, "board is the title above a visual and must be 110 characters or fewer.");
    return { visual: visual.kind, visualData: visual.kind === "text" ? "" : valueAsText(data).trim() };
  } catch (error) {
    if (error instanceof PedagogyVisualParseError) throw rowError(sourceRow, error.message);
    throw error;
  }
}

function lookVisualWarnings(row: PedagogyRow) {
  if (!row.emphasis.trim()) return [];
  const visual = parsePedagogyVisual(row.visual, row.visualData);
  const found = visual.kind === "text"
    ? row.effectiveBoard.includes(row.emphasis)
    : row.board.includes(row.emphasis) || pedagogyVisualLabels(visual).some((label) => label.trim() === row.emphasis.trim());
  return found ? [] : [`Row ${row.sourceRow}: emphasis ${JSON.stringify(row.emphasis)} does not exist on the current board; no highlight was added.`];
}

function parseLayout(value: unknown, sourceRow: number): "board" | "trick" | "passage" | "diagram" | "concept" | "visual" | "solution" {
  const text = valueAsText(value).trim().toLowerCase();
  if (!text || text === "board") return "board";
  if (text === "trick") return "trick";
  if (text === "passage") return "passage";
  if (text === "diagram") return "diagram";
  if (text === "concept") return "concept";
  if (text === "visual") return "visual";
  if (text === "solution") return "solution";
  throw rowError(sourceRow, 'layout must be "trick", "passage", "diagram", "concept", "visual", "solution", "board", or blank.');
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
      ...parseLookVisual(input.layout, input.visual, input.visualData, input.board, sourceRow),
      working: valueAsText(input.working),
      arcs: valueAsText(input.arcs).trim(),
      result: valueAsText(input.result),
      diagramName: valueAsText(input.diagram).trim().toLowerCase(),
      diagramStepText: valueAsText(input.diagramStep).trim(),
      diagramLabelsText: valueAsText(input.diagramLabels).trim().toLowerCase(),
      diagramItemsText: valueAsText(input.diagramItems).trim(),
      problemText: valueAsText(input.problem).trim(),
      stepsText: valueAsText(input.steps).trim(),
      drawText: valueAsText(input.draw).trim(),
      themeText: valueAsText(input.theme).trim().toLowerCase(),
      trapText: valueAsText(input.trap).trim(),
      trickText: valueAsText(input.trick).trim(),
      rememberText: valueAsText(input.remember).trim(),
      gsThemeText: valueAsText(input.gsTheme).trim(),
      cameraText: valueAsText(input.camera).trim(),
      labelsText: valueAsText(input.anchoredLabels).trim(),
      effectsText: valueAsText(input.effects).trim(),
      captionText: valueAsText(input.caption).trim(),
      sourceTsText: valueAsText(input.sourceTs).trim(),
      badgeText: valueAsText(input.badge).trim(),
      chapterText: valueAsText(input.chapter).trim(),
      noteText: valueAsText(input.note).trim(),
      notesText: valueAsText(input.notes).trim(),
      notesTitleText: valueAsText(input.notesTitle).trim(),
      sceneText: valueAsText(input.scene).trim(),
      sceneTitleText: valueAsText(input.sceneTitle).trim(),
      sceneItemsText: valueAsText(input.sceneItems).trim(),
      chapterCardText: valueAsText(input.chapterCard).trim(),
    };
  }).toSorted((left, right) => left.lineNo - right.lineNo);

  let previousLineNo: number | undefined;
  let previousTime: number | undefined;
  let retainedBoard = "";
  let retainedQuestionText = "";
  let retainedOptions: [string, string, string, string, string] = ["", "", "", "", ""];
  let retainedWorking = "";
  let retainedResult = "";
  let retainedDiagram = "";
  let retainedDiagramStep = 0;
  let retainedDiagramLabels: "hi" | "en" = "hi";
  let retainedDiagramItems: string[] = [];
  let retainedProblem = "";
  let retainedSteps = "";
  let retainedDrawn = -1;
  let retainedTheme: "classic" | "board" = "classic";
  let retainedNotes = { trap: "", trick: "", remember: "" };
  let retainedGsTheme: "" | "journey" | "cinematic" | "atlas" = "";
  let retainedCamera: JourneyCamera = JOURNEY_DEFAULT_CAMERA;
  let retainedPins: JourneyPin[] = [];
  let retainedCardLines: string[] = [];
  let retainedEffects: JourneyEffect[] = [];
  let retainedCaption = { caption: "", sourceTs: "" };
  let retainedBadge = "";
  let retainedChapter = "";
  let retainedNoteLines: string[] = [];
  let retainedNotesTitle = "";
  let retainedScene: AtlasScene = "globe";
  let retainedSceneTitle: readonly [string, string] = ["", ""];
  let retainedSceneItems: string[][] = [];
  const firstTimestamp = rows[0].sourceSeconds;
  return rows.map((row, index) => {
    let chapterCard: readonly [string, string] | null = null;
    if (row.lineNo === previousLineNo) throw rowError(row.sourceRow, `duplicate line_no ${row.lineNo}.`);
    if (previousTime !== undefined && row.sourceSeconds < previousTime) throw rowError(row.sourceRow, `time ${JSON.stringify(row.sourceTime)} moves backwards after line_no ${row.lineNo - 1}.`);
    previousLineNo = row.lineNo;
    previousTime = row.sourceSeconds;
    if (row.board.trim()) retainedBoard = row.board;
    if (row.questionText.trim()) {
      retainedQuestionText = row.questionText;
      retainedOptions = row.options;
    }
    // Working row and result belong to one question: a new question_id starts clean.
    if (index > 0 && row.questionId !== rows[index - 1].questionId) {
      retainedWorking = "";
      retainedResult = "";
    }
    if (row.working.trim()) retainedWorking = row.working;
    if (row.result.trim()) retainedResult = row.result;
    if (row.arcs) parsePedagogyArcs(row.arcs, retainedWorking, row.sourceRow);
    // Diagram name and step belong to one question: a new question_id starts clean.
    if (index > 0 && row.questionId !== rows[index - 1].questionId) {
      retainedDiagram = "";
      retainedDiagramStep = 0;
      retainedDiagramLabels = "hi";
      retainedDiagramItems = [];
      retainedProblem = "";
      retainedSteps = "";
      retainedDrawn = -1;
      retainedNotes = { trap: "", trick: "", remember: "" };
      retainedPins = [];
      retainedCardLines = [];
      retainedEffects = [];
      retainedCaption = { caption: "", sourceTs: "" };
      retainedNoteLines = [];
      retainedNotesTitle = "";
      retainedScene = "globe";
      retainedSceneTitle = ["", ""];
      retainedSceneItems = [];
    }
    try {
      if (row.gsThemeText) retainedGsTheme = parseGsTheme(row.gsThemeText);
      if (row.cameraText) retainedCamera = parseJourneyCamera(row.cameraText);
      if (row.labelsText) ({ pins: retainedPins, cardLines: retainedCardLines } = parseJourneyLabels(row.labelsText));
      if (row.effectsText) retainedEffects = parseJourneyEffects(row.effectsText);
      if (row.sceneText) { retainedScene = parseAtlasScene(row.sceneText); retainedSceneItems = []; retainedSceneTitle = ["", ""]; }
      if (row.sceneTitleText) retainedSceneTitle = parseTitlePair(row.sceneTitleText);
      if (row.sceneItemsText) retainedSceneItems = parseAtlasItems(retainedScene, row.sceneItemsText);
      if (row.sceneText && retainedScene !== "globe" && retainedScene !== "cutaway" && !retainedSceneItems.length) throw new JourneyParseError(`a ${retainedScene} scene needs scene_items on the row that starts it.`);
      chapterCard = row.chapterCardText ? parseTitlePair(row.chapterCardText) : null;
    } catch (error) {
      if (error instanceof JourneyParseError) throw rowError(row.sourceRow, error.message);
      throw error;
    }
    if (row.captionText || row.sourceTsText) retainedCaption = { caption: row.captionText, sourceTs: row.sourceTsText };
    if (row.badgeText) retainedBadge = row.badgeText;
    if (row.chapterText) retainedChapter = row.chapterText;
    if (row.notesText) retainedNoteLines = row.notesText.split("|").map((line) => line.trim()).filter(Boolean);
    if (row.noteText) retainedNoteLines = [...retainedNoteLines, row.noteText];
    if (retainedNoteLines.length > JOURNEY_MAX_NOTES) throw rowError(row.sourceRow, `a topic can have at most ${JOURNEY_MAX_NOTES} notes; start a new question_id or shorten the list.`);
    if (retainedNoteLines.some((line) => (line.match(/\*/g)?.length ?? 0) % 2)) throw rowError(row.sourceRow, "a note has an unclosed * highlight.");
    if (row.notesTitleText) retainedNotesTitle = row.notesTitleText;
    let diagram = "";
    let diagramStep = 0;
    if (row.layout === "diagram") {
      if (row.diagramName && row.diagramName !== retainedDiagram) { retainedDiagramStep = 0; retainedDiagramItems = []; }
      if (row.diagramName) retainedDiagram = row.diagramName;
      if (row.diagramItemsText) { retainedDiagramItems = infographicItems(row.diagramItemsText); retainedDiagramStep = 0; }
      let steps = diagramStepCount(retainedDiagram);
      if (isInfographic(retainedDiagram)) {
        const max = INFOGRAPHIC_MAX_ITEMS[retainedDiagram];
        if (!retainedDiagramItems.length) throw rowError(row.sourceRow, `diagram ${retainedDiagram} needs diagram_items (items separated by "|").`);
        if (retainedDiagramItems.length > max) throw rowError(row.sourceRow, `diagram ${retainedDiagram} takes at most ${max} items; this row has ${retainedDiagramItems.length}.`);
        steps = retainedDiagramItems.length;
      }
      if (!steps) throw rowError(row.sourceRow, `diagram ${JSON.stringify(retainedDiagram)} is not a FRAME diagram. Use one of: ${[...diagramNames, ...INFOGRAPHIC_KINDS].join(", ")}.`);
      if (row.diagramStepText) {
        const step = Number(row.diagramStepText);
        if (!Number.isInteger(step) || step < 1 || step > steps) throw rowError(row.sourceRow, `diagram_step must be a whole number from 1 to ${steps} for ${retainedDiagram}.`);
        retainedDiagramStep = step;
      } else if (!retainedDiagramStep) retainedDiagramStep = 1;
      if (row.diagramLabelsText) {
        if (row.diagramLabelsText !== "en" && row.diagramLabelsText !== "hi") throw rowError(row.sourceRow, 'diagram_labels must be "en", "hi", or blank.');
        retainedDiagramLabels = row.diagramLabelsText;
      }
      diagram = retainedDiagram;
      diagramStep = retainedDiagramStep;
    }
    let effectiveProblem = "";
    let effectiveSteps = "";
    let solutionDrawn = 0;
    if (row.themeText) {
      if (row.themeText !== "classic" && row.themeText !== "board") throw rowError(row.sourceRow, 'theme must be "classic", "board", or blank.');
      retainedTheme = row.themeText;
    }
    if (row.trapText) retainedNotes.trap = row.trapText;
    if (row.trickText) retainedNotes.trick = row.trickText;
    if (row.rememberText) retainedNotes.remember = row.rememberText;
    if (row.layout === "solution") {
      // Same carry-forward as diagram rows; diagram_step counts the step cards showing (0 = none yet).
      if (row.diagramName && row.diagramName !== retainedDiagram) { retainedDiagramItems = []; }
      if (row.diagramName) retainedDiagram = row.diagramName;
      if (row.diagramItemsText) retainedDiagramItems = solutionItems(row.diagramItemsText);
      if (row.problemText) retainedProblem = row.problemText;
      if (row.stepsText) retainedSteps = row.stepsText;
      if (!retainedDiagram) retainedDiagram = "none";
      try {
        const parts = parseSolutionDiagram(retainedDiagram, retainedDiagramItems).parts;
        if (row.drawText) {
          const drawn = Number(row.drawText);
          if (!Number.isInteger(drawn) || drawn < 0 || drawn > parts) throw rowError(row.sourceRow, `draw must be a whole number from 0 to ${parts} (how many diagram_items are drawn by this row).`);
          retainedDrawn = drawn;
        } else retainedDrawn = retainedDrawn < 0 ? parts : Math.min(retainedDrawn, parts);
        solutionDrawn = retainedDrawn;
        const cards = parseSolutionSteps(retainedSteps, retainedTheme === "board" ? BOARD_MAX_LINES : SOLUTION_MAX_CARDS).length;
        // Margin notes point at a working line: "N | text" needs 1 ≤ N ≤ the number of lines.
        for (const [name, note] of Object.entries(retainedNotes)) {
          const target = /^(\d+)\s*\|/.exec(note)?.[1];
          if (target && (Number(target) < 1 || Number(target) > cards)) throw rowError(row.sourceRow, `${name} points at line ${target}, but steps has ${cards} line${cards === 1 ? "" : "s"}.`);
        }
        if (row.diagramStepText) {
          const shown = Number(row.diagramStepText);
          if (!Number.isInteger(shown) || shown < 0 || shown > cards) throw rowError(row.sourceRow, `diagram_step must be a whole number from 0 to ${cards} (the number of step cards showing).`);
          retainedDiagramStep = shown;
        } else retainedDiagramStep = Math.min(retainedDiagramStep, cards);
      } catch (error) {
        if (error instanceof SolutionParseError) throw rowError(row.sourceRow, error.message);
        throw error;
      }
      diagram = retainedDiagram;
      diagramStep = retainedDiagramStep;
      effectiveProblem = retainedProblem;
      effectiveSteps = retainedSteps;
    }
    const generatedTime = row.sourceSeconds - firstTimestamp;
    const { diagramName, diagramStepText, diagramLabelsText, diagramItemsText, problemText, stepsText, drawText, themeText, trapText, trickText, rememberText, gsThemeText, cameraText, labelsText, effectsText, captionText, sourceTsText, badgeText, chapterText, noteText, notesText, notesTitleText, sceneText, sceneTitleText, sceneItemsText, chapterCardText, ...rest } = row;
    void themeText; void trapText; void trickText; void rememberText;
    void gsThemeText; void cameraText; void labelsText; void effectsText; void captionText; void sourceTsText; void badgeText; void chapterText; void noteText; void notesText; void notesTitleText; void sceneText; void sceneTitleText; void sceneItemsText; void chapterCardText;
    const atlas: AtlasSpec | undefined = retainedGsTheme === "atlas"
      ? { scene: retainedScene, sceneTitle: retainedSceneTitle[0], sceneSubtitle: retainedSceneTitle[1], items: retainedSceneItems, chapterCard: chapterCard ? { title: chapterCard[0], question: chapterCard[1] } : null, headline: retainedQuestionText.trim() }
      : undefined;
    const journey: JourneySpec | null = retainedGsTheme === "journey" || retainedGsTheme === "atlas"
      ? { camera: retainedCamera, pins: retainedPins, cardLines: retainedCardLines, effects: retainedEffects, caption: retainedCaption.caption, sourceTs: retainedCaption.sourceTs, badge: retainedBadge, chapter: retainedChapter, notes: retainedNoteLines, notesTitle: retainedNotesTitle, ...(atlas ? { atlas } : {}) }
      : null;
    const solution = row.layout === "solution";
    void drawText;
    void problemText;
    void stepsText;
    void diagramName;
    void diagramStepText;
    void diagramLabelsText;
    void diagramItemsText;
    const diagramItems = (row.layout === "diagram" && isInfographic(diagram)) || row.layout === "solution" ? retainedDiagramItems : [];
    const diagramLabels = row.layout === "diagram" ? retainedDiagramLabels : "hi";
    return { ...rest, diagram, diagramStep, diagramLabels, diagramItems, effectiveProblem, effectiveSteps, solutionDrawn, effectiveTheme: retainedTheme, effectiveTrap: solution ? retainedNotes.trap : "", effectiveTrick: solution ? retainedNotes.trick : "", effectiveRemember: solution ? retainedNotes.remember : "", gsTheme: retainedGsTheme, journey, effectiveBoard: retainedBoard, effectiveQuestionText: retainedQuestionText, effectiveOptions: retainedOptions, effectiveWorking: retainedWorking, effectiveResult: retainedResult, generatedTime, generatedTimeLabel: formatPedagogyTime(generatedTime) } satisfies PedagogyRow;
  });
}

export function pedagogyWarnings(rows: PedagogyRow[]) {
  const cinematic = rows.find((row) => row.gsTheme === "cinematic");
  const typeWarnings = cinematic ? [`Row ${cinematic.sourceRow}: gs_theme "cinematic" is a saved prototype that FRAME does not draw yet; this video uses today's look.`] : [];
  return [...typeWarnings, ...rows.flatMap((row) => row.layout === "visual" ? lookVisualWarnings(row) : row.layout === "passage"
    ? (row.emphasis.trim() && !row.effectiveQuestionText.toLowerCase().includes(row.emphasis.trim().toLowerCase())
      ? [`Row ${row.sourceRow}: emphasis ${JSON.stringify(row.emphasis)} does not appear in the passage; no highlight was added.`]
      : [])
    : row.layout === "concept" || row.layout === "diagram"
    ? emphasisPhrases(row.emphasis).filter((phrase) => !row.effectiveBoard.includes(phrase)).map((phrase) => `Row ${row.sourceRow}: emphasis ${JSON.stringify(phrase)} does not exist on the current board; no highlight was added.`)
    : row.emphasis.trim() && !row.effectiveBoard.includes(row.emphasis)
    ? [`Row ${row.sourceRow}: emphasis ${JSON.stringify(row.emphasis)} does not exist on the current board; no highlight was added.`]
    : [])];
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
