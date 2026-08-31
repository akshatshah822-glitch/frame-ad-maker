"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoProduction as Production } from "@/lib/types";
import { track } from "@/lib/analytics";
import { readJsonResponse } from "@/lib/read-json-response";

type Props = { generationId?: string; posterUrl?: string; treatmentTitle?: string; initialProduction?: Production | null; onProductionChange?: (production: Production | null) => void };
const shotNames = ["opening hook", "tension", "product reveal", "proof", "payoff", "brand frame"];

export function VideoProduction({ generationId, posterUrl, treatmentTitle, initialProduction = null, onProductionChange }: Props) {
  const [production, setProduction] = useState<Production | null>(initialProduction);
  const [statusChecked, setStatusChecked] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const assemblyRequested = useRef(false);
  const startRequested = useRef(false);
  const filmShown = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => { onProductionChange?.(production); }, [onProductionChange, production]);

  const call = useCallback(async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await readJsonResponse<{ production?: Production | null; error?: string }>(response);
    if (!response.ok) throw new Error(payload.error || "Video production could not continue.");
    setProduction(payload.production ?? null);
    return payload.production ?? null;
  }, []);

  useEffect(() => {
    if (!generationId) return;
    const timer = window.setTimeout(() => call("/api/video/status", { generationId })
      .then(() => setStatusChecked(true))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Render status could not be checked.")), 0);
    return () => window.clearTimeout(timer);
  }, [call, generationId]);

  useEffect(() => {
    if (!generationId || !statusChecked || production || startRequested.current) return;
    startRequested.current = true;
    setWorking(true);
    setError("");
    call("/api/video/start", { generationId })
      .catch((reason) => {
        startRequested.current = false;
        setError(reason instanceof Error ? reason.message : "Video production could not start.");
      })
      .finally(() => setWorking(false));
  }, [call, generationId, production, statusChecked]);

  useEffect(() => {
    if (!generationId || !production || !["creating", "generating"].includes(production.status)) return;
    const timer = window.setTimeout(() => call("/api/video/status", { generationId }).catch((reason) => setError(reason.message)), 8000);
    return () => window.clearTimeout(timer);
  }, [call, generationId, production]);

  useEffect(() => {
    if (!generationId || production?.status !== "clips_ready" || assemblyRequested.current) return;
    assemblyRequested.current = true;
    call("/api/video/assemble", { generationId }).catch((reason) => { assemblyRequested.current = false; setError(reason.message); });
  }, [call, generationId, production?.status]);

  if (!generationId) return null;
  const retry = async (shotNumber: number) => { setError(""); try { await call("/api/video/retry", { generationId, shotNumber }); } catch (reason) { setError(reason instanceof Error ? reason.message : "This shot could not be retried."); } };
  const cancel = async () => { setWorking(true); try { await call("/api/video/cancel", { generationId }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Production could not be cancelled."); } finally { setWorking(false); } };

  if (!production) return <section className="video-gate" aria-labelledby="video-gate-title" aria-live="polite">
    <p className="eyebrow">Film production</p><h2 id="video-gate-title">Rendering 0 of 6</h2>
    <p>{statusChecked ? "Starting the six shots automatically…" : "Checking for an existing render…"}</p>
    {error ? <p className="video-error" role="alert">{error}</p> : null}
  </section>;

  const complete = production.clips.filter((clip) => clip.status === "complete").length;
  const clipProgress = production.clips.reduce((total, clip) => {
    if (clip.status === "complete") return total + 1;
    if (clip.status === "running") {
      const reported = clip.progress ?? 0.1;
      return total + Math.min(0.99, reported > 1 ? reported / 100 : reported);
    }
    if (clip.status === "submitted") return total + 0.05;
    return total;
  }, 0) / Math.max(production.clips.length, 1);
  const progress = production.status === "ready" ? 100
    : production.status === "assembling" ? 94
    : production.status === "clips_ready" ? 88
    : Math.round(4 + clipProgress * 82);
  if (production.status === "ready" && production.finalVideoUrl) return <section className="final-ad" aria-labelledby="final-ad-title">
    <p className="eyebrow">Final film</p><h2 id="final-ad-title">Your ad is ready.</h2>
    <video ref={videoRef} controls playsInline preload="metadata" poster={posterUrl} src={production.finalVideoUrl} onPlay={() => { setIsPlaying(true); if (!filmShown.current) { filmShown.current = true; track("film_shown", { treatmentId: generationId }); } }} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)}>Your browser cannot play this video.</video>
    <div className="final-ad-actions"><button className="video-primary" type="button" aria-label={isPlaying ? "Pause film" : "Play film"} onClick={() => { const video = videoRef.current; if (!video) return; if (video.paused) void video.play(); else video.pause(); }}>{isPlaying ? "Pause" : "Play"}</button><a className="export-button" href={`/api/video/download/${generationId}`} download>{treatmentTitle ? `Download ${treatmentTitle}` : "Download MP4"}</a></div>
  </section>;

  return <section className="video-progress" aria-live="polite" aria-busy={["creating", "generating", "assembling"].includes(production.status)}>
    <p className="eyebrow">Film production</p>
    <h2>{production.status === "assembling" ? "Stitching 6 of 6" : production.status === "cancelled" ? "Production paused" : `Rendering ${complete} of 6`}</h2>
    <p>{production.status === "assembling" ? "Normalizing the clips, laying in audio, and finishing the brand frame." : `${complete} of 6 clips are safely stored.`}</p>
    <div className="production-progress" role="progressbar" aria-label="Film production progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
      <div className="production-progress-meta"><span>Overall production</span><strong>{progress}%</strong></div>
      <span className="production-progress-track"><i style={{ width: `${progress}%` }} /></span>
    </div>
    <ol className="clip-statuses">{production.clips.map((clip) => <li key={clip.shotNumber} data-status={clip.status}><span>0{clip.shotNumber}</span><strong>{shotNames[clip.shotNumber - 1]}</strong><small>{clip.status}</small>{clip.status === "failed" ? <button type="button" onClick={() => retry(clip.shotNumber)}>Retry shot</button> : null}</li>)}</ol>
    {production.status === "clips_ready" && error ? <button className="video-primary" type="button" onClick={() => { assemblyRequested.current = false; setProduction({ ...production }); }}>Retry final edit</button> : null}
    {["creating", "generating"].includes(production.status) ? <button className="video-cancel" type="button" onClick={cancel} disabled={working}>Cancel production</button> : null}
    {error ? <p className="video-error" role="alert">{error}</p> : null}
  </section>;
}
