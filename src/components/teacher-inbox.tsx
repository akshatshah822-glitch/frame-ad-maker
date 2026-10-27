"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./class-room.module.css";

type Chapter = { at: number; title: string };
type Slide = { narration: string; title: string; visual: string; visualData: string };
type Doubt = {
  id: string; studentName: string; text: string; at: number; chapter: string; source: "typed" | "spoken"; createdAt: string; saying?: string;
  draft?: { answer: string; slides: Slide[]; draftedAt: string };
  answer?: { text: string; answeredAt: string; aiDrafted: boolean; slides?: Slide[] };
};
type Session = { status: "idle" | "rendering" | "ready" | "failed"; doubtIds: string[]; starts: Record<string, number>; updatedAt: string; error?: string };
type Filter = "waiting" | "answered" | "all";

const formatTime = (seconds: number) => { const total = Math.max(0, Math.floor(seconds)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`; };
const visualName: Record<string, string> = { text: "Board", cards: "Cards", flowchart: "Flowchart", bar: "Bar chart", counter: "Big number", line: "Line chart", waterfall: "Waterfall", logo: "Logos", picture: "Picture" };

export function TeacherInbox({ classId, title, chapters }: { classId: string; title: string; chapters: Chapter[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const draftingRef = useRef(false);
  const [doubts, setDoubts] = useState<Doubt[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [transcriptReady, setTranscriptReady] = useState(false);
  const [filter, setFilter] = useState<Filter>("waiting");
  const [focus, setFocus] = useState<string>("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, "drafting" | "sending" | undefined>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [approvingAll, setApprovingAll] = useState(false);

  const load = useCallback(async () => {
    const [doubtResponse, sessionResponse] = await Promise.all([
      fetch(`/api/class/${classId}/doubts?view=teacher`, { cache: "no-store" }).catch(() => null),
      fetch(`/api/class/${classId}/session`, { cache: "no-store" }).catch(() => null),
    ]);
    if (doubtResponse?.ok) {
      const result = await doubtResponse.json() as { doubts: Doubt[]; transcriptReady: boolean };
      setDoubts(result.doubts); setTranscriptReady(result.transcriptReady);
    }
    if (sessionResponse?.ok) setSession(((await sessionResponse.json()) as { session: Session }).session);
  }, [classId]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), session?.status === "rendering" ? 5_000 : 15_000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load, session?.status]);

  const draft = useCallback(async (doubt: Doubt) => {
    setBusy((state) => ({ ...state, [doubt.id]: "drafting" })); setErrors((state) => ({ ...state, [doubt.id]: "" }));
    try {
      const response = await fetch(`/api/class/${classId}/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doubtId: doubt.id }) });
      const result = await response.json() as { draft?: Doubt["draft"]; error?: string };
      if (!response.ok || !result.draft) throw new Error(result.error || "The AI draft failed.");
      setDoubts((list) => list.map((entry) => entry.id === doubt.id ? { ...entry, draft: result.draft } : entry));
      setEdits((state) => { const next = { ...state }; delete next[doubt.id]; return next; });
    } catch (reason) {
      setErrors((state) => ({ ...state, [doubt.id]: reason instanceof Error ? reason.message : "The AI draft failed." }));
    } finally { setBusy((state) => ({ ...state, [doubt.id]: undefined })); }
  }, [classId]);

  // Automatic drafting: one waiting doubt at a time, oldest first, skipping any that already failed.
  useEffect(() => {
    if (draftingRef.current) return;
    const next = doubts.find((doubt) => !doubt.answer && !doubt.draft && !errors[doubt.id] && !busy[doubt.id]);
    if (!next) return;
    draftingRef.current = true;
    let started = false;
    const start = window.setTimeout(() => { started = true; void draft(next).finally(() => { draftingRef.current = false; void load(); }); }, 0);
    // Only release the lock if this draft never started; a running draft releases it when it finishes.
    return () => { if (!started) { window.clearTimeout(start); draftingRef.current = false; } };
  }, [doubts, errors, busy, draft, load]);

  async function approve(doubt: Doubt) {
    const text = (edits[doubt.id] ?? doubt.draft?.answer ?? doubt.answer?.text ?? "").trim();
    if (!text) return false;
    setBusy((state) => ({ ...state, [doubt.id]: "sending" })); setErrors((state) => ({ ...state, [doubt.id]: "" }));
    try {
      const response = await fetch(`/api/class/${classId}/doubts/${doubt.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, aiDrafted: Boolean(doubt.draft) && text === doubt.draft?.answer, slides: doubt.draft?.slides ?? doubt.answer?.slides }) });
      const result = await response.json() as { doubt?: Doubt; error?: string };
      if (!response.ok || !result.doubt) throw new Error(result.error || "Could not save the answer.");
      setDoubts((list) => list.map((entry) => entry.id === doubt.id ? { ...entry, ...result.doubt } : entry));
      setEdits((state) => { const next = { ...state }; delete next[doubt.id]; return next; });
      return true;
    } catch (reason) {
      setErrors((state) => ({ ...state, [doubt.id]: reason instanceof Error ? reason.message : "Could not save the answer." }));
      return false;
    } finally { setBusy((state) => ({ ...state, [doubt.id]: undefined })); }
  }

  async function approveAll() {
    setApprovingAll(true);
    for (const doubt of doubts.filter((entry) => !entry.answer && entry.draft)) await approve(doubt);
    setApprovingAll(false);
  }

  async function makeVideo() {
    setNotice("");
    const response = await fetch(`/api/class/${classId}/session`, { method: "POST" }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) as { session?: Session; error?: string } : { error: "Could not reach FRAME." };
    if (!response?.ok || !result.session) { setNotice(result.error || "Could not start the doubt video."); return; }
    setSession(result.session);
  }

  function play(at: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, at - 8);
    void video.play().catch(() => undefined);
  }

  const counts = useMemo(() => {
    const byChapter = new Map<string, { total: number; waiting: number }>();
    for (const doubt of doubts) {
      const entry = byChapter.get(doubt.chapter) ?? { total: 0, waiting: 0 };
      entry.total += 1; if (!doubt.answer) entry.waiting += 1;
      byChapter.set(doubt.chapter, entry);
    }
    return byChapter;
  }, [doubts]);
  const most = Math.max(1, ...[...counts.values()].map((entry) => entry.total));
  const waiting = doubts.filter((doubt) => !doubt.answer).length;
  const readyToApprove = doubts.filter((doubt) => !doubt.answer && doubt.draft).length;
  const inVideo = doubts.filter((doubt) => doubt.answer?.slides?.length).length;
  const videoIsCurrent = session?.status === "ready" && inVideo === session.doubtIds.length;

  const shown = doubts
    .filter((doubt) => filter === "all" || (filter === "waiting" ? !doubt.answer : Boolean(doubt.answer)))
    .filter((doubt) => !focus || doubt.chapter === focus)
    .sort((a, b) => a.at - b.at);
  const groups = shown.reduce<{ chapter: string; items: Doubt[] }[]>((list, doubt) => {
    const last = list.at(-1);
    if (last?.chapter === doubt.chapter) last.items.push(doubt); else list.push({ chapter: doubt.chapter, items: [doubt] });
    return list;
  }, []);

  return <main className={`page ${styles.page}`}>
    <header className="topbar">
      <Link className="wordmark" href="/" aria-label="FRAME home">FRAME<span>•</span></Link>
      <span>Educator doubt inbox</span>
      <Link className="text-link" href={`/class/${classId}`}>Student view <span>↗</span></Link>
    </header>

    <section className={styles.hero}>
      <p className="eyebrow">After the lecture</p>
      <h1>{title}</h1>
      <div className={styles.stats}>
        <p><strong>{doubts.length}</strong> doubts</p>
        <p data-tone="coral"><strong>{waiting}</strong> waiting</p>
        <p><strong>{doubts.length - waiting}</strong> answered</p>
        {readyToApprove ? <button type="button" className="primary-button" onClick={() => void approveAll()} disabled={approvingAll}>{approvingAll ? "Approving…" : `Approve all ${readyToApprove} AI drafts`}</button> : null}
      </div>
      {notice ? <p className={styles.error} role="alert">{notice}</p> : null}
    </section>

    <section className={styles.sessionPanel} aria-label="Doubt-clearing video">
      <div>
        <p className="eyebrow">Doubt-clearing video</p>
        <h2>Every approved doubt on the board, explained with diagrams, in the class voice.</h2>
        <p className={styles.sessionStatus} aria-live="polite">
          {session?.status === "rendering" ? "Making the video… this takes a few minutes. You can keep answering." :
            session?.status === "failed" ? session.error :
            videoIsCurrent ? `Ready. Students can watch it now (${session!.doubtIds.length} ${session!.doubtIds.length === 1 ? "doubt" : "doubts"}).` :
            session?.status === "ready" ? `${inVideo - session.doubtIds.length} newly approved ${inVideo - session.doubtIds.length === 1 ? "doubt is" : "doubts are"} not in the video yet.` :
            inVideo ? `${inVideo} approved ${inVideo === 1 ? "doubt is" : "doubts are"} ready to go in.` : "Approve AI drafts first; their board plans become the video."}
        </p>
        <button type="button" className="primary-button" onClick={() => void makeVideo()} disabled={!inVideo || session?.status === "rendering" || videoIsCurrent}>
          {session?.status === "rendering" ? "Making video…" : session?.status === "ready" ? "Update video" : "Make doubt video"}
        </button>
      </div>
      {session?.status === "ready" ? <video src={`/api/class/${classId}/video?part=doubts&v=${encodeURIComponent(session.updatedAt)}`} controls playsInline preload="metadata" /> : null}
    </section>

    <div className={styles.inboxLayout}>
      <aside className={styles.heatmap} aria-label="Where students got stuck">
        <h2>Where students got stuck</h2>
        <button type="button" data-active={!focus} onClick={() => setFocus("")}>All topics</button>
        {chapters.map((chapter) => {
          const entry = counts.get(chapter.title);
          return <button type="button" key={`${chapter.at}-${chapter.title}`} data-active={focus === chapter.title} onClick={() => setFocus(focus === chapter.title ? "" : chapter.title)} disabled={!entry}>
            <span className={styles.heatLabel}><em>{formatTime(chapter.at)}</em>{chapter.title}</span>
            <span className={styles.heatBar} style={{ width: `${entry ? Math.max(12, (entry.total / most) * 100) : 0}%` }} />
            <b>{entry ? `${entry.total} ${entry.total === 1 ? "doubt" : "doubts"}${entry.waiting ? ` · ${entry.waiting} waiting` : " · all answered"}` : ""}</b>
          </button>;
        })}
      </aside>

      <section className={styles.inbox} aria-label="Doubts">
        <div className={styles.replay}>
          <video ref={videoRef} src={`/api/class/${classId}/video`} controls playsInline preload="metadata" />
          <small>Click a time on any doubt to replay that moment of the lecture.</small>
        </div>
        <div className={styles.tabs} role="tablist" aria-label="Filter doubts">
          {(["waiting", "answered", "all"] as Filter[]).map((option) => <button key={option} type="button" role="tab" aria-selected={filter === option} onClick={() => setFilter(option)}>{option === "waiting" ? `Waiting (${waiting})` : option === "answered" ? `Answered (${doubts.length - waiting})` : `All (${doubts.length})`}</button>)}
        </div>
        {!shown.length ? <p className={styles.empty}>{doubts.length ? "Nothing here. Try another tab." : `No doubts yet. Share the student link: /class/${classId}`}</p> : null}
        {groups.map((group) => <section key={`${group.chapter}-${group.items[0].id}`} className={styles.group}>
          <h3>{group.chapter} <span>{group.items.length} {group.items.length === 1 ? "doubt" : "doubts"}</span></h3>
          {group.items.map((doubt) => {
            const plan = doubt.draft?.slides ?? doubt.answer?.slides ?? [];
            const editing = edits[doubt.id] !== undefined;
            const showReply = !doubt.answer || editing;
            return <article key={doubt.id} className={styles.doubtCard} data-answered={Boolean(doubt.answer)}>
              <header>
                <strong>{doubt.studentName}</strong>
                <button type="button" className={styles.timeChip} onClick={() => play(doubt.at)}>▶ {formatTime(doubt.at)}</button>
                {doubt.source === "spoken" ? <span className={styles.badge}>Spoken</span> : null}
                {session?.starts[doubt.id] !== undefined ? <span className={styles.badge} data-tone="blue">In video</span> : null}
              </header>
              <p className={styles.question}>{doubt.text}</p>
              {doubt.saying && transcriptReady ? <p className={styles.saying}><span>You were saying</span>“{doubt.saying}”</p> : null}
              {doubt.answer && !editing ? <div className={styles.answer}><strong>Your answer{doubt.answer.aiDrafted ? " (AI draft, approved)" : ""}</strong><p>{doubt.answer.text}</p>
                <button type="button" className={styles.linkButton} onClick={() => setEdits((state) => ({ ...state, [doubt.id]: doubt.answer!.text }))}>Edit answer</button></div> : null}
              {showReply ? <div className={styles.reply}>
                {busy[doubt.id] === "drafting" ? <p className={styles.aiNote} aria-live="polite">AI is drafting an answer and a board plan… {transcriptReady ? "" : "The first one takes about a minute while FRAME listens to the lecture."}</p> : null}
                <label className="sr-only" htmlFor={`answer-${doubt.id}`}>Answer for {doubt.studentName}</label>
                <textarea id={`answer-${doubt.id}`} rows={3} value={edits[doubt.id] ?? doubt.draft?.answer ?? ""} placeholder={doubt.draft ? "" : "AI draft will appear here, or write your own answer…"} onChange={(event) => setEdits((state) => ({ ...state, [doubt.id]: event.target.value }))} />
                {plan.length ? <div className={styles.plan}>
                  <strong>Board plan for the doubt video</strong>
                  <ol>{plan.map((slide, index) => <li key={index}><span>{visualName[slide.visual] ?? slide.visual}</span>{slide.title}<small>{slide.visualData}</small></li>)}</ol>
                </div> : null}
                {doubt.draft ? <small className={styles.aiNote}>AI draft from your own lecture. Check it before approving.</small> : null}
                <div className={styles.replyActions}>
                  <button type="button" className={styles.secondaryButton} onClick={() => void draft(doubt)} disabled={Boolean(busy[doubt.id])}>{doubt.draft ? "Redraft" : "Draft with AI"}</button>
                  {editing && doubt.answer ? <button type="button" className={styles.secondaryButton} onClick={() => setEdits((state) => { const next = { ...state }; delete next[doubt.id]; return next; })}>Cancel</button> : null}
                  <button type="button" className="primary-button" onClick={() => void approve(doubt)} disabled={Boolean(busy[doubt.id]) || !(edits[doubt.id] ?? doubt.draft?.answer ?? "").trim()}>{busy[doubt.id] === "sending" ? "Sending…" : "Approve & send"}</button>
                </div>
                {errors[doubt.id] ? <p className={styles.error} role="alert">{errors[doubt.id]}</p> : null}
              </div> : null}
            </article>;
          })}
        </section>)}
      </section>
    </div>
  </main>;
}
