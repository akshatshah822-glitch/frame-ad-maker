import { mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validatePedagogyRows, type PedagogyBriefInputRow } from "@/lib/pedagogy-brief";
import { reviewPedagogyNarration } from "@/lib/pedagogy-narration";
import { renderPedagogyVideoToFile } from "@/lib/pedagogy-video";
import { classDirectory, ClassRoomError, ensureHinglishSpoken, formatTime, frameSeconds, lectureFrameForVideo, listDoubts, writeJson, type ClassDoubt } from "@/lib/class-room";

// The doubts-explained video: each doubt goes on the board, then its 2–4 explanation slides,
// narrated in the class voice in the lecture's own slide style. Rendered in the background.
// Auto mode: whenever a student presses "Still confused", the video is rebuilt (batched) from every
// doubt still marked confused, and plays on in the same player after the lecture.

export type ClassSession = {
  status: "idle" | "rendering" | "ready" | "failed";
  doubtIds: string[];
  /** Second in the doubt video where each doubt's question slide starts. */
  starts: Record<string, number>;
  updatedAt: string;
  error?: string;
  /** Short label per doubt for the lesson map. Optional: sessions made before this existed show "Doubt N". */
  labels?: Record<string, string>;
  /** When the playable doubt-session.mp4 was finished. Kept while a newer version renders, so students can keep watching. */
  videoAt?: string;
  /** Set only in API responses: a rebuild is waiting to start. */
  queued?: boolean;
};

const sessionFile = (classId: string) => join(classDirectory(classId), "doubt-session.json");
export const sessionVideoPath = (classId: string) => join(classDirectory(classId), "doubt-session.mp4");
const running = new Set<string>();
const waiting = new Map<string, ReturnType<typeof setTimeout>>();
const again = new Set<string>();
const MAX_DOUBTS = 12;

export async function readSession(classId: string): Promise<ClassSession> {
  const raw = await readFile(sessionFile(classId), "utf8").catch(() => null);
  const session = raw ? JSON.parse(raw) as ClassSession : { status: "idle", doubtIds: [], starts: {}, updatedAt: "" } satisfies ClassSession;
  // A render that was interrupted (server restarted) must not look like it is still running.
  if (session.status === "rendering" && !running.has(classId)) return { ...session, status: "failed", error: "The last render was interrupted. Please make the video again." };
  // Sessions saved before videoAt existed: a ready session's video is the one from updatedAt.
  const videoAt = session.videoAt ?? (session.status === "ready" ? session.updatedAt : undefined);
  return { ...session, ...(videoAt ? { videoAt } : {}), queued: waiting.has(classId) || again.has(classId) };
}

/**
 * Builds the doubt video in the lecture's own slide style, so it feels like the same class:
 * each question on a topic board, then the explanation as notes boards and drawn diagrams (cards, flow).
 */
const INFOGRAPHIC: Record<string, string> = { cards: "cards", flowchart: "flow", timeline: "timeline", compare: "compare", table: "table", hub: "hub", stairs: "stairs" };
const MAX_ITEMS: Record<string, number> = { flow: 6, cards: 6, timeline: 6, compare: 2, table: 8, hub: 7, stairs: 6 };

/** "Title: text" (chat format) → "Title = text" (board format), stars removed so they cannot turn into highlights by accident. */
const boardItem = (item: string) => { const clean = item.replaceAll("*", ""); return clean.includes(": ") ? clean.replace(": ", " = ") : clean.replace(":", " = "); };

/** Exported for tests: the video rows (spoken line, board text) for these doubts. */
export function rowsFor(doubts: ClassDoubt[], pictures: Map<string, string>) {
  const rows: PedagogyBriefInputRow[] = [];
  const questionRows = new Map<string, number>();
  let line = 0;
  const push = (questionId: string, fields: Partial<PedagogyBriefInputRow> & { narration: string; board: string }) => {
    line += 1;
    rows.push({ sourceRow: line + 1, questionId, lineNo: String(line), time: formatTime(line), emphasis: "", pauseAfter: "nahi", ...fields } as PedagogyBriefInputRow);
    return line + 1;
  };
  doubts.forEach((doubt, index) => {
    const questionId = `DOUBT-${index + 1}`;
    // The English restatement when the tutor made one (answers saved before have none: the student's own words).
    const asked = doubt.answer?.question || doubt.text;
    const question = asked.length > 220 ? `${asked.slice(0, 217)}…` : asked;
    questionRows.set(doubt.id, push(questionId, {
      layout: "concept", questionText: `Doubt ${index + 1} · ${doubt.studentName} asked at ${formatTime(doubt.at)}`,
      // Hinglish like the lecture when the answer has spoken lines; answers saved before keep the English line.
      narration: doubt.answer?.questionSpoken ? `${doubt.studentName} का doubt है: ${doubt.answer.questionSpoken}` : doubt.answer?.slides?.some((slide) => slide.spoken) ? `${doubt.studentName} ने पूछा है: ${asked}` : `${doubt.studentName} asked: ${asked}`, board: question,
    }));
    const slides = doubt.answer?.slides ?? [];
    slides.forEach((slide, slideIndex) => {
      const pauseAfter = slideIndex === slides.length - 1 ? "haan" : "nahi";
      const picture = pictures.get(`${doubt.id}#${slideIndex}`);
      if (slide.visual === "frame" && picture) {
        const caption = (slide.visualData.split("=").slice(1).join("=").trim() || slide.title).replaceAll("*", "").replaceAll("=", "-");
        push(questionId, { layout: "diagram", questionText: slide.title, diagram: "image", diagramItems: `${picture} = ${caption}`, diagramStep: "1", diagramLabels: "en", narration: slide.spoken || slide.narration, board: slide.narration, pauseAfter });
        return;
      }
      const kind = INFOGRAPHIC[slide.visual];
      if (kind) {
        const raw = kind === "flow" ? slide.visualData.split(/>|→/) : slide.visualData.split("|");
        const items = raw.map((item) => item.trim()).filter(Boolean).map(boardItem).slice(0, MAX_ITEMS[kind]);
        if (items.length) {
          push(questionId, { layout: "diagram", questionText: slide.title, diagram: kind, diagramItems: items.join(" | "), diagramStep: String(items.length), diagramLabels: "en", narration: slide.spoken || slide.narration, board: slide.narration, pauseAfter });
          return;
        }
      }
      // A plain board (also used for numbers): the takeaway written on the notes card.
      const notes = slide.visual === "text" || slide.visual === "frame" || !slide.visualData ? slide.title : `${slide.title}\n${slide.visualData.split("|").map((item) => item.trim()).join("\n")}`;
      push(questionId, { layout: "concept", questionText: slide.title, narration: slide.spoken || slide.narration, board: notes, pauseAfter });
    });
  });
  return { rows, questionRows };
}

/**
 * Auto mode. Called when a student presses "Still confused". Waits a little so several students' presses
 * become one render; if a render is already running, one more follows it. Logs which path ran.
 */
export function scheduleSession(classId: string, delayMs = 15_000) {
  if (!process.env.OPENAI_API_KEY) { console.warn("Class doubt video", { classId, path: "skipped-no-openai-key" }); return; }
  if (running.has(classId)) { again.add(classId); console.info("Class doubt video", { classId, path: "queued-after-current-render" }); return; }
  clearTimeout(waiting.get(classId));
  waiting.set(classId, setTimeout(() => {
    waiting.delete(classId);
    startSession(classId, "confused").catch((error) => console.error("Class doubt video", { classId, path: "auto-start-failed", reason: error instanceof Error ? error.message : String(error) }));
  }, delayMs));
  console.info("Class doubt video", { classId, path: "auto-scheduled", inSeconds: delayMs / 1000 });
}

const label = (doubt: ClassDoubt, index: number) => {
  const text = doubt.text.length > 70 ? `${doubt.text.slice(0, 67)}…` : doubt.text;
  return `Doubt ${index + 1} · ${doubt.studentName}: ${text}`;
};

/** "confused": doubts students still find unclear (auto mode). "all": every answered doubt (educator's button). */
export async function startSession(classId: string, scope: "confused" | "all" = "all") {
  if (running.has(classId)) return readSession(classId);
  const answered = (await listDoubts(classId)).filter((doubt) => doubt.answer?.slides?.length && (scope === "all" || doubt.followUp?.state === "confused"));
  // Newest first when trimming, then lecture order on the board.
  const picked = [...answered].sort((a, b) => (b.followUp?.at ?? b.createdAt).localeCompare(a.followUp?.at ?? a.createdAt)).slice(0, MAX_DOUBTS);
  if (picked.length < answered.length) console.warn("Class doubt video", { classId, path: "trimmed-to-newest", kept: picked.length, of: answered.length });
  let doubts = picked.sort((a, b) => a.at - b.at);
  if (doubts.length) {
    // Every spoken line must be the lecture's Hinglish (one consistent voice); fix bad lines, then re-read the doubts.
    await ensureHinglishSpoken(classId, doubts.map((doubt) => doubt.id));
    const fresh = new Map((await listDoubts(classId)).map((doubt) => [doubt.id, doubt]));
    doubts = doubts.map((doubt) => fresh.get(doubt.id) ?? doubt);
  }
  if (!doubts.length) throw new ClassRoomError(scope === "all" ? "Approve at least one AI-drafted answer first; its board plan becomes the video." : "No doubt is marked Still confused.");
  // Lecture stills for "frame" slides; if one cannot be made, that slide falls back to a notes board (logged).
  const pictures = new Map<string, string>();
  for (const doubt of doubts) for (const [index, slide] of (doubt.answer?.slides ?? []).entries()) {
    const at = slide.visual === "frame" ? frameSeconds(slide.visualData) : null;
    if (at === null) continue;
    try { pictures.set(`${doubt.id}#${index}`, await lectureFrameForVideo(classId, at)); }
    catch (error) { console.warn("Class doubt video picture", { classId, path: "notes-board-fallback", reason: error instanceof Error ? error.message : String(error) }); }
  }
  const { rows: inputs, questionRows } = rowsFor(doubts, pictures);
  const rows = validatePedagogyRows(inputs);
  running.add(classId);
  const previous = await readSession(classId);
  const keep = previous.videoAt ? { starts: previous.starts, labels: previous.labels, videoAt: previous.videoAt } : { starts: {} };
  const session: ClassSession = { status: "rendering", doubtIds: doubts.map((doubt) => doubt.id), ...keep, updatedAt: new Date().toISOString() };
  const labels = Object.fromEntries(doubts.map((doubt, index) => [doubt.id, label(doubt, index)]));
  await writeJson(sessionFile(classId), session);
  console.info("Class doubt video", { classId, doubts: doubts.length, slides: rows.length, path: "rendering" });
  void (async () => {
    const directory = await mkdtemp(join(tmpdir(), "frame-class-doubts-"));
    try {
      const grammarWarnings = await reviewPedagogyNarration(rows);
      if (grammarWarnings.length) console.warn("Class doubt video grammar warnings", { classId, count: grammarWarnings.length });
      const temporary = `${sessionVideoPath(classId)}.rendering.mp4`;
      const result = await renderPedagogyVideoToFile(rows, { directory, outputPath: temporary, pack: true });
      await rename(temporary, sessionVideoPath(classId));
      const timeBySourceRow = new Map(result.qa.timingAudit.map((entry) => [entry.sourceRow, entry.adjustedGeneratedTime]));
      const starts = Object.fromEntries([...questionRows].map(([doubtId, sourceRow]) => [doubtId, Math.round((timeBySourceRow.get(sourceRow) ?? 0) * 10) / 10]));
      const finished = new Date().toISOString();
      await writeJson(sessionFile(classId), { ...session, status: "ready", starts, labels, videoAt: finished, updatedAt: finished } satisfies ClassSession);
      console.info("Class doubt video", { classId, path: "ready", seconds: Math.round(result.qa.duration) });
    } catch (error) {
      console.error("Class doubt video", { classId, path: "failed", reason: error instanceof Error ? error.message : String(error) });
      await writeJson(sessionFile(classId), { ...session, status: "failed", error: "The doubt video could not be made. Check the server log, then try again.", updatedAt: new Date().toISOString() } satisfies ClassSession);
    } finally {
      running.delete(classId);
      await rm(directory, { recursive: true, force: true });
      if (again.delete(classId)) scheduleSession(classId, 1_000);
    }
  })();
  return session;
}
