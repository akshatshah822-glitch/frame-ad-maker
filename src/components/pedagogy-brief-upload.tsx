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
  const videoUrlRef = useRef("");
  useEffect(() => () => { if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current); }, []);

  async function uploadBrief(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setRows([]); setWarnings([]); setTimingAudit([]); setError(""); setErrorCode(""); setErrorSourceRow(null); setReviewProgress(null);
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = ""; setVideoUrl("");
    if (!file) { setFileName(""); return; }
    setFileName(file.name); setIsReviewing(true); setReviewProgress({ type: "progress", phase: "checking-grammar", completed: 0, total: 0 });
    try {
      const formData = new FormData(); formData.set("brief", file);
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
      const response = await fetch("/api/question/pedagogy/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
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
      const url = URL.createObjectURL(await response.blob());
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = url; setVideoUrl(url);
    } catch (reason) {
      const diagnostic = diagnosticFrom(reason, "The pedagogy video could not be generated.", "PEDAGOGY_RENDER_FAILED");
      setError(diagnostic.error); setErrorCode(diagnostic.code); setErrorSourceRow(diagnostic.sourceRow);
    }
    finally { setIsRendering(false); }
  }

  return <section className="pedagogy-workspace" aria-label="Exam question video input">
    <div className="pedagogy-mode-tabs" role="tablist" aria-label="Input mode">
      <button type="button" role="tab" aria-selected={mode === "manual"} onClick={() => setMode("manual")}>Manual question entry</button>
      <button type="button" role="tab" aria-selected={mode === "pedagogy"} onClick={() => setMode("pedagogy")}>Pedagogy Brief Upload</button>
    </div>
    {mode === "manual" ? <section className="pedagogy-manual" role="tabpanel"><p className="eyebrow">Existing route</p><h2>Manual question generation stays available.</h2><p>This upload path does not replace or change the existing manual `POST /api/question/generate` and `POST /api/question/render` workflow.</p></section> : <section className="pedagogy-upload" role="tabpanel">
      <div className="pedagogy-upload-heading"><div><p className="eyebrow">Step 1</p><h2>Upload the teaching plan.</h2></div><p>First worksheet only. Required: question_id, line_no, time, sir_ka_vaakya, board. Optional: emphasis, pause_after.</p></div>
      <label className="pedagogy-file-picker"><span>Choose .xlsx file</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={uploadBrief} /><b>{isReviewing ? reviewStatus(reviewProgress) : fileName || "No file selected"}</b></label>
      {error ? <p className="error" role="alert"><strong>{errorCode || "PEDAGOGY_PREVIEW_FAILED"}{errorSourceRow === null ? "" : ` · Row ${errorSourceRow}`}</strong><br />{error}</p> : null}
      {warnings.length ? <section className="pedagogy-warnings" aria-label="Brief warnings"><strong>Review warnings</strong><ul>{warnings.map((warning, index) => <li key={`warning-${index}`}>{warning}</li>)}</ul></section> : null}
      {rows.length ? <>
        <div className="pedagogy-preview-heading"><div><p className="eyebrow">Step 2</p><h2>Check the teaching timeline.</h2></div><span>First source timestamp {rows[0].sourceTime} maps to video time {rows[0].generatedTimeLabel}.</span></div>
        <div className="pedagogy-table-wrap"><table><caption>Pedagogy brief preview before generation</caption><thead><tr><th>Source time</th><th>Video time</th><th>Narration</th><th>Board</th><th>Emphasis</th><th>Pause</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.sourceRow}-${row.lineNo}`}><td>{row.sourceTime}</td><td>{row.generatedTimeLabel}</td><td>{row.narration}</td><td>{row.effectiveBoard || "—"}</td><td>{row.emphasis || "—"}</td><td>{row.pauseAfter === "haan" ? "Haan" : "Nahi"}</td></tr>)}</tbody></table></div>
        {timingAudit.length ? <div className="pedagogy-table-wrap"><table><caption>Narration timing audit before assembly</caption><thead><tr><th>Source row</th><th>Source time</th><th>Original video time</th><th>Adjusted video time</th><th>Original slot</th><th>Measured narration</th><th>Final allocation</th><th>Added</th></tr></thead><tbody>{timingAudit.map((audit) => <tr key={`audit-${audit.sourceRow}`}><td>{audit.sourceRow}</td><td>{audit.sourceTime}</td><td>{audit.originalGeneratedTimeLabel}</td><td>{audit.adjustedGeneratedTimeLabel}</td><td>{audit.originalAvailableDuration === null ? "—" : `${audit.originalAvailableDuration.toFixed(3)} s`}</td><td>{`${audit.narrationDuration.toFixed(3)} s`}</td><td>{`${audit.allocatedDuration.toFixed(3)} s`}</td><td>{`${audit.addedDuration.toFixed(3)} s`}</td></tr>)}</tbody></table></div> : null}
        <div className="pedagogy-render-action"><div><p className="eyebrow">Step 3</p><strong>Generate the code-drawn explainer.</strong><small>FRAME has already audited every narration slot. Rendering prepares the final audio tracks and assembles the adjusted timeline.</small></div><button className="primary-button" type="button" disabled={isRendering} onClick={renderVideo}>{isRendering ? "Preparing narration tracks and rendering video…" : "Generate video"}</button></div>
      </> : null}
      {videoUrl ? <section className="pedagogy-video"><p className="eyebrow">Preview ready</p><video controls src={videoUrl} aria-label="Generated pedagogy explainer video" /><a className="text-link" href={videoUrl} download="frame-pedagogy-explainer.mp4">Download MP4 <span>↓</span></a></section> : null}
    </section>}
  </section>;
}
