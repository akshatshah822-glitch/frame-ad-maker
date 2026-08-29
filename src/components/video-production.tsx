"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoProduction as Production } from "@/lib/types";

type Props = { generationId?: string };
const shotNames = ["opening hook", "tension", "product reveal", "proof", "payoff", "brand frame"];

export function VideoProduction({ generationId }: Props) {
  const [production, setProduction] = useState<Production | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const assemblyRequested = useRef(false);

  const call = useCallback(async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json() as { production?: Production | null; error?: string };
    if (!response.ok) throw new Error(payload.error || "Video production could not continue.");
    if (payload.production) setProduction(payload.production);
    return payload.production ?? null;
  }, []);

  useEffect(() => {
    if (!generationId) return;
    const timer = window.setTimeout(() => call("/api/video/status", { generationId }).catch(() => undefined), 0);
    return () => window.clearTimeout(timer);
  }, [call, generationId]);

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
  const start = async () => { setWorking(true); setError(""); try { await call("/api/video/start", { generationId }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Video production could not start."); } finally { setWorking(false); } };
  const retry = async (shotNumber: number) => { setError(""); try { await call("/api/video/retry", { generationId, shotNumber }); } catch (reason) { setError(reason instanceof Error ? reason.message : "This shot could not be retried."); } };
  const cancel = async () => { setWorking(true); try { await call("/api/video/cancel", { generationId }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Production could not be cancelled."); } finally { setWorking(false); } };

  if (!production) return <section className="video-gate" aria-labelledby="video-gate-title">
    <p className="eyebrow">Next / Motion</p><h2 id="video-gate-title">Turn these frames into a finished ad.</h2>
    <p>FRAME will animate six shots, direct the edit, add voice where the script calls for it, and deliver one 30-second MP4.</p>
    <button className="video-primary" type="button" onClick={start} disabled={working}>{working ? "Starting production…" : "Generate my ad"}</button>
    <small>Video generation starts only when you press this button.</small>
    {error ? <p className="video-error" role="alert">{error}</p> : null}
  </section>;

  const complete = production.clips.filter((clip) => clip.status === "complete").length;
  const failed = production.clips.filter((clip) => clip.status === "failed");
  const active = production.clips.find((clip) => clip.status === "running" || clip.status === "submitted");
  if (production.status === "ready" && production.finalVideoUrl) return <section className="final-ad" aria-labelledby="final-ad-title">
    <p className="eyebrow">Final film</p><h2 id="final-ad-title">Your ad is ready.</h2>
    <video controls playsInline preload="metadata" src={production.finalVideoUrl}>Your browser cannot play this video.</video>
    <div className="final-ad-actions"><a className="video-primary" href={production.finalVideoUrl}>Play</a><a className="export-button" href={production.finalVideoUrl} download>Download MP4</a></div>
  </section>;

  return <section className="video-progress" aria-live="polite" aria-busy={["creating", "generating", "assembling"].includes(production.status)}>
    <p className="eyebrow">Film production</p>
    <h2>{production.status === "assembling" ? "Editing your final film…" : production.status === "cancelled" ? "Production paused" : failed.length ? `${complete}/6 clips ready` : active ? `Directing the ${shotNames[active.shotNumber - 1]}…` : "Preparing the six shots…"}</h2>
    <p>{production.status === "assembling" ? "Normalizing the clips, laying in audio, and finishing the brand frame." : `${complete} of 6 clips are safely stored.`}</p>
    <ol className="clip-statuses">{production.clips.map((clip) => <li key={clip.shotNumber} data-status={clip.status}><span>0{clip.shotNumber}</span><strong>{shotNames[clip.shotNumber - 1]}</strong><small>{clip.status}</small>{clip.status === "failed" ? <button type="button" onClick={() => retry(clip.shotNumber)}>Retry shot</button> : null}</li>)}</ol>
    {production.status === "clips_ready" && error ? <button className="video-primary" type="button" onClick={() => { assemblyRequested.current = false; setProduction({ ...production }); }}>Retry final edit</button> : null}
    {["creating", "generating"].includes(production.status) ? <button className="video-cancel" type="button" onClick={cancel} disabled={working}>Cancel production</button> : null}
    {error ? <p className="video-error" role="alert">{error}</p> : null}
  </section>;
}
