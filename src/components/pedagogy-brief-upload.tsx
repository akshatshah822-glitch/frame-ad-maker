"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { readJsonResponse } from "@/lib/read-json-response";
import { readPedagogyPreviewStream, type PedagogyPreviewProgress, type PedagogyPreviewResult } from "@/lib/pedagogy-preview-stream";

type PedagogyRow = PedagogyPreviewResult["rows"][number];
type TimingAuditRow = PedagogyPreviewResult["timingAudit"][number];
type RenderErrorResponse = { error?: string; code?: string; sourceRow?: number | null };

function diagnosticFrom(reason: unknown, fallback: string, fallbackCode: string) {
  const detail = reason as { message?: unknown; code?: unknown; sourceRow?: unknown };
  return {
    error: typeof detail?.message === "string" ? detail.message : fallback,
    code: typeof detail?.code === "string" ? detail.code : fallbackCode,
    sourceRow: typeof detail?.sourceRow === "number" ? detail.sourceRow : null,
  };
}

function reviewStatus(progress: PedagogyPreviewProgress | null) {
  if (!progress || progress.phase === "checking-grammar") return "Checking grammar before narration measurement… 0%";
  if (progress.phase === "building-timeline") return "Building adjusted timeline… 100%";
  const percent = Math.round(progress.completed / progress.total * 100);
  return `Measuring narration: ${progress.completed} of ${progress.total} (${percent}%)`;
}

export function PedagogyBriefUpload() {
  const [mode, setMode] = useState<"manual" | "pedagogy">("pedagogy");
  const [rows, setRows] = useState<PedagogyRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [errorSourceRow, setErrorSourceRow] = useState<number | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewProgress, setReviewProgress] = useState<PedagogyPreviewProgress | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [timingAudit, setTimingAudit] = useState<TimingAuditRow[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [packNarration, setPackNarration] = useState(false);
  // Publish as two-way class: the exact video, timings and rows of the render the educator just watched.
  const videoBlobRef = useRef<Blob | null>(null);
  const [renderedAudit, setRenderedAudit] = useState<{ sourceRow: number; adjustedGeneratedTime: number }[]>([]);
  const [renderedDuration, setRenderedDuration] = useState(0);
  const [classTitle, setClassTitle] = useState("");
  const [classSubtitle, setClassSubtitle] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{ id: string; url: string; chapters: number } | null>(null);
  const [publishError, setPublishError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoUrlRef = useRef("");
  useEffect(() => () => { if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current); }, []);

  // From a YouTube class: FRAME writes the sheet, then reviews it exactly like an uploaded one.
  const [ytLink, setYtLink] = useState("");
  const [ytVideo, setYtVideo] = useState<{ title: string; durationSeconds: number; path: string; lines: number } | null>(null);
  const [ytPaste, setYtPaste] = useState("");
  const [ytShowPaste, setYtShowPaste] = useState(false);
  const [ytFile, setYtFile] = useState<File | null>(null);
  const [ytFrom, setYtFrom] = useState(0);
  const [ytTo, setYtTo] = useState(60);
  const [ytTarget, setYtTarget] = useState(20);
  const [ytBusy, setYtBusy] = useState("");
  const [ytError, setYtError] = useState("");
  const [ytSheet, setYtSheet] = useState<{ url: string; name: string; writer: string; concepts: number; lines: number; fixes: string[] } | null>(null);

  async function youtubeCall(action: "load" | "write") {
    const form = new FormData();
    form.set("action", action); form.set("link", ytLink); form.set("transcript", ytShowPaste ? ytPaste : "");
    form.set("fromMinute", String(ytFrom)); form.set("toMinute", String(ytTo)); form.set("targetMinutes", String(ytTarget)); form.set("title", ytVideo?.title ?? "");
    if (ytShowPaste && ytFile && !ytPaste.trim()) form.set("classFile", ytFile, ytFile.name);
    const response = await fetch("/api/question/pedagogy/from-youtube", { method: "POST", body: form });
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw Object.assign(new Error(typeof result.error === "string" ? result.error : "FRAME could not read this class."), { code: result.code });
    return result;
  }

  async function loadYoutube() {
    setYtBusy("Reading the class transcript…"); setYtError(""); setYtVideo(null); setYtSheet(null);
    try {
      const result = await youtubeCall("load");
      const minutes = Math.ceil(Number(result.durationSeconds) / 60);
      setYtVideo({ title: String(result.title || ""), durationSeconds: Number(result.durationSeconds), path: String(result.path), lines: Number(result.lines) });
      setYtFrom(0); setYtTo(Math.min(minutes, 60));
    } catch (reason) {
      const code = (reason as { code?: string }).code ?? "";
      setYtError(reason instanceof Error ? reason.message : "FRAME could not read this class.");
      if (code.startsWith("YOUTUBE_") && code !== "YOUTUBE_LINK_INVALID") setYtShowPaste(true);
    } finally { setYtBusy(""); }
  }

  async function writeYoutubeSheet() {
    setYtBusy("Writing the sheet from the class (this can take a few minutes)…"); setYtError(""); setYtSheet(null);
    try {
      const result = await youtubeCall("write");
      const bytes = Uint8Array.from(atob(String(result.sheet)), (char) => char.charCodeAt(0));
      const file = new File([bytes], String(result.fileName), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      setYtSheet({ url: URL.createObjectURL(file), name: file.name, writer: String(result.writer), concepts: Number(result.concepts), lines: Number(result.lines), fixes: Array.isArray(result.fixes) ? result.fixes.map(String) : [] });
      await reviewBrief(file);
      if (ytVideo?.title) setClassTitle(ytVideo.title);
    } catch (reason) {
      setYtError(reason instanceof Error ? reason.message : "The sheet could not be written.");
    } finally { setYtBusy(""); }
  }

  async function uploadBrief(event: ChangeEvent<HTMLInputElement>) {
    await reviewBrief(event.target.files?.[0]);
  }

  async function reviewBrief(file: File | undefined) {
    setRows([]); setWarnings([]); setTimingAudit([]); setError(""); setErrorCode(""); setErrorSourceRow(null); setReviewProgress(null);
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = ""; setVideoUrl("");
    videoBlobRef.current = null; setRenderedAudit([]); setRenderedDuration(0); setPublished(null); setPublishError("");
    if (file) setClassTitle(file.name.replace(/\.xlsx$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim());
    if (!file) { setFileName(""); return; }
    setFileName(file.name); setIsReviewing(true); setReviewProgress({ type: "progress", phase: "checking-grammar", completed: 0, total: 0 });
    try {
      const formData = new FormData(); formData.set("brief", file); formData.set("pack", packNarration ? "true" : "false");
      const response = await fetch("/api/question/pedagogy/preview", { method: "POST", body: formData });
      const result = await readPedagogyPreviewStream(response, setReviewProgress);
      if (!response.ok || !result?.rows) throw Object.assign(new Error(result?.error || "The pedagogy brief could not be reviewed."), { code: result?.code, sourceRow: result?.sourceRow });
      setRows(result.rows); setWarnings([...(result.warnings ?? []), ...(result.grammarWarnings ?? [])]);
      setTimingAudit(result.timingAudit ?? []);
    } catch (reason) {
      const diagnostic = diagnosticFrom(reason, "The pedagogy brief could not be reviewed.", "PEDAGOGY_PREVIEW_FAILED");
      setError(diagnostic.error); setErrorCode(diagnostic.code); setErrorSourceRow(diagnostic.sourceRow);
    } finally { setIsReviewing(false); }
  }

  async function renderVideo() {
    if (!rows.length || isRendering) return;
    setError(""); setErrorCode(""); setErrorSourceRow(null); setIsRendering(true);
    try {
      const response = await fetch("/api/question/pedagogy/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows, pack: packNarration }) });
      if (!response.ok) {
        let result: RenderErrorResponse;
        try {
          result = await readJsonResponse<RenderErrorResponse>(response);
        } catch (reason) {
          if (response.status === 422) throw new Error("Render failed with HTTP 422, but the server returned no diagnostic details.");
          throw reason;
        }
        if (result.error) throw Object.assign(new Error(result.error), { code: result.code, sourceRow: result.sourceRow });
        if (response.status === 422) throw new Error("Render failed with HTTP 422, but the server returned no diagnostic details.");
        throw new Error("The pedagogy video could not be generated.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = url; setVideoUrl(url);
      videoBlobRef.current = blob; setPublished(null); setPublishError("");
      // The final timings of this exact render; if the header is missing, the preview's audit is used (logged).
      try {
        const qa = JSON.parse(response.headers.get("X-Frame-Pedagogy-QA") ?? "null") as { timingAudit?: { sourceRow: number; adjustedGeneratedTime: number }[]; duration?: number } | null;
        if (!qa?.timingAudit?.length) throw new Error("no timing audit");
        setRenderedAudit(qa.timingAudit.map((entry) => ({ sourceRow: entry.sourceRow, adjustedGeneratedTime: entry.adjustedGeneratedTime })));
        setRenderedDuration(Number(qa.duration) || 0);
      } catch {
        console.info("Class publish timings", { path: "preview-audit-fallback" });
        setRenderedAudit(timingAudit.map((entry) => ({ sourceRow: entry.sourceRow, adjustedGeneratedTime: entry.adjustedGeneratedTime })));
        setRenderedDuration(0);
      }
    } catch (reason) {
      const diagnostic = diagnosticFrom(reason, "The pedagogy video could not be generated.", "PEDAGOGY_RENDER_FAILED");
      setError(diagnostic.error); setErrorCode(diagnostic.code); setErrorSourceRow(diagnostic.sourceRow);
    }
    finally { setIsRendering(false); }
  }

  async function publishClass() {
    const video = videoBlobRef.current;
    if (!video || publishing || classTitle.trim().length < 2) return;
    setPublishing(true); setPublishError("");
    try {
      const form = new FormData();
      form.set("video", video, "lecture.mp4");
      form.set("title", classTitle); form.set("subtitle", classSubtitle);
      form.set("rows", JSON.stringify(rows.map((row) => ({ sourceRow: row.sourceRow, questionId: row.questionId, narration: row.narration, effectiveQuestionText: row.effectiveQuestionText, effectiveBoard: row.effectiveBoard }))));
      form.set("audit", JSON.stringify(renderedAudit));
      form.set("duration", String(renderedDuration));
      const response = await fetch("/api/class/publish", { method: "POST", body: form });
      const result = await response.json().catch(() => ({})) as { id?: string; url?: string; chapters?: number; error?: string };
      if (!response.ok || !result.url || !result.id) throw new Error(result.error || "The class could not be published.");
      setPublished({ id: result.id, url: result.url, chapters: result.chapters ?? 0 });
    } catch (reason) {
      setPublishError(reason instanceof Error ? reason.message : "The class could not be published.");
    } finally { setPublishing(false); }
  }

  return <section className="pedagogy-workspace" aria-label="Exam question video input">
    <div className="pedagogy-mode-tabs" role="tablist" aria-label="Input mode">
      <button type="button" role="tab" aria-selected={mode === "manual"} onClick={() => setMode("manual")}>Manual question entry</button>
      <button type="button" role="tab" aria-selected={mode === "pedagogy"} onClick={() => setMode("pedagogy")}>Pedagogy Brief Upload</button>
    </div>
    {mode === "manual" ? <section className="pedagogy-manual" role="tabpanel"><p className="eyebrow">Existing route</p><h2>Manual question generation stays available.</h2><p>This upload path does not replace or change the existing manual `POST /api/question/generate` and `POST /api/question/render` workflow.</p></section> : <section className="pedagogy-upload" role="tabpanel">
      <div className="pedagogy-upload-heading"><div><p className="eyebrow">Step 1</p><h2>Upload the teaching plan.</h2></div><p>First worksheet only. Required: question_id, line_no, time, sir_ka_vaakya, board. Optional: emphasis, pause_after, question_text, option_a, option_b, option_c, option_d, option_e. Animated trick layout (optional): layout = trick, working, arcs, result. Topic teaching (optional): layout = concept, question_text = topic name. Board diagram (optional): layout = diagram, diagram (canal-network, three-sources, gaining-losing-river, subsidy-cycle), diagram_step, diagram_labels (en or hi). Infographics: diagram = flow, cards, timeline, compare, table, hub, venn or stairs, with diagram_items separated by |. Pictures: diagram = image, diagram_items = file names from the pedagogy-images folder (caption after =, up to 4). Any cards, timeline, compare, table or stairs item can end with "@ file.png" to show that picture inside it. Maths and reasoning (optional): layout = solution, question_text = chapter, board = title, problem, diagram (numberline, units, bars, chain, table or none) with diagram_items, steps separated by | ending "Answer: …", draw = diagram items drawn by that line, diagram_step = step cards showing. MCQs on a solution board: option_a…option_e show as chips; the option the Answer card names (Option D …) turns yellow; wrap each wrong part of problem in *stars* to mark it red with its step card.</p></div>
      <section className="pedagogy-render-action" aria-label="Write the sheet from a YouTube class" style={{ alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 10, flex: 1 }}>
          <p className="eyebrow">Start here · from a YouTube class</p>
          <strong>Paste the class link. FRAME writes the sheet from the educator&apos;s own words, then you check it and generate.</strong>
          <label style={{ display: "grid", gap: 4 }}><span>YouTube link</span><input value={ytLink} onChange={(event) => { setYtLink(event.target.value); setYtVideo(null); setYtSheet(null); }} placeholder="https://www.youtube.com/watch?v=…" disabled={Boolean(ytBusy)} style={{ border: "1px solid currentColor", padding: 10, font: "inherit" }} /></label>
          {ytShowPaste ? <>
            <label style={{ display: "grid", gap: 4 }}><span>Either paste the transcript (YouTube → ⋯ → Show transcript → copy everything with the times)</span><textarea value={ytPaste} onChange={(event) => { setYtPaste(event.target.value); setYtVideo(null); }} rows={5} disabled={Boolean(ytBusy)} style={{ border: "1px solid currentColor", padding: 10, font: "inherit" }} /></label>
            <label style={{ display: "grid", gap: 4 }}><span>or upload the class video / audio (FRAME transcribes only the section you pick, about ₹0.5 per minute)</span><input type="file" accept="video/*,audio/*" disabled={Boolean(ytBusy)} onChange={(event) => { setYtFile(event.target.files?.[0] ?? null); setYtVideo(null); }} /></label>
          </> : <button type="button" className="text-link" style={{ justifySelf: "start" }} onClick={() => setYtShowPaste(true)}>Paste the transcript or upload the class file instead</button>}
          {ytVideo ? <>
            <small>{ytVideo.title || "Class"} · {Math.round(ytVideo.durationSeconds / 60)} min · {ytVideo.path === "class-file" ? "" : `${ytVideo.lines} transcript lines `}({ytVideo.path === "pasted" ? "pasted transcript" : ytVideo.path === "class-file" ? "uploaded file, transcribed when you write the sheet" : "YouTube captions"})</small>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={{ display: "grid", gap: 4 }}><span>Class from (min)</span><input type="number" min={0} value={ytFrom} onChange={(event) => setYtFrom(Number(event.target.value))} disabled={Boolean(ytBusy)} style={{ width: 110, border: "1px solid currentColor", padding: 8, font: "inherit" }} /></label>
              <label style={{ display: "grid", gap: 4 }}><span>to (min)</span><input type="number" min={1} value={ytTo} onChange={(event) => setYtTo(Number(event.target.value))} disabled={Boolean(ytBusy)} style={{ width: 110, border: "1px solid currentColor", padding: 8, font: "inherit" }} /></label>
              <label style={{ display: "grid", gap: 4 }}><span>Video length</span><select value={ytTarget} onChange={(event) => setYtTarget(Number(event.target.value))} disabled={Boolean(ytBusy)} style={{ border: "1px solid currentColor", padding: 8, font: "inherit" }}>{[5, 10, 15, 20, 30].map((minutes) => <option key={minutes} value={minutes}>about {minutes} min</option>)}</select></label>
            </div>
            <small>Up to 90 minutes of the class per sheet. A long class: do it in sections (0–60, 60–120…), one video each.</small>
          </> : null}
          {ytError ? <p className="error" role="alert">{ytError}</p> : null}
          {ytBusy ? <p role="status">{ytBusy}</p> : null}
          {ytSheet ? <p role="status">Sheet written by {ytSheet.writer}: {ytSheet.concepts} concepts, {ytSheet.lines} lines. <a className="text-link" href={ytSheet.url} download={ytSheet.name}>Download the sheet ↓</a>{ytSheet.fixes.length ? <><br /><small>FRAME adjusted {ytSheet.fixes.length} board count(s) so every board fits; see the review below.</small></> : null}<br /><small>Check the narration below (it is the educator&apos;s words, from the transcript only) before generating.</small></p> : null}
        </div>
        {ytVideo ? <button className="primary-button" type="button" disabled={Boolean(ytBusy) || isReviewing || isRendering} onClick={() => void writeYoutubeSheet()}>{ytBusy ? "Working…" : "Write the sheet"}</button>
          : <button className="primary-button" type="button" disabled={Boolean(ytBusy) || (ytLink.trim().length < 8 && !ytPaste.trim() && !ytFile)} onClick={() => void loadYoutube()}>{ytBusy ? "Reading…" : "Load the class"}</button>}
      </section>
      <label className="pedagogy-pack-option"><input type="checkbox" checked={packNarration} disabled={isReviewing || isRendering} onChange={(event) => {
        setPackNarration(event.target.checked);
        setRows([]); setWarnings([]); setTimingAudit([]); setFileName("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }} /> Pack narration (ignore timestamps, no gaps)</label>
      <label className="pedagogy-file-picker"><span>Choose .xlsx file</span><input ref={fileInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={uploadBrief} /><b>{isReviewing ? reviewStatus(reviewProgress) : fileName || "No file selected"}</b></label>
      {error ? <p className="error" role="alert"><strong>{errorCode || "PEDAGOGY_PREVIEW_FAILED"}{errorSourceRow === null ? "" : ` · Row ${errorSourceRow}`}</strong><br />{error}</p> : null}
      {warnings.length ? <section className="pedagogy-warnings" aria-label="Brief warnings"><strong>Review warnings</strong><ul>{warnings.map((warning, index) => <li key={`warning-${index}`}>{warning}</li>)}</ul></section> : null}
      {rows.length ? <>
        <div className="pedagogy-preview-heading"><div><p className="eyebrow">Step 2</p><h2>Check the teaching timeline.</h2></div><span>First source timestamp {rows[0].sourceTime} maps to video time {rows[0].generatedTimeLabel}.</span></div>
        <div className="pedagogy-table-wrap"><table><caption>Pedagogy brief preview before generation</caption><thead><tr><th>Source time</th><th>Video time</th><th>Question</th><th>Narration</th><th>Board</th><th>Emphasis</th><th>Pause</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.sourceRow}-${row.lineNo}`}><td>{row.sourceTime}</td><td>{row.generatedTimeLabel}</td><td>{row.effectiveQuestionText || "Concept-only"}</td><td>{row.narration}</td><td>{row.effectiveBoard || "—"}</td><td>{row.emphasis || "—"}</td><td>{row.pauseAfter === "haan" ? "Haan" : "Nahi"}</td></tr>)}</tbody></table></div>
        {timingAudit.length ? <div className="pedagogy-table-wrap"><table><caption>Narration timing audit before assembly</caption><thead><tr><th>Source row</th><th>Source time</th><th>Original video time</th><th>Adjusted video time</th><th>Original slot</th><th>Measured narration</th><th>Final allocation</th><th>Added</th></tr></thead><tbody>{timingAudit.map((audit) => <tr key={`audit-${audit.sourceRow}`}><td>{audit.sourceRow}</td><td>{audit.sourceTime}</td><td>{audit.originalGeneratedTimeLabel}</td><td>{audit.adjustedGeneratedTimeLabel}</td><td>{audit.originalAvailableDuration === null ? "—" : `${audit.originalAvailableDuration.toFixed(3)} s`}</td><td>{`${audit.narrationDuration.toFixed(3)} s`}</td><td>{`${audit.allocatedDuration.toFixed(3)} s`}</td><td>{`${audit.addedDuration.toFixed(3)} s`}</td></tr>)}</tbody></table></div> : null}
        <div className="pedagogy-render-action"><div><p className="eyebrow">Step 3</p><strong>Generate the code-drawn explainer.</strong><small>FRAME has already audited every narration slot. Rendering prepares the final audio tracks and assembles the adjusted timeline.</small></div><button className="primary-button" type="button" disabled={isRendering} onClick={renderVideo}>{isRendering ? "Preparing narration tracks and rendering video…" : "Generate video"}</button></div>
      </> : null}
      {videoUrl ? <section className="pedagogy-video"><p className="eyebrow">Preview ready</p><video controls src={videoUrl} aria-label="Generated pedagogy explainer video" /><a className="text-link" href={videoUrl} download="frame-pedagogy-explainer.mp4">Download MP4 <span>↓</span></a></section> : null}
      {videoUrl ? <section className="pedagogy-render-action" aria-label="Publish as two-way class" style={{ alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 10, flex: 1 }}>
          <p className="eyebrow">Step 4 · optional</p>
          <strong>Publish as two-way class</strong>
          <small>Students watch this video, ask doubts and get instant answers from the tutor, with a doubts video for anything still unclear. Only published videos become classes.</small>
          <label style={{ display: "grid", gap: 4 }}><span>Class title</span><input value={classTitle} onChange={(event) => setClassTitle(event.target.value)} maxLength={120} placeholder="e.g. Water Crisis in India" disabled={publishing || Boolean(published)} style={{ border: "1px solid currentColor", padding: 10, font: "inherit" }} /></label>
          <label style={{ display: "grid", gap: 4 }}><span>Subtitle (optional)</span><input value={classSubtitle} onChange={(event) => setClassSubtitle(event.target.value)} maxLength={120} placeholder="e.g. UPSC GS-3 · Agriculture + Water" disabled={publishing || Boolean(published)} style={{ border: "1px solid currentColor", padding: 10, font: "inherit" }} /></label>
          {publishError ? <p className="error" role="alert">{publishError}</p> : null}
          {published ? <p role="status">Published with {published.chapters} chapters. <a className="text-link" href={published.url} target="_blank" rel="noreferrer">Open the class ↗</a><br /><small>Share: {typeof window === "undefined" ? published.url : `${window.location.origin}${published.url}`}</small></p> : null}
        </div>
        {published ? null : <button className="primary-button" type="button" disabled={publishing || classTitle.trim().length < 2} onClick={() => void publishClass()}>{publishing ? "Publishing…" : "Publish as two-way class"}</button>}
      </section> : null}
    </section>}
  </section>;
}
