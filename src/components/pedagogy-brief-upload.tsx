"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { readJsonResponse } from "@/lib/read-json-response";

type PedagogyRow = { sourceRow: number; questionId: string; lineNo: number; sourceTime: string; generatedTimeLabel: string; narration: string; board: string; effectiveBoard: string; emphasis: string; pauseAfter: "haan" | "nahi" };
type PreviewResponse = { rows?: PedagogyRow[]; warnings?: string[]; grammarWarnings?: string[]; error?: string };

export function PedagogyBriefUpload() {
  const [mode, setMode] = useState<"manual" | "pedagogy">("pedagogy");
  const [rows, setRows] = useState<PedagogyRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const videoUrlRef = useRef("");
  useEffect(() => () => { if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current); }, []);

  async function uploadBrief(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setRows([]); setWarnings([]); setError("");
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = ""; setVideoUrl("");
    if (!file) { setFileName(""); return; }
    setFileName(file.name); setIsReviewing(true);
    try {
      const formData = new FormData(); formData.set("brief", file);
      const response = await fetch("/api/question/pedagogy/preview", { method: "POST", body: formData });
      const result = await readJsonResponse<PreviewResponse>(response);
      if (!response.ok || !result?.rows) throw new Error(result?.error || "The pedagogy brief could not be reviewed.");
      setRows(result.rows); setWarnings([...(result.warnings ?? []), ...(result.grammarWarnings ?? [])]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The pedagogy brief could not be reviewed."); }
    finally { setIsReviewing(false); }
  }

  async function renderVideo() {
    if (!rows.length || isRendering) return;
    setError(""); setIsRendering(true);
    try {
      const response = await fetch("/api/question/pedagogy/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
      if (!response.ok) {
        const result = await readJsonResponse<PreviewResponse>(response);
        throw new Error(result?.error || "The pedagogy video could not be generated.");
      }
      const url = URL.createObjectURL(await response.blob());
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = url; setVideoUrl(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The pedagogy video could not be generated."); }
    finally { setIsRendering(false); }
  }

  return <section className="pedagogy-workspace" aria-label="Exam question video input">
    <div className="pedagogy-mode-tabs" role="tablist" aria-label="Input mode">
      <button type="button" role="tab" aria-selected={mode === "manual"} onClick={() => setMode("manual")}>Manual question entry</button>
      <button type="button" role="tab" aria-selected={mode === "pedagogy"} onClick={() => setMode("pedagogy")}>Pedagogy Brief Upload</button>
    </div>
    {mode === "manual" ? <section className="pedagogy-manual" role="tabpanel"><p className="eyebrow">Existing route</p><h2>Manual question generation stays available.</h2><p>This upload path does not replace or change the existing manual `POST /api/question/generate` and `POST /api/question/render` workflow.</p></section> : <section className="pedagogy-upload" role="tabpanel">
      <div className="pedagogy-upload-heading"><div><p className="eyebrow">Step 1</p><h2>Upload the teaching plan.</h2></div><p>First worksheet only. Required: question_id, line_no, time, sir_ka_vaakya, board. Optional: emphasis, pause_after.</p></div>
      <label className="pedagogy-file-picker"><span>Choose .xlsx file</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={uploadBrief} /><b>{isReviewing ? "Reviewing timing and grammar…" : fileName || "No file selected"}</b></label>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {warnings.length ? <section className="pedagogy-warnings" aria-label="Brief warnings"><strong>Review warnings</strong><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></section> : null}
      {rows.length ? <>
        <div className="pedagogy-preview-heading"><div><p className="eyebrow">Step 2</p><h2>Check the teaching timeline.</h2></div><span>First source timestamp {rows[0].sourceTime} maps to video time {rows[0].generatedTimeLabel}.</span></div>
        <div className="pedagogy-table-wrap"><table><caption>Pedagogy brief preview before generation</caption><thead><tr><th>Source time</th><th>Video time</th><th>Narration</th><th>Board</th><th>Emphasis</th><th>Pause</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.sourceRow}-${row.lineNo}`}><td>{row.sourceTime}</td><td>{row.generatedTimeLabel}</td><td>{row.narration}</td><td>{row.effectiveBoard || "—"}</td><td>{row.emphasis || "—"}</td><td>{row.pauseAfter === "haan" ? "Haan" : "Nahi"}</td></tr>)}</tbody></table></div>
        <div className="pedagogy-render-action"><div><p className="eyebrow">Step 3</p><strong>Generate the code-drawn explainer.</strong><small>Narration is measured before rendering. A line that cannot fit its next timestamp stops with a row-specific error.</small></div><button className="primary-button" type="button" disabled={isRendering} onClick={renderVideo}>{isRendering ? "Measuring narration…" : "Generate video"}</button></div>
      </> : null}
      {videoUrl ? <section className="pedagogy-video"><p className="eyebrow">Preview ready</p><video controls src={videoUrl} aria-label="Generated pedagogy explainer video" /><a className="text-link" href={videoUrl} download="frame-pedagogy-explainer.mp4">Download MP4 <span>↓</span></a></section> : null}
    </section>}
  </section>;
}
