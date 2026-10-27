"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import styles from "./class-room.module.css";
import { DoubtBoards, type BoardSlide } from "./doubt-board";

type Chapter = { at: number; title: string };
type Doubt = { id: string; text: string; at: number; chapter: string; source: "typed" | "spoken"; createdAt: string; answer?: { text: string; answeredAt: string; aiDrafted?: boolean; slides?: BoardSlide[]; notCovered?: string }; followUp?: { state: "confused" | "clear"; at: string } };
type Student = { id: string; name: string };
type Session = { status: string; starts: Record<string, number>; updatedAt: string; labels?: Record<string, string>; videoAt?: string; queued?: boolean };

const STORAGE_KEY = "frame-class-student";
const formatTime = (seconds: number) => { const total = Math.max(0, Math.floor(seconds)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`; };
const chapterAt = (chapters: Chapter[], at: number) => chapters.reduce((current, chapter) => chapter.at <= at + 0.5 ? chapter : current, chapters[0]);

// The student's first name and id live in this browser only (localStorage), read without a render loop.
const STUDENT_EVENT = "frame-class-student-change";
function subscribeStudent(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(STUDENT_EVENT, onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener(STUDENT_EVENT, onChange); };
}
// crypto.randomUUID only exists on https or localhost; the office-network http link needs this fallback.
function newStudentId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  console.info("Student id", { path: "getRandomValues-fallback" });
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function storedStudent() { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } }
function parseStudent(raw: string | null): Student | null {
  try { const value = JSON.parse(raw ?? "null") as Student | null; return value?.id && value?.name ? value : null; } catch { return null; }
}

export function ClassPlayer({ classId, title, subtitle, educator, chapters }: { classId: string; title: string; subtitle: string; educator: string; chapters: Chapter[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [session, setSession] = useState<Session | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const storedRaw = useSyncExternalStore(subscribeStudent, storedStudent, () => null);
  const [sessionStudent, setSessionStudent] = useState<Student | null>(null);
  const student = useMemo(() => parseStudent(storedRaw) ?? sessionStudent, [storedRaw, sessionStudent]);
  const [nameDraft, setNameDraft] = useState("");
  const [now, setNow] = useState(0);
  const [askAt, setAskAt] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [source, setSource] = useState<"typed" | "spoken">("typed");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [doubts, setDoubts] = useState<Doubt[]>([]);
  // One player: the lecture, then "Doubts explained" right after it.
  const [part, setPart] = useState<"lecture" | "doubts">("lecture");
  const [doubtsVersion, setDoubtsVersion] = useState("");
  const [doubtsNow, setDoubtsNow] = useState(0);
  const lectureTimeRef = useRef(0);
  const pendingSeekRef = useRef<number | null>(null);
  const replyingRef = useRef(new Set<string>());
  const [replying, setReplying] = useState<string[]>([]);
  const [replyErrors, setReplyErrors] = useState<Record<string, string>>({});
  const [followBusy, setFollowBusy] = useState("");

  const mergeDoubt = useCallback((doubt: Doubt) => setDoubts((previous) => previous.some((entry) => entry.id === doubt.id) ? previous.map((entry) => entry.id === doubt.id ? doubt : entry) : [...previous, doubt]), []);

  // Auto mode: the tutor answers each doubt as soon as it is sent.
  const requestReply = useCallback(async (doubtId: string) => {
    if (!student || replyingRef.current.has(doubtId)) return;
    replyingRef.current.add(doubtId);
    setReplying([...replyingRef.current]);
    setReplyErrors((previous) => { const next = { ...previous }; delete next[doubtId]; return next; });
    try {
      const response = await fetch(`/api/class/${classId}/doubts/${doubtId}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: student.id }) });
      const result = await response.json() as { doubt?: Doubt; error?: string };
      if (!response.ok || !result.doubt) throw new Error(result.error || "The tutor could not answer just now.");
      mergeDoubt(result.doubt);
    } catch (reason) {
      setReplyErrors((previous) => ({ ...previous, [doubtId]: reason instanceof Error ? reason.message : "The tutor could not answer just now." }));
    } finally {
      replyingRef.current.delete(doubtId);
      setReplying([...replyingRef.current]);
    }
  }, [classId, student, mergeDoubt]);

  const loadDoubts = useCallback(async () => {
    if (!student) return;
    const response = await fetch(`/api/class/${classId}/doubts?studentId=${encodeURIComponent(student.id)}`, { cache: "no-store" }).catch(() => null);
    if (response?.ok) setDoubts(((await response.json()) as { doubts: Doubt[] }).doubts);
    const sessionResponse = await fetch(`/api/class/${classId}/session`, { cache: "no-store" }).catch(() => null);
    if (sessionResponse?.ok) setSession(((await sessionResponse.json()) as { session: Session }).session);
  }, [classId, student]);

  // Faster polling only while a doubts video is being made for a "Still confused" doubt.
  const videoBusy = session?.status === "rendering" || Boolean(session?.queued);
  useEffect(() => {
    const first = window.setTimeout(() => void loadDoubts(), 0);
    const timer = window.setInterval(() => void loadDoubts(), videoBusy ? 5_000 : 15_000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [loadDoubts, videoBusy]);

  // A doubt left without an answer (page closed mid-reply, or sent before auto mode) gets one now.
  const unanswered = doubts.filter((doubt) => !doubt.answer && !replyErrors[doubt.id]).map((doubt) => doubt.id).join(",");
  useEffect(() => {
    if (!unanswered) return;
    const timer = window.setTimeout(() => unanswered.split(",").forEach((id) => void requestReply(id)), 0);
    return () => window.clearTimeout(timer);
  }, [unanswered, requestReply]);

  const current = useMemo(() => chapterAt(chapters, now), [chapters, now]);
  const explained = useMemo(() => Object.entries(session?.videoAt ? session.starts : {}).sort((a, b) => a[1] - b[1])
    .map(([id, start], index) => ({ id, start, label: session?.labels?.[id] ?? `Doubt ${index + 1}` })), [session]);
  const currentExplained = explained.reduce<(typeof explained)[number] | undefined>((found, entry) => entry.start <= doubtsNow + 0.5 ? entry : found, undefined);
  const askMoment = askAt ?? now;
  const askChapter = chapterAt(chapters, askMoment);

  function playAt(at: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = at;
    void video.play().catch(() => undefined);
  }

  function seek(at: number) {
    if (part === "lecture") { playAt(at); return; }
    pendingSeekRef.current = at;
    setPart("lecture");
  }

  function watchExplanation(at: number) {
    if (!session?.videoAt) return;
    videoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (part === "doubts" && doubtsVersion === session.videoAt) { playAt(at); return; }
    pendingSeekRef.current = at;
    setDoubtsVersion(session.videoAt);
    setPart("doubts");
  }

  function beginAsking() {
    if (askAt !== null) return;
    const video = videoRef.current;
    setAskAt(part === "lecture" && video ? video.currentTime : lectureTimeRef.current);
    video?.pause();
  }

  async function sendFollowUp(doubtId: string, state: "confused" | "clear") {
    if (!student || followBusy) return;
    setFollowBusy(doubtId); setError("");
    try {
      const response = await fetch(`/api/class/${classId}/doubts/${doubtId}/followup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: student.id, state }) });
      const result = await response.json() as { doubt?: Doubt; session?: Session; error?: string };
      if (!response.ok || !result.doubt) throw new Error(result.error || "Could not save that.");
      mergeDoubt(result.doubt);
      if (result.session) setSession(result.session);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save that.");
    } finally { setFollowBusy(""); }
  }

  function saveName(event: FormEvent) {
    event.preventDefault();
    const name = nameDraft.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!name) return;
    const next = { id: newStudentId(), name };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); window.dispatchEvent(new Event(STUDENT_EVENT)); } catch { /* storage blocked: the class still works for this visit */ }
    setSessionStudent(next);
  }

  async function toggleRecording() {
    setError("");
    if (recording) { recorderRef.current?.stop(); return; }
    beginAsking();
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { setError("Microphone access was blocked. You can type your doubt instead."); return; }
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      setRecording(false);
      setTranscribing(true);
      try {
        const form = new FormData();
        form.set("audio", new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        const response = await fetch("/api/class/transcribe", { method: "POST", body: form });
        const result = await response.json() as { text?: string; error?: string };
        if (!response.ok || !result.text) throw new Error(result.error || "Could not understand the recording.");
        setText((previous) => [previous.trim(), result.text].filter(Boolean).join(" "));
        setSource("spoken");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not understand the recording. Please type your doubt.");
      } finally { setTranscribing(false); }
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  }

  async function sendDoubt(event: FormEvent) {
    event.preventDefault();
    if (!student || text.trim().length < 3 || sending) return;
    setSending(true); setError("");
    try {
      const response = await fetch(`/api/class/${classId}/doubts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: student.id, studentName: student.name, text, source, at: askMoment }) });
      const result = await response.json() as { doubt?: Doubt; error?: string };
      if (!response.ok || !result.doubt) throw new Error(result.error || "Could not send your doubt.");
      mergeDoubt(result.doubt);
      setText(""); setSource("typed"); setAskAt(null);
      void requestReply(result.doubt.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send your doubt.");
    } finally { setSending(false); }
  }

  const answered = doubts.filter((doubt) => doubt.answer).length;

  return <main className={`page ${styles.page}`}>
    <header className="topbar">
      <Link className="wordmark" href="/" aria-label="FRAME home">FRAME<span>•</span></Link>
      <span>Live doubts class</span>
      <span className={styles.topbarNote}>{educator ? `Educator: ${educator}` : ""}</span>
    </header>

    <section className={styles.hero}>
      <p className="eyebrow">{subtitle || "Lecture"}</p>
      <h1>{title}</h1>
      <p>Pause anywhere and ask. The tutor answers from this lecture straight away, with pictures from the lecture, infographics and diagrams. Still confused? It explains again in this same video, right after the lecture.</p>
    </section>

    <div className={styles.classLayout}>
      <section className={styles.stage} aria-label="Lecture">
        <video ref={videoRef} className={styles.video} src={part === "lecture" ? `/api/class/${classId}/video` : `/api/class/${classId}/video?part=doubts&v=${encodeURIComponent(doubtsVersion)}`} controls playsInline preload="metadata"
          onLoadedMetadata={(event) => { const at = pendingSeekRef.current; if (at === null) return; pendingSeekRef.current = null; event.currentTarget.currentTime = at; void event.currentTarget.play().catch(() => undefined); }}
          onTimeUpdate={(event) => { const t = event.currentTarget.currentTime; if (part === "lecture") { lectureTimeRef.current = t; setNow(t); } else setDoubtsNow(t); }}
          onEnded={() => { if (part === "lecture" && session?.videoAt) watchExplanation(0); }} />
        {part === "lecture"
          ? <div className={styles.nowPlaying}><span>Now</span><strong>{current?.title}</strong><em>{formatTime(now)}</em></div>
          : <div className={styles.nowPlaying}><span>Doubts explained</span><strong>{currentExplained?.label ?? "Your class's doubts"}</strong><button type="button" className={styles.linkButton} onClick={() => seek(lectureTimeRef.current)}>Back to lecture</button></div>}
        <ol className={styles.lessonMap} aria-label="Lesson map">
          {chapters.map((chapter) => <li key={`${chapter.at}-${chapter.title}`}>
            <button type="button" data-current={part === "lecture" && chapter === current} onClick={() => seek(chapter.at)}><em>{formatTime(chapter.at)}</em>{chapter.title}</button>
          </li>)}
        </ol>
        {explained.length ? <section className={styles.sessionSection} aria-label="Doubts explained">
          <p className="eyebrow">Plays right after the lecture</p>
          <h2>Doubts explained</h2>
          <p>{videoBusy ? "Adding the latest Still confused doubts… this list updates when the new version is ready." : "Doubts students were still confused about, explained again on the board."}</p>
          <ol className={styles.lessonMap}>
            {explained.map((entry) => <li key={entry.id}>
              <button type="button" data-current={part === "doubts" && entry === currentExplained} onClick={() => watchExplanation(entry.start)}><em>{formatTime(entry.start)}</em>{entry.label}</button>
            </li>)}
          </ol>
        </section> : null}
      </section>

      <aside className={styles.panel} aria-label="Ask a doubt">
        {!student ? <form className={styles.nameForm} onSubmit={saveName}>
          <p className="eyebrow">Before you start</p>
          <h2>What should your educator call you?</h2>
          <label className="sr-only" htmlFor="student-name">First name</label>
          <input id="student-name" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} placeholder="First name" maxLength={40} autoComplete="given-name" />
          <button className="primary-button" type="submit" disabled={!nameDraft.trim()}>Join class</button>
          <small>Only your first name and your doubts are saved.</small>
        </form> : <>
          <form className={styles.askForm} onSubmit={sendDoubt}>
            <div className={styles.askHeader}><h2>Ask a doubt</h2><span>Hi, {student.name}</span></div>
            <p className={styles.moment} aria-live="polite"><span>At {formatTime(askMoment)}</span>{askChapter?.title}</p>
            <label className="sr-only" htmlFor="doubt-text">Your doubt</label>
            <textarea id="doubt-text" value={text} onFocus={beginAsking} onChange={(event) => { setText(event.target.value); if (!event.target.value) setSource("typed"); }} placeholder="Type your doubt in English, Hindi or Hinglish…" rows={4} maxLength={1000} />
            <div className={styles.askActions}>
              <button type="button" className={styles.micButton} data-recording={recording} onClick={() => void toggleRecording()} disabled={transcribing} aria-pressed={recording}>
                <span aria-hidden="true">{recording ? "■" : "🎙"}</span>{recording ? "Stop" : transcribing ? "Writing it down…" : "Speak"}
              </button>
              <button className="primary-button" type="submit" disabled={sending || text.trim().length < 3}>{sending ? "Sending…" : "Ask Tutor"}</button>
            </div>
            {askAt !== null ? <button type="button" className={styles.resume} onClick={() => { setAskAt(null); setText(""); void videoRef.current?.play().catch(() => undefined); }}>Cancel and keep watching</button> : null}
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
          </form>

          <section className={styles.myDoubts} aria-label="Your doubts">
            <h3>Your doubts <span>{answered}/{doubts.length} answered</span></h3>
            {!doubts.length ? <p className={styles.empty}>No doubts yet. Pause the lecture anytime and ask.</p> : null}
            <ul>
              {[...doubts].reverse().map((doubt) => <li key={doubt.id} data-answered={Boolean(doubt.answer)}>
                <button type="button" className={styles.timeChip} onClick={() => seek(doubt.at)}>{formatTime(doubt.at)} · {doubt.chapter}</button>
                <p>{doubt.text}</p>
                {doubt.answer ? <div className={styles.answer}>
                  <strong>{doubt.answer.aiDrafted === false ? "Educator's answer" : "Tutor · from this lecture"}</strong>
                  {/* Point-by-point answers come one point per line; older answers are a single paragraph. */}
                  {doubt.answer.text.includes("\n")
                    ? <ol className={styles.points}>{doubt.answer.text.split("\n").map((point, index) => <li key={index}>{point}</li>)}</ol>
                    : <p>{doubt.answer.text}</p>}
                  {doubt.answer.notCovered ? <p className={styles.notCovered}><b>Not covered in this lecture:</b> {doubt.answer.notCovered.replace(/^not covered in this lecture:?\s*/i, "")}</p> : null}
                  <DoubtBoards slides={doubt.answer.slides ?? []} classId={classId} onSeek={seek} />
                  <FollowUp doubt={doubt} session={session} busy={followBusy === doubt.id} onChoose={(state) => void sendFollowUp(doubt.id, state)} onWatch={watchExplanation} />
                </div> : replyErrors[doubt.id]
                  ? <p className={styles.error} role="alert">{replyErrors[doubt.id]} <button type="button" className={styles.linkButton} onClick={() => void requestReply(doubt.id)}>Try again</button></p>
                  : <p className={styles.typing} aria-live="polite"><span aria-hidden="true"><i /><i /><i /></span>{replying.includes(doubt.id) ? "Tutor is answering from the lecture…" : "Getting your answer…"}</p>}
              </li>)}
            </ul>
          </section>
        </>}
      </aside>
    </div>
  </main>;
}

function FollowUp({ doubt, session, busy, onChoose, onWatch }: { doubt: Doubt; session: Session | null; busy: boolean; onChoose: (state: "confused" | "clear") => void; onWatch: (at: number) => void }) {
  const start = session?.videoAt ? session.starts[doubt.id] : undefined;
  if (doubt.followUp?.state === "clear") return <p className={styles.followNote}>✓ Got it <button type="button" className={styles.linkButton} disabled={busy} onClick={() => onChoose("confused")}>Still confused?</button></p>;
  if (doubt.followUp?.state === "confused") {
    if (start !== undefined) return <button type="button" className={styles.watchButton} onClick={() => onWatch(start)}>▶ Watch explanation</button>;
    if (session?.status === "rendering" || session?.queued) return <p className={styles.followNote}>Adding this to the doubts video, explained again on the board. It plays right after the lecture; about a minute.</p>;
    if (session?.status === "failed") return <p className={styles.followNote}>The doubts video could not be made. <button type="button" className={styles.linkButton} disabled={busy} onClick={() => onChoose("confused")}>Try again</button></p>;
    return <p className={styles.followNote}>Queued for the doubts video.</p>;
  }
  return <div className={styles.followActions}>
    <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => onChoose("clear")}>Got it</button>
    <button type="button" className={styles.watchButton} disabled={busy} onClick={() => onChoose("confused")}>Still confused</button>
  </div>;
}
