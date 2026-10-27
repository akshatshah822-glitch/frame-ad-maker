import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { classDirectory, ClassRoomError, writeJson, type ClassChapter, type TranscriptSegment } from "@/lib/class-room";

// "Publish as two-way class": turns a finished pedagogy (xlsx) render into a class at /class/<id>.
// The sheet already knows everything the class needs, so nothing is guessed or transcribed:
//   lecture.mp4     the rendered video, byte for byte
//   class.json      title, subtitle, chapters (one per topic, at the exact second it starts in the video)
//   transcript.json every narration line at its exact time (so no Whisper call, no transcription cost)

/** topicKey decides where a new tab starts: the topic (question_text) when the sheet has one, else the question_id. */
export type PublishRow = { sourceRow: number; questionId: string; narration: string; topic: string; topicKey: string };
export type PublishInput = { title: string; subtitle: string; rows: PublishRow[]; starts: Map<number, number>; duration: number; video: Uint8Array };

const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
const clean = (value: unknown, limit: number) => (typeof value === "string" ? value : "").replace(/\s+/g, " ").trim().slice(0, limit);

export function slugFor(title: string) {
  const slug = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "");
  return slug || "class";
}

/** Reads the publish form: rows and timings come from the render the educator just watched. */
export function parsePublishFields(fields: { title: unknown; subtitle: unknown; rows: unknown; audit: unknown; duration: unknown }) {
  const title = clean(fields.title, 120);
  if (title.length < 2) throw new ClassRoomError("Give the class a title.");
  const subtitle = clean(fields.subtitle, 120);
  let rawRows: unknown; let rawAudit: unknown;
  try { rawRows = JSON.parse(String(fields.rows ?? "")); rawAudit = JSON.parse(String(fields.audit ?? "[]")); } catch { throw new ClassRoomError("The lecture details could not be read. Generate the video again, then publish."); }
  if (!Array.isArray(rawRows) || !rawRows.length || rawRows.length > 3000) throw new ClassRoomError("The lecture has no rows to publish.");
  const rows: PublishRow[] = rawRows.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    const board = typeof row.effectiveBoard === "string" ? row.effectiveBoard.split("\n")[0] : "";
    const questionText = clean(row.effectiveQuestionText, 90);
    const questionId = clean(row.questionId, 60);
    return {
      sourceRow: Number(row.sourceRow),
      questionId,
      narration: clean(row.narration, 1200),
      // Without question_text, one tab per question_id (named after its first board line), never one per board change.
      topic: questionText || clean(board.replaceAll("*", ""), 90) || questionId,
      topicKey: questionText ? `topic:${questionText}` : `question:${questionId}`,
    };
  }).filter((row) => Number.isFinite(row.sourceRow) && row.narration);
  if (!rows.length) throw new ClassRoomError("The lecture has no narration to publish.");
  const starts = new Map<number, number>();
  for (const entry of Array.isArray(rawAudit) ? rawAudit : []) {
    const audit = (entry ?? {}) as Record<string, unknown>;
    const at = Number(audit.adjustedGeneratedTime);
    if (Number.isFinite(Number(audit.sourceRow)) && Number.isFinite(at) && at >= 0) starts.set(Number(audit.sourceRow), at);
  }
  const duration = Number(fields.duration);
  return { title, subtitle, rows, starts, duration: Number.isFinite(duration) && duration > 0 ? duration : 0 };
}

/** Chapters change where the topic changes; the transcript is every narration line at its start second. */
export function classOutline(rows: PublishRow[], starts: Map<number, number>, duration: number) {
  const missing = rows.filter((row) => !starts.has(row.sourceRow)).length;
  if (missing) console.warn("Class publish timing", { path: "row-order-fallback", rowsWithoutTime: missing, of: rows.length });
  // A row without a measured start (should not happen) takes the previous row's start, so order is kept.
  let previous = 0;
  const timed = rows.map((row) => { const at = starts.get(row.sourceRow) ?? previous; previous = at; return { ...row, at }; }).sort((a, b) => a.at - b.at);
  const chapters: ClassChapter[] = [];
  let lastKey = "";
  for (const row of timed) {
    const last = chapters.at(-1);
    if (row.topicKey === lastKey) continue;
    lastKey = row.topicKey;
    const at = Math.round(row.at * 10) / 10;
    if (last && last.at === at) { last.title = row.topic; continue; }
    chapters.push({ at, title: row.topic });
  }
  if (chapters.length && chapters[0].at > 0) chapters[0].at = 0;
  const end = duration || (timed.at(-1)?.at ?? 0) + 10;
  const transcript: TranscriptSegment[] = timed.map((row, index) => ({ start: Math.round(row.at * 100) / 100, end: Math.round((timed[index + 1]?.at ?? end) * 100) / 100, text: row.narration }));
  return { chapters, transcript };
}

const isMp4 = (bytes: Uint8Array) => bytes.length > 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";

export async function publishClass(input: PublishInput) {
  if (!isMp4(input.video)) throw new ClassRoomError("The video must be the MP4 FRAME just generated.");
  if (input.video.length > MAX_VIDEO_BYTES) throw new ClassRoomError("The video is too large to publish (over 1 GB).");
  const { chapters, transcript } = classOutline(input.rows, input.starts, input.duration);
  // A free id: the title as a slug, with -2, -3… if a class by that name already exists.
  const base = slugFor(input.title);
  let id = base;
  for (let n = 2; await stat(classDirectory(id)).then(() => true, () => false); n += 1) {
    if (n > 99) throw new ClassRoomError("Too many classes with this title. Change the title and publish again.");
    id = `${base}-${n}`;
  }
  const directory = classDirectory(id);
  await mkdir(directory, { recursive: true });
  try {
    const temporary = join(directory, "lecture.mp4.uploading");
    await writeFile(temporary, input.video);
    await rename(temporary, join(directory, "lecture.mp4"));
    await writeJson(join(directory, "transcript.json"), transcript);
    // class.json last: the class page only exists once everything it needs is in place.
    await writeJson(join(directory, "class.json"), { title: input.title, subtitle: input.subtitle, educator: "", video: "lecture.mp4", chapters });
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  console.info("Class published", { id, chapters: chapters.length, transcriptLines: transcript.length, megabytes: Math.round(input.video.length / 1e5) / 10, path: "from-pedagogy-render" });
  return { id, url: `/class/${id}`, chapters: chapters.length };
}
