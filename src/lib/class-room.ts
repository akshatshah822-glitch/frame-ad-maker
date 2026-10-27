import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import OpenAI, { toFile } from "openai";
import { parsePedagogyVisual } from "@/lib/pedagogy-visual";

// Two-way class: a lecture video with student doubts that the educator answers after the lecture.
// Everything for one class lives in <project>/classes/<class-id>/:
//   class.json      title, video file name, chapters (start second + title)
//   doubts.json     every doubt and its answer
//   transcript.json what the lecture says, with timestamps (built once, on first use)

const exec = promisify(execFile);

export type ClassChapter = { at: number; title: string };
export type ClassInfo = { id: string; title: string; subtitle?: string; educator?: string; video: string; chapters: ClassChapter[] };
/** One board slide: narration is the English teaching line (shown in the chat and on the video's notes card);
 * spoken is the same line in Hinglish, said by the narrator in the doubts video, like the lecture. spoken is
 * optional: slides saved before it existed are narrated with the English line. */
export type ClassSlide = { narration: string; title: string; visual: string; visualData: string; spoken?: string };
/** question: the doubt restated as one clear English question. notCovered: the part of the doubt this lecture does
 * not teach (answers stay strictly within the lecture). Both optional: answers saved before they existed have neither. */
// questionSpoken: the question in Hinglish for the narrator (optional: older answers get one made before the video).
export type ClassDraft = { answer: string; slides: ClassSlide[]; draftedAt: string; question?: string; notCovered?: string; questionSpoken?: string };
export type ClassAnswer = { text: string; answeredAt: string; aiDrafted: boolean; slides?: ClassSlide[]; question?: string; notCovered?: string; questionSpoken?: string };
export type ClassDoubt = {
  id: string;
  studentId: string;
  studentName: string;
  text: string;
  source: "typed" | "spoken";
  at: number;
  chapter: string;
  createdAt: string;
  draft?: ClassDraft;
  answer?: ClassAnswer;
  /** The student's reaction to the answer. Optional: doubts saved before this existed simply have none. */
  followUp?: { state: "confused" | "clear"; at: string };
};
export type TranscriptSegment = { start: number; end: number; text: string };

export class ClassRoomError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ClassRoomError";
    this.status = status;
  }
}

export const classesDirectory = () => join(process.cwd(), "classes");

export function classDirectory(classId: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(classId)) throw new ClassRoomError("Unknown class.", 404);
  return join(classesDirectory(), classId);
}

export async function readClass(classId: string): Promise<ClassInfo> {
  const raw = await readFile(join(classDirectory(classId), "class.json"), "utf8").catch(() => null);
  if (!raw) throw new ClassRoomError("Unknown class.", 404);
  const info = JSON.parse(raw) as Omit<ClassInfo, "id">;
  return { ...info, id: classId, chapters: [...info.chapters].sort((a, b) => a.at - b.at) };
}

export function classVideoPath(info: ClassInfo) {
  if (!/^[\w.-]+\.mp4$/i.test(info.video)) throw new ClassRoomError("Class video must be an .mp4 file name.", 500);
  return join(classDirectory(info.id), info.video);
}

export function chapterAt(info: ClassInfo, at: number) {
  let current = info.chapters[0]?.title ?? info.title;
  for (const chapter of info.chapters) if (chapter.at <= at + 0.5) current = chapter.title;
  return current;
}

// One write at a time per process, then an atomic rename, so two students sending at once never lose a doubt.
let writeQueue: Promise<unknown> = Promise.resolve();
export function serialised<T>(task: () => Promise<T>) {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => undefined);
  return run;
}

export async function writeJson(path: string, value: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

export async function listDoubts(classId: string): Promise<ClassDoubt[]> {
  const raw = await readFile(join(classDirectory(classId), "doubts.json"), "utf8").catch(() => null);
  return raw ? JSON.parse(raw) as ClassDoubt[] : [];
}

const clean = (value: unknown, limit: number) => (typeof value === "string" ? value : "").replace(/\s+/g, " ").trim().slice(0, limit);

export async function addDoubt(classId: string, input: { studentId?: unknown; studentName?: unknown; text?: unknown; source?: unknown; at?: unknown }) {
  const info = await readClass(classId);
  const studentId = clean(input.studentId, 64);
  const studentName = clean(input.studentName, 40);
  const text = clean(input.text, 1000);
  const at = Number(input.at);
  if (!/^[\w-]{8,64}$/.test(studentId)) throw new ClassRoomError("Missing student id.");
  if (!studentName) throw new ClassRoomError("Please add your first name.");
  if (text.length < 3) throw new ClassRoomError("Please write your doubt.");
  if (!Number.isFinite(at) || at < 0 || at > 6 * 3600) throw new ClassRoomError("Invalid video time.");
  const doubt: ClassDoubt = { id: randomUUID(), studentId, studentName, text, source: input.source === "spoken" ? "spoken" : "typed", at: Math.round(at * 10) / 10, chapter: chapterAt(info, at), createdAt: new Date().toISOString() };
  await serialised(async () => {
    const doubts = await listDoubts(classId);
    doubts.push(doubt);
    await writeJson(join(classDirectory(classId), "doubts.json"), doubts);
  });
  console.info("Class doubt received", { classId, chapter: doubt.chapter, source: doubt.source });
  return doubt;
}

export async function answerDoubt(classId: string, doubtId: string, input: { text?: unknown; aiDrafted?: unknown; slides?: unknown; question?: unknown; notCovered?: unknown; questionSpoken?: unknown }) {
  // One point per line is kept (the tutor answers point by point); spaces inside a line are tidied.
  const text = String(typeof input.text === "string" ? input.text : "").split("\n").map((line) => clean(line, 600)).filter(Boolean).join("\n").slice(0, 3000);
  if (text.length < 2) throw new ClassRoomError("Please write an answer.");
  return serialised(async () => {
    const doubts = await listDoubts(classId);
    const doubt = doubts.find((entry) => entry.id === doubtId);
    if (!doubt) throw new ClassRoomError("Doubt not found.", 404);
    const slides = Array.isArray(input.slides) ? sanitiseSlides(input.slides) : doubt.draft?.slides ?? doubt.answer?.slides;
    const question = clean(input.question, 300);
    const notCovered = clean(input.notCovered, 300);
    const questionSpoken = clean(input.questionSpoken, 300);
    doubt.answer = { text, answeredAt: new Date().toISOString(), aiDrafted: input.aiDrafted === true, ...(slides?.length ? { slides } : {}), ...(question ? { question } : {}), ...(notCovered ? { notCovered } : {}), ...(questionSpoken ? { questionSpoken } : {}) };
    await writeJson(join(classDirectory(classId), "doubts.json"), doubts);
    console.info("Class doubt answered", { classId, aiDrafted: doubt.answer.aiDrafted });
    return doubt;
  });
}

// ---- Lecture transcript (what was being said at each moment) ----

const openai = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
const transcriptBuilds = new Map<string, Promise<TranscriptSegment[]>>();

export async function readTranscript(classId: string): Promise<TranscriptSegment[] | null> {
  const raw = await readFile(join(classDirectory(classId), "transcript.json"), "utf8").catch(() => null);
  return raw ? JSON.parse(raw) as TranscriptSegment[] : null;
}

/** Builds the transcript once from the lecture audio (OpenAI speech-to-text), then reuses it. */
export async function ensureTranscript(classId: string) {
  const existing = await readTranscript(classId);
  if (existing) return existing;
  const running = transcriptBuilds.get(classId);
  if (running) return running;
  const build = (async () => {
    const info = await readClass(classId);
    const directory = classDirectory(classId);
    const audioPath = join(directory, "lecture-audio.mp3");
    const hasAudio = await stat(audioPath).then(() => true, () => false);
    if (!hasAudio) {
      const ffmpeg = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
      await exec(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", classVideoPath(info), "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", audioPath], { timeout: 300_000 });
    }
    const result = await openai().audio.transcriptions.create({
      file: await toFile(await readFile(audioPath), "lecture-audio.mp3"),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    }) as unknown as { segments?: { start: number; end: number; text: string }[] };
    const segments = (result.segments ?? []).map((segment) => ({ start: segment.start, end: segment.end, text: segment.text.trim() }));
    if (!segments.length) throw new ClassRoomError("The lecture transcript came back empty.", 502);
    await mkdir(directory, { recursive: true });
    await writeJson(join(directory, "transcript.json"), segments);
    console.info("Class transcript built", { classId, segments: segments.length, path: "openai-whisper" });
    return segments;
  })();
  transcriptBuilds.set(classId, build);
  try { return await build; } finally { transcriptBuilds.delete(classId); }
}

export function transcriptAround(segments: TranscriptSegment[], at: number, before = 40, after = 10) {
  return segments.filter((segment) => segment.end >= at - before && segment.start <= at + after).map((segment) => segment.text).join(" ").trim();
}

// ---- Student voice doubts and AI-drafted answers ----

export async function transcribeDoubt(audio: Blob, fileName: string) {
  if (audio.size < 500) throw new ClassRoomError("That recording was too short. Please try again.");
  if (audio.size > 10_000_000) throw new ClassRoomError("That recording is too long. Please keep it under a minute.");
  const result = await openai().audio.transcriptions.create({
    file: await toFile(Buffer.from(await audio.arrayBuffer()), fileName),
    model: "gpt-4o-mini-transcribe",
    prompt: "A student's doubt about a lecture. It may be in English, Hindi or Hinglish. Write it exactly as spoken.",
  });
  return result.text.trim();
}

// Board visuals: text/cards/flowchart/bar/counter (the original five, still drawn for answers saved before),
// plus timeline/compare/table/hub/stairs and frame (a still from the lecture), used by the structured answer below.
const ITEM_LIMITS: Record<string, [number, number]> = { timeline: [2, 6], compare: [2, 2], table: [3, 7], hub: [3, 7], stairs: [2, 6] };
// Every answer has the same shape, so every explanation gets a lecture picture, a flowchart, a table and one more diagram.
const EXTRA_KINDS = ["compare", "hub", "timeline", "stairs", "cards"] as const;
const titled = (extra: Record<string, unknown>, required: string[]) => ({
  type: "object", additionalProperties: false, required: ["title", "narration", "spoken", ...required],
  properties: { title: { type: "string" }, narration: { type: "string" }, spoken: { type: "string" }, ...extra },
});
const draftSchema = {
  type: "object",
  additionalProperties: false,
  required: ["question", "question_spoken", "points", "not_covered", "lecture_moment", "flowchart", "diagram", "table"],
  properties: {
    question: { type: "string" },
    points: { type: "array", items: { type: "string" } },
    not_covered: { type: "string" },
    question_spoken: { type: "string" },
    lecture_moment: titled({ time: { type: "string" }, caption: { type: "string" } }, ["time", "caption"]),
    flowchart: titled({ steps: { type: "array", items: { type: "string" } } }, ["steps"]),
    diagram: titled({
      kind: { type: "string", enum: [...EXTRA_KINDS] },
      items: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "detail"], properties: { label: { type: "string" }, detail: { type: "string" } } } },
    }, ["kind", "items"]),
    table: titled({
      columns: { type: "array", items: { type: "string" } },
      rows: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "value"], properties: { label: { type: "string" }, value: { type: "string" } } } },
    }, ["columns", "rows"]),
  },
} as const;

/** "m:ss" or seconds → whole seconds, or null. */
function parseMoment(value: string) {
  const match = /^\s*(\d{1,3}):([0-5]\d)\s*$/.exec(value) ?? /^\s*(\d{1,5})\s*$/.exec(value);
  if (!match) return null;
  return match[2] === undefined ? Number(match[1]) : Number(match[1]) * 60 + Number(match[2]);
}

/** Validates the visuals added for richer explanations; returns cleaned visual_data or null. */
function richVisualData(visual: string, data: string, lectureSeconds: number) {
  if (visual === "frame") {
    const [moment, ...caption] = data.split("=");
    const at = parseMoment(moment ?? "");
    if (at === null || at > lectureSeconds) return null;
    return `${formatTime(at)} = ${clean(caption.join("="), 140)}`.replace(/ = $/, "");
  }
  const limits = ITEM_LIMITS[visual];
  if (!limits) return undefined;
  const items = data.split("|").map((item) => item.trim()).filter(Boolean);
  if (items.length < limits[0] || items.length > limits[1]) return null;
  return items.join(" | ");
}

/** Keeps only slides FRAME can draw; a slide whose visual will not parse becomes a plain text board, and that is logged. */
export function sanitiseSlides(raw: unknown[], lectureSeconds = 6 * 3600): ClassSlide[] {
  const slides: ClassSlide[] = [];
  for (const entry of raw.slice(0, 4)) {
    const value = entry as Record<string, unknown>;
    const narration = clean(value.narration, 600);
    const title = clean(value.title, 100);
    if (!narration || !title) continue;
    const visual = String(value.visual ?? "text");
    const visualData = clean(value.visualData ?? value.visual_data, 400);
    const spokenText = clean(value.spoken, 600);
    const spoken = spokenText ? { spoken: spokenText } : {};
    const rich = richVisualData(visual, visualData, lectureSeconds);
    if (rich !== undefined) {
      if (rich === null) console.warn("Class slide visual", { path: "text-board-fallback", visual });
      slides.push(rich === null ? { narration, title, visual: "text", visualData: "", ...spoken } : { narration, title, visual, visualData: rich, ...spoken });
      continue;
    }
    try {
      const parsed = parsePedagogyVisual(visual, visualData);
      slides.push({ narration, title, visual: parsed.kind, visualData: parsed.kind === "text" ? "" : visualData, ...spoken });
    } catch {
      console.warn("Class slide visual", { path: "text-board-fallback", visual });
      slides.push({ narration, title, visual: "text", visualData: "", ...spoken });
    }
  }
  return slides;
}

type DraftJson = {
  question?: string; question_spoken?: string; points?: unknown[]; not_covered?: string;
  lecture_moment?: { title?: string; narration?: string; spoken?: string; time?: string; caption?: string };
  flowchart?: { title?: string; narration?: string; spoken?: string; steps?: unknown[] };
  diagram?: { title?: string; narration?: string; spoken?: string; kind?: string; items?: { label?: unknown; detail?: unknown }[] };
  table?: { title?: string; narration?: string; spoken?: string; columns?: unknown[]; rows?: { label?: unknown; value?: unknown }[] };
};

const words = (text: string) => new Set(text.toLowerCase().match(/[a-z\u0900-\u097f]{4,}/g) ?? []);

/** The lecture second that best matches the doubt, when the tutor's own pick is unusable: most shared words. */
function bestMoment(segments: TranscriptSegment[], text: string) {
  const wanted = words(text);
  let best: TranscriptSegment | undefined;
  let bestScore = 0;
  for (const segment of segments) {
    let score = 0;
    for (const word of words(segment.text)) if (wanted.has(word)) score += 1;
    if (score > bestScore) { bestScore = score; best = segment; }
  }
  return best && bestScore >= 2 ? best.start : null;
}

/** Turns the tutor's structured answer into board slides: lecture picture, flowchart, one more diagram, table. */
function slidesFromDraft(parsed: DraftJson, segments: TranscriptSegment[], doubt: ClassDoubt, lectureSeconds: number, classId: string) {
  const raw: Record<string, unknown>[] = [];
  const text = (value: unknown, limit = 120) => clean(value, limit).replaceAll("|", "/").replaceAll(">", "→").replaceAll("=", "-");

  const moment = parsed.lecture_moment ?? {};
  const picked = /(\d{1,3}):([0-5]\d)/.exec(String(moment.time ?? ""));
  let at = picked ? Number(picked[1]) * 60 + Number(picked[2]) : null;
  let picturePath = "tutor-picked";
  if (at === null || at > lectureSeconds) {
    at = bestMoment(segments, `${doubt.text} ${parsed.question ?? ""} ${(parsed.points ?? []).join(" ")}`);
    picturePath = "best-matching-moment";
    if (at === null) { at = Math.min(doubt.at, lectureSeconds); picturePath = "doubt-moment"; }
  }
  console.info("Class answer picture", { classId, path: picturePath, at: Math.floor(at) });
  raw.push({ title: moment.title || "From the lecture", narration: moment.narration || `This idea comes from the part of the lecture on ${doubt.chapter}.`, spoken: moment.spoken, visual: "frame", visualData: `${formatTime(at)} = ${text(moment.caption, 140)}` });

  const flow = parsed.flowchart ?? {};
  const steps = (flow.steps ?? []).map((step) => text(step, 80)).filter(Boolean).slice(0, 6);
  if (steps.length >= 2) raw.push({ title: flow.title, narration: flow.narration, spoken: flow.spoken, visual: "flowchart", visualData: steps.join(" > ") });

  const extra = parsed.diagram ?? {};
  const kind = (EXTRA_KINDS as readonly string[]).includes(String(extra.kind)) ? String(extra.kind) : "cards";
  const items = (extra.items ?? []).map((item) => ({ label: text(item.label, 60), detail: text(item.detail, 120).replaceAll(":", " -") })).filter((item) => item.label);
  const limited = kind === "compare" ? items.slice(0, 2) : items.slice(0, kind === "cards" ? 4 : 6);
  if (limited.length >= 2) raw.push({ title: extra.title, narration: extra.narration, spoken: extra.spoken, visual: kind, visualData: limited.map((item, index) => kind === "hub" && index === 0 ? item.label : item.detail ? `${item.label.replaceAll(":", " -")}: ${item.detail}` : item.label.replaceAll(":", " -")).join(" | ") });

  const table = parsed.table ?? {};
  const columns = (table.columns ?? []).map((column) => text(column, 40).replaceAll(":", " -")).filter(Boolean);
  const rows = (table.rows ?? []).map((row) => [text(row.label, 60).replaceAll(":", " -"), text(row.value, 120).replaceAll(":", " -")]).filter(([label, value]) => label && value).slice(0, 6);
  if (rows.length >= 2) raw.push({ title: table.title, narration: table.narration, spoken: table.spoken, visual: "table", visualData: [`${columns[0] || "Point"}: ${columns[1] || "Explanation"}`, ...rows.map(([label, value]) => `${label}: ${value}`)].join(" | ") });

  const slides = sanitiseSlides(raw, lectureSeconds);
  const unspoken = slides.filter((slide) => !slide.spoken).length;
  if (unspoken) console.warn("Class answer narration", { classId, path: "english-narration-fallback", boards: unspoken });
  const missing = ["flowchart", "table"].filter((visual) => !slides.some((slide) => slide.visual === visual));
  if (missing.length) console.warn("Class answer diagrams", { classId, path: "missing-diagram", missing });
  return slides;
}

/** Answers the doubt point by point, in English, with a lecture picture and diagrams; saved on the doubt. */
/** How every spoken line must sound: like this lecture's educator. Shared by the tutor and the pre-video repair. */
export const HINGLISH_RULES = [
  "SPOKEN HINGLISH: spoken lines must sound exactly like this lecture's educator: everyday Hindi sentence structure with English words mixed in, the way Indian teachers speak in class.",
  "Write the Hindi words in Devanagari script and the English words in English letters.",
  "Keep technical, exam and common English words in English, never translated into formal Hindi: write budget (not बजट), canal (not नहर), project (not परियोजना), groundwater, subsidy (not सब्सिडी), policy (not नीति), government (not सरकार), irrigation (not सिंचाई), implementation (not क्रियान्वयन), farmer, crop, water, demand, supply, export, price, India, and similar terms.",
  "About a third or more of the words should be English. No shuddh or formal Hindi. Example: 'Government के पास budget कम था, इसलिए canal projects अधूरे रह गए, और farmers groundwater पर depend करने लगे।'",
].join(" ");

export async function draftAnswer(classId: string, doubtId: string) {
  const info = await readClass(classId);
  const doubt = (await listDoubts(classId)).find((entry) => entry.id === doubtId);
  if (!doubt) throw new ClassRoomError("Doubt not found.", 404);
  const segments = await ensureTranscript(classId);
  const nearby = transcriptAround(segments, doubt.at, 60, 20);
  // Timestamped, so the tutor can point to the exact moment a concept was shown on screen.
  const fullLecture = segments.map((segment) => `[${formatTime(segment.start)}] ${segment.text.trim()}`).join("\n").slice(0, 16_000);
  const lectureSeconds = Math.floor(segments.at(-1)?.end ?? 6 * 3600);
  const response = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 1 }).responses.create({
    model: "gpt-4.1-mini",
    instructions: [
      `You are the tutor for this recorded lecture (${info.subtitle || "competitive exam preparation"}). A student paused the lecture to ask a doubt. Your answer appears instantly in the class chat, with your boards drawn as a picture and diagrams, and may be narrated in a video.`,
      "LANGUAGE: Everything the student reads is in clear, simple, correct English, even if the student or the lecture uses Hindi or Hinglish: question, points, titles, captions, steps, labels, details, table cells and narration. Translate any Hindi ideas from the lecture into English; no Hindi words or Devanagari there. The only exception is each board's spoken field (below), which the narrator says aloud in Hinglish, exactly like this lecture's educator.",
      "SCOPE: Use only what this lecture teaches. Do not add facts, examples, schemes, institutions, cases, names, dates or numbers that are not in the lecture, even if you know them. Within that limit, answer as fully as you can: use the whole lecture, not only the moment the student asked, and connect ideas taught at different times; explain the reasoning, cause and effect, differences and implications that follow directly from what the lecture says; use the lecture's own examples, case studies and PYQs. If the doubt is vague (for example 'I did not understand this'), re-explain from scratch what the educator was teaching at that moment. Never refuse: answer every part the lecture supports.",
      "not_covered: empty string if the lecture fully answers the doubt. Otherwise a short phrase (under 12 words) naming only the part of the doubt this lecture does not teach, for example 'Court action against delayed government projects'. Never answer that part from outside knowledge.",
      "question: the student's doubt restated as one clear English question.",
      "points: 3 to 5 numbered-style points (do not write the numbers), each one short, precise sentence. Point 1 answers the doubt directly. The next points give the reason, the mechanism and an example. The last point is the one-line takeaway the student should remember. No filler, no greetings, do not use the student's name.",
      "lecture_moment: the moment in the lecture that best shows this idea on screen. time is a [m:ss] time copied exactly from the timestamped lecture below (for example 7:26). caption: under 12 words saying what that moment shows.",
      "flowchart: 3 to 6 steps showing the cause-and-effect chain or process that answers the doubt, each step 2 to 6 words.",
      "diagram: one more visual that makes it clearer. kind: compare (exactly 2 items, two sides; detail lists the points separated by '; '), hub (first item is the main idea with empty detail, then 3 to 5 parts), timeline (events in order, label is the time or stage), stairs (stages that build up, 3 to 5), or cards (2 to 4 key ideas). label under 5 words, detail under 15 words.",
      "table: a summary table with exactly 2 columns (short headers) and 3 to 6 rows of precise facts, causes, effects or differences. label under 5 words, value under 15 words.",
      "Each of lecture_moment, flowchart, diagram and table has a title (under 7 words); narration: 1 to 3 natural, grammatical English sentences that teach the point, as a teacher would say them (shown to the student); and spoken: the same teaching point said aloud by the narrator. Neither narration nor spoken ever describes or mentions the slide, table, picture, chart, screen or camera (never 'this table shows', 'ये table दिखाता है', 'यह तालिका दर्शाती है').",
      HINGLISH_RULES,
      "question_spoken: the student's question said aloud in the same Hinglish, for example 'government irrigation projects time पर complete क्यों नहीं करती?'.",
    ].join("\n"),
    input: `Lecture: ${info.title}\nTopic at that moment: ${doubt.chapter}\nThe student asked at ${formatTime(doubt.at)}. What the educator was saying around then: ${nearby || "(not available)"}\n\nWhole lecture with times, for reference:\n${fullLecture}\n\nThe student's doubt: ${doubt.text}`,
    text: { format: { type: "json_schema", name: "class_doubt_answer", strict: true, schema: draftSchema } },
  });
  let parsed: DraftJson;
  try { parsed = JSON.parse(response.output_text) as DraftJson; } catch { throw new ClassRoomError("The tutor's answer came back unreadable.", 502); }
  const points = (parsed.points ?? []).map((point) => clean(point, 400).replace(/^\s*(\d+[.)]|[-•])\s*/, "")).filter(Boolean).slice(0, 5);
  if (!points.length) throw new ClassRoomError("The tutor's answer came back empty.", 502);
  const slides = slidesFromDraft(parsed, segments, doubt, lectureSeconds, classId);
  const question = clean(parsed.question, 300);
  const notCovered = clean(parsed.not_covered, 300);
  const questionSpoken = clean(parsed.question_spoken, 300);
  const draft: ClassDraft = { answer: points.join("\n"), slides, draftedAt: new Date().toISOString(), ...(question ? { question } : {}), ...(notCovered ? { notCovered } : {}), ...(questionSpoken ? { questionSpoken } : {}) };
  await serialised(async () => {
    const doubts = await listDoubts(classId);
    const target = doubts.find((entry) => entry.id === doubtId);
    if (target) { target.draft = draft; await writeJson(join(classDirectory(classId), "doubts.json"), doubts); }
  });
  console.info("Class answer drafted", { classId, slides: slides.map((slide) => slide.visual).join(","), partlyNotCovered: Boolean(draft.notCovered), path: "openai-draft" });
  return draft;
}

export function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Auto mode: the tutor answers each doubt as soon as it is sent. One reply per doubt, even if asked twice.
const replying = new Map<string, Promise<ClassDoubt>>();

export async function autoReply(classId: string, doubtId: string, studentId: string) {
  const doubt = (await listDoubts(classId)).find((entry) => entry.id === doubtId);
  if (!doubt || doubt.studentId !== studentId) throw new ClassRoomError("Doubt not found.", 404);
  if (doubt.answer) return doubt;
  const key = `${classId}/${doubtId}`;
  const existing = replying.get(key);
  if (existing) return existing;
  const task = (async () => {
    const draft = doubt.draft ?? await draftAnswer(classId, doubtId);
    const answered = await answerDoubt(classId, doubtId, { text: draft.answer, aiDrafted: true, slides: draft.slides, question: draft.question, notCovered: draft.notCovered, questionSpoken: draft.questionSpoken });
    console.info("Class doubt reply", { classId, slides: draft.slides.length, path: "ai-instant-reply" });
    return answered;
  })();
  replying.set(key, task);
  try { return await task; } finally { replying.delete(key); }
}

export async function setFollowUp(classId: string, doubtId: string, studentId: string, state: unknown) {
  if (state !== "confused" && state !== "clear") throw new ClassRoomError("Choose Got it or Still confused.");
  return serialised(async () => {
    const doubts = await listDoubts(classId);
    const doubt = doubts.find((entry) => entry.id === doubtId);
    if (!doubt || doubt.studentId !== studentId) throw new ClassRoomError("Doubt not found.", 404);
    if (!doubt.answer) throw new ClassRoomError("Wait for the answer first.");
    doubt.followUp = { state, at: new Date().toISOString() };
    await writeJson(join(classDirectory(classId), "doubts.json"), doubts);
    console.info("Class doubt follow-up", { classId, state });
    return doubt;
  });
}

/** "m:ss = caption" of a frame slide → whole seconds. */
export function frameSeconds(visualData: string) {
  return parseMoment(visualData.split("=")[0] ?? "");
}

/** A still from the lecture video at that second (1280 wide JPEG), made once and kept in classes/<id>/frames/. */
const frameBuilds = new Map<string, Promise<string>>();
export function lectureFrame(classId: string, seconds: number) {
  const at = Math.max(0, Math.floor(seconds));
  const key = `${classId}/${at}`;
  let build = frameBuilds.get(key);
  if (!build) {
    build = (async () => {
      const directory = join(classDirectory(classId), "frames");
      const path = join(directory, `${String(at).padStart(5, "0")}.jpg`);
      if (await stat(path).then(() => true, () => false)) return path;
      await mkdir(directory, { recursive: true });
      const info = await readClass(classId);
      const ffmpeg = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
      const temporary = `${path}.${randomUUID()}.jpg`;
      // +1.5 s lands after the slide transition, when the board for that moment is fully drawn.
      const grab = (offset: number) => exec(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(at + offset), "-i", classVideoPath(info), "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "3", temporary], { timeout: 60_000 });
      await grab(1.5);
      let used = "extracted";
      // Past the last frame ffmpeg writes nothing: take the exact second instead.
      if (!await stat(temporary).then((file) => file.size > 0, () => false)) { await grab(0); used = "extracted-exact-second"; }
      if (!await stat(temporary).then((file) => file.size > 0, () => false)) throw new ClassRoomError("That moment is not in the lecture video.", 404);
      await rename(temporary, path);
      console.info("Class lecture frame", { classId, at, path: used });
      return path;
    })();
    frameBuilds.set(key, build);
    build.catch(() => frameBuilds.delete(key));
  }
  return build;
}

/** The doubts video draws pictures from pedagogy-images/, so the lecture still is copied there under a class prefix. */
export async function lectureFrameForVideo(classId: string, seconds: number) {
  const source = await lectureFrame(classId, seconds);
  const name = `class-${classId}-${String(Math.floor(seconds)).padStart(5, "0")}.jpg`;
  const folder = join(process.cwd(), "pedagogy-images");
  await mkdir(folder, { recursive: true });
  await copyFile(source, join(folder, name));
  return name;
}

const DEVANAGARI = /[\u0900-\u097F]/;
const DESCRIBES_SLIDE = /(तालिका|स्लाइड|दर्शा(ती|ता|ते)|(ये|यह|इस) (table|slide|picture|image|chart|diagram|flowchart|screen)|(table|slide|picture|chart|diagram|screen)\s+(में|पर)?\s*(दिखा|दर्शा|show)|this (table|slide|picture|chart|diagram))/i;

/** Share of English words in a spoken line (Hinglish should be roughly a third or more). */
export function englishShare(line: string) {
  const english = line.match(/[A-Za-z]+/g)?.length ?? 0;
  const hindi = line.match(/[\u0900-\u097F]+/g)?.length ?? 0;
  return english + hindi ? english / (english + hindi) : 0;
}

/** Why a spoken line would sound wrong in the doubts video, or null when it is good Hinglish. */
export function hinglishProblem(line: string) {
  if (!DEVANAGARI.test(line)) return "roman-or-english";
  if (englishShare(line) < 0.2) return "pure-hindi";
  if (DESCRIBES_SLIDE.test(line)) return "describes-slide";
  return null;
}

/**
 * Before the doubts video is narrated, every spoken line must be the lecture's Hinglish: Devanagari Hindi with
 * English terms in English letters, never pure formal Hindi (which makes the narrator voice sound like someone
 * else), never Roman-letter Hindi, never describing the slide. Questions get a Hinglish spoken line too.
 * Bad or missing lines are rewritten from their English meaning and saved back. Logs which path ran.
 */
export async function ensureHinglishSpoken(classId: string, doubtIds: string[]) {
  const doubts = await listDoubts(classId);
  type Target = { doubtId: string; index: number | "question"; english: string; current: string; problem: string };
  const targets: Target[] = [];
  for (const doubt of doubts) {
    if (!doubtIds.includes(doubt.id) || !doubt.answer?.slides?.length) continue;
    const answer = doubt.answer;
    const question = answer.question || doubt.text;
    const questionProblem = answer.questionSpoken ? hinglishProblem(answer.questionSpoken) : "missing";
    if (questionProblem) targets.push({ doubtId: doubt.id, index: "question", english: question, current: answer.questionSpoken ?? "", problem: questionProblem });
    for (const [index, slide] of (answer.slides ?? []).entries()) {
      const problem = slide.spoken ? hinglishProblem(slide.spoken) : "missing";
      if (problem) targets.push({ doubtId: doubt.id, index, english: slide.narration, current: slide.spoken ?? "", problem });
    }
  }
  if (!targets.length) { console.info("Class doubt video narration", { classId, path: "hinglish-ok" }); return; }
  const problems = Object.fromEntries([...new Set(targets.map((target) => target.problem))].map((problem) => [problem, targets.filter((target) => target.problem === problem).length]));
  try {
    const response = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000, maxRetries: 1 }).responses.create({
      model: "gpt-4.1-mini",
      instructions: [
        "You write the spoken narration for a doubt-explainer video in an Indian classroom. For each item, write one spoken line with exactly the meaning of the English line: the same facts, nothing added, nothing removed. Questions stay questions.",
        HINGLISH_RULES,
        "Never describe or mention the slide, table, picture, chart or screen. Fix spelling. Return the lines in the same order, one per item.",
      ].join(" "),
      input: targets.map((target, index) => `${index + 1}. English: ${target.english}${target.current ? `\n   Current spoken line (rewrite it): ${target.current}` : ""}`).join("\n"),
      text: { format: { type: "json_schema", name: "hinglish_lines", strict: true, schema: { type: "object", additionalProperties: false, required: ["lines"], properties: { lines: { type: "array", items: { type: "string" } } } } } },
    });
    const lines = (JSON.parse(response.output_text) as { lines?: unknown[] }).lines ?? [];
    if (lines.length !== targets.length) throw new Error(`expected ${targets.length} lines, got ${lines.length}`);
    await serialised(async () => {
      const latest = await listDoubts(classId);
      let fixed = 0;
      const stillBad: string[] = [];
      targets.forEach((target, index) => {
        const line = clean(lines[index], 600);
        const problem = line ? hinglishProblem(line) : "empty";
        if (problem) { stillBad.push(problem); return; }
        const answer = latest.find((doubt) => doubt.id === target.doubtId)?.answer;
        if (!answer) return;
        if (target.index === "question") answer.questionSpoken = line;
        else if (answer.slides?.[target.index]) answer.slides[target.index].spoken = line;
        fixed += 1;
      });
      await writeJson(join(classDirectory(classId), "doubts.json"), latest);
      console.info("Class doubt video narration", { classId, path: "hinglish-repaired", fixed, of: targets.length, problems });
      // A line that is still not Hinglish is narrated as it was (or in English, for a missing line), never silently.
      if (stillBad.length) console.warn("Class doubt video narration", { classId, path: "hinglish-repair-incomplete", lines: stillBad.length, problems: stillBad });
    });
  } catch (error) {
    console.warn("Class doubt video narration", { classId, path: "hinglish-repair-failed", lines: targets.length, problems, reason: error instanceof Error ? error.message.slice(0, 160) : String(error) });
  }
}
