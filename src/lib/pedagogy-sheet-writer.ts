import * as XLSX from "xlsx";
import OpenAI from "openai";
import { secondsToClock, type TranscriptLine } from "@/lib/youtube-transcript";

// Writes a FRAME solution-layout sheet from an educator's YouTube class, the way the Anubhav Sir sheets were written:
// only his words, his examples, his questions and his answers; nothing added; anything missing is flagged as a gap.
// The writer AI runs on the server. Which one ran is always logged:
//   claude   ANTHROPIC_API_KEY is set (Anthropic Messages API)
//   openai   otherwise (OPENAI_API_KEY, already used by FRAME)

export type SheetConcept = {
  id: string; src: string; chapter: string; title: string; emph: string; problem: string;
  options?: string[]; gap?: string; table: string[][]; note?: string; steps: string[];
  lines: { text: string; draw: number; cards: number }[];
};
export type WrittenSheet = { concepts: SheetConcept[]; writer: string; fixes: string[] };

export class SheetWriterError extends Error {
  constructor(message: string, readonly code = "SHEET_WRITER_FAILED") { super(message); }
}

export const SHEET_COLUMNS = ["question_id", "line_no", "time", "sir_ka_vaakya", "board", "emphasis", "question_text", "layout", "problem", "diagram", "diagram_items", "steps", "draw", "diagram_step", "pause_after", "option_a", "option_b", "option_c", "option_d", "option_e"];
const CLAUDE_MODEL = "claude-opus-5-5";
const OPENAI_MODEL = "gpt-5-mini";
const SECONDS_PER_LINE = 10; // measured on Anubhav Part 1: 110 lines → 1096 s

export function writerInstructions(targetLines: number) {
  return `You turn one part of an Indian educator's recorded YouTube class into a FRAME teaching sheet. FRAME draws a board for every line and speaks the line in the educator's cloned voice.

FIDELITY (most important)
- Use ONLY what the educator says in the transcript you are given. His order, his examples, his exam questions, his answers, his jokes and phrasing. Add nothing: no new examples, no new facts, no rules he did not state.
- If something is missing (options he only showed on a slide, an answer letter he never said, a word he hid), do not invent it: leave it out and say so in "gap".
- Narration is what he would say, never a description of the screen, shots or camera.

LANGUAGE OF NARRATION ("lines[].text")
- Hinglish exactly like his class: Hindi in Devanagari plus English words in Latin script (topic words, examples, sentences in English stay English). At least one in five words must be English.
- Write numbers as he says them; full sentences; each line 1–3 sentences, under 60 words, grammatically complete (no run-ons, no missing verbs).

STRUCTURE: return JSON {"concepts":[...]} and nothing else. One concept per idea or exam question he teaches, in his order. Each concept:
- id: "C1", "C2"… in order; src: his time range like "12:05–18:40"; chapter: short topic name (e.g. "Articles"); title: the rule in under 9 words; emph: one or two words that appear in title (highlighted).
- problem: his exam question or example sentence, exactly. Wrap each wrong part he corrects in *stars* (close the star right after the last word, never "*." ); at most (steps − 1) starred parts.
- options: only if he shows/reads options (max 5, short, under 40 characters each); else omit.
- table: rows of cells for the board table. First row = column headers (2–4 columns), then up to 5 rows from his examples. Every row has the same number of cells. Wrap the key word of a cell in *stars* to make it yellow. Never use " = " inside a cell.
- note (optional): his one-line rule summary.
- steps: 1–5 short step cards; the LAST one is the answer text (e.g. "Error in part C → Option A: Only C" or the corrected sentence). No "Answer:" prefix.
- lines: 2–6 narration lines for this concept, each {"text", "draw", "cards"}: draw = how many board items are visible after this line (items = table rows including the header row, then the note if any), cards = how many step cards are visible. Both only grow. The first line usually reads out the question (draw 0, cards 0). The LAST line must show everything: draw = number of table rows (+1 if note), cards = number of steps.
- gap (optional): what the transcript did not give you.

LENGTH: about ${targetLines} lines in total across all concepts (each line ≈ ${SECONDS_PER_LINE} seconds of video). Cover every concept he teaches in this part; if there are too many, keep his main concepts and list the dropped ones in the last concept's gap.`;
}

function transcriptText(lines: TranscriptLine[]) {
  return lines.map((line) => `[${secondsToClock(line.start)}] ${line.text}`).join("\n");
}

function parseConcepts(text: string) {
  const start = text.indexOf("{"); const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new SheetWriterError("The writer AI did not return a sheet.");
  const json = JSON.parse(text.slice(start, end + 1)) as { concepts?: unknown };
  if (!Array.isArray(json.concepts) || !json.concepts.length) throw new SheetWriterError("The writer AI returned no concepts.");
  return json.concepts as SheetConcept[];
}

async function writeWithClaude(system: string, user: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 32000, system, messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(600_000),
  });
  const body = await response.json().catch(() => ({})) as { content?: { type: string; text?: string }[]; error?: { type?: string; message?: string } };
  if (!response.ok) throw new SheetWriterError(`Claude could not write the sheet (HTTP ${response.status}${body.error?.type ? `, ${body.error.type}` : ""}).`, "SHEET_WRITER_CLAUDE_FAILED");
  return (body.content ?? []).filter((part) => part.type === "text").map((part) => part.text ?? "").join("");
}

async function writeWithOpenAI(system: string, user: string) {
  const response = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 600_000, maxRetries: 1 }).responses.create({
    model: OPENAI_MODEL, instructions: system, input: user, text: { format: { type: "json_object" } },
  });
  return response.output_text;
}

/** Makes the AI's concepts safe for FRAME: board counts, step limits, stars and table shape. Every fix is reported. */
export function normalizeConcepts(raw: SheetConcept[]) {
  const fixes: string[] = [];
  const concepts = raw.map((input, index) => {
    const id = `C${index + 1}`;
    const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
    let table = (Array.isArray(input.table) ? input.table : []).map((row) => (Array.isArray(row) ? row : String(row).split(" = ")).map((cell) => clean(cell).replaceAll(" = ", " → "))).filter((row) => row.some(Boolean));
    if (table.length < 2) { table = [["Point", "From the class"], [clean(input.title) || "—", clean(input.note) || "—"]]; fixes.push(`${id}: no usable table, a two-cell table was made from the title`); }
    const width = Math.min(4, Math.max(2, table[0].length));
    table = table.slice(0, 6).map((row) => { const cells = row.slice(0, width); while (cells.length < width) cells.push("—"); return cells; });
    let steps = (Array.isArray(input.steps) ? input.steps : []).map(clean).filter(Boolean).map((step) => step.replace(/^answer:\s*/i, ""));
    if (!steps.length) { steps = [clean(input.title)]; fixes.push(`${id}: no steps, the title became the answer card`); }
    if (steps.length > 5) { steps = [...steps.slice(0, 4), steps.at(-1)!]; fixes.push(`${id}: more than 5 step cards, kept 4 + the answer`); }
    let problem = clean(input.problem).replace(/\*\./g, "*");
    const stars = (problem.match(/\*[^*]+\*/g) ?? []).length;
    if (stars > Math.max(0, steps.length - 1)) { problem = problem.replaceAll("*", ""); fixes.push(`${id}: more red parts than step cards, red marks removed`); }
    const note = clean(input.note);
    const items = table.length + (note ? 1 : 0);
    let lines = (Array.isArray(input.lines) ? input.lines : []).map((line) => ({ text: clean(line?.text), draw: Number(line?.draw) || 0, cards: Number(line?.cards) || 0 })).filter((line) => line.text);
    if (!lines.length) throw new SheetWriterError(`${id} has no narration lines.`);
    let draw = 0; let cards = 0;
    lines = lines.map((line) => { draw = Math.min(items, Math.max(draw, line.draw)); cards = Math.min(steps.length, Math.max(cards, line.cards)); return { ...line, draw, cards }; });
    const last = lines.at(-1)!;
    if (last.draw !== items || last.cards !== steps.length) { last.draw = items; last.cards = steps.length; fixes.push(`${id}: last line now shows the whole board`); }
    const options = (Array.isArray(input.options) ? input.options : []).map(clean).filter(Boolean).slice(0, 5);
    const title = clean(input.title) || id;
    const emph = clean(input.emph);
    return { id, src: clean(input.src), chapter: clean(input.chapter) || "Class", title, emph: emph && title.toLowerCase().includes(emph.toLowerCase()) ? emph : title.split(" ")[0], problem, options: options.some((option) => option.length > 60) ? [] : options, gap: clean(input.gap), table, note, steps, lines } satisfies SheetConcept;
  });
  return { concepts, fixes };
}

export async function writeSheetFromTranscript(input: { lines: TranscriptLine[]; targetMinutes: number; educator: string; title: string }): Promise<WrittenSheet> {
  if (input.lines.length < 5) throw new SheetWriterError("This part of the class has almost no transcript.", "SHEET_WRITER_NO_TRANSCRIPT");
  const targetLines = Math.max(12, Math.round(input.targetMinutes * 60 / SECONDS_PER_LINE));
  const system = writerInstructions(targetLines);
  const user = `Class: ${input.title || "YouTube class"}${input.educator ? ` by ${input.educator}` : ""}.\nTranscript of this part (time in the class, then his words):\n\n${transcriptText(input.lines)}`;
  const writer = process.env.ANTHROPIC_API_KEY ? `claude (${CLAUDE_MODEL})` : process.env.OPENAI_API_KEY ? `openai (${OPENAI_MODEL})` : "";
  if (!writer) throw new SheetWriterError("No writer AI is configured: add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env.local.", "SHEET_WRITER_NOT_CONFIGURED");
  console.info(`Pedagogy sheet writer: path ${writer}, ${input.lines.length} transcript lines, target ${targetLines} lines`);
  const text = process.env.ANTHROPIC_API_KEY ? await writeWithClaude(system, user) : await writeWithOpenAI(system, user);
  let raw: SheetConcept[];
  try { raw = parseConcepts(text); } catch (error) {
    if (error instanceof SheetWriterError) throw error;
    throw new SheetWriterError("The writer AI's sheet could not be read. Try again.");
  }
  const { concepts, fixes } = normalizeConcepts(raw);
  if (fixes.length) console.warn(`Pedagogy sheet writer fixes: ${fixes.length} (${fixes.slice(0, 5).join("; ")}${fixes.length > 5 ? "; …" : ""})`);
  return { concepts, writer, fixes };
}

/** Same layout as the hand-made Anubhav sheets: Sheet1 for FRAME, "Source & gaps" for people. */
export function sheetWorkbook(concepts: SheetConcept[], source: { link: string; title: string; writer: string }) {
  const rows: unknown[][] = [SHEET_COLUMNS];
  let lineNo = 0; let seconds = 0;
  for (const concept of concepts) {
    const items = [...concept.table.map((row) => row.join(" = ")), ...(concept.note ? [`note ${concept.note}`] : [])];
    const steps = [...concept.steps.slice(0, -1), `Answer: ${concept.steps.at(-1)}`];
    concept.lines.forEach((line, index) => {
      lineNo += 1;
      const row: Record<string, unknown> = {
        question_id: concept.id, line_no: lineNo, time: `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`, sir_ka_vaakya: line.text,
        layout: "solution", draw: line.draw, diagram_step: line.cards, pause_after: index === concept.lines.length - 1 ? "haan" : "",
      };
      if (index === 0) {
        Object.assign(row, { board: concept.title, emphasis: concept.emph, question_text: concept.chapter, problem: concept.problem, diagram: "table", diagram_items: items.join(" | "), steps: steps.join(" | ") });
        (concept.options ?? []).forEach((option, n) => { row[`option_${"abcde"[n]}`] = option; });
      }
      rows.push(SHEET_COLUMNS.map((column) => row[column] ?? ""));
      seconds += 6;
    });
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  const gaps: unknown[][] = [["question_id", "concept", "chapter", "class time", "gap / flag"], ...concepts.map((concept) => [concept.id, concept.title, concept.chapter, concept.src, concept.gap ?? ""]),
    [], ["source", source.link], ["class", source.title], ["written by", `${source.writer}, from the transcript only. Check every line before generating.`]];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(gaps), "Source & gaps");
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}
