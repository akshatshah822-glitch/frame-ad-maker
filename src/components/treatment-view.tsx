"use client";

import Image from "next/image";
import Link from "next/link";
import { getPlatformFormat } from "@/lib/image-prompt";
import { getShotDisplay, hasDialogue } from "@/lib/treatment";
import type { AppPhase, Shot, TreatmentData, VideoProduction as Production } from "@/lib/types";
import { useEffect, useState } from "react";
import { CompletionActions } from "@/components/completion-actions";
import { VideoProduction } from "@/components/video-production";
import { BlockedShotRetry } from "@/components/blocked-shot-retry";

type Props = {
  treatment: TreatmentData;
  phase?: AppPhase;
  saved?: boolean | null;
  currentShot?: number | null;
  progressStep?: string;
  progressElapsed?: number;
  onRetryShot?: (shot: Shot) => void;
  onRestart?: () => void;
  initialVideoProduction?: Production | null;
  showVideoProduction?: boolean;
};

export function TreatmentView({ treatment, phase = "storyboard_ready", saved = true, currentShot, progressStep, progressElapsed = 0, onRetryShot, onRestart, initialVideoProduction = null, showVideoProduction = false }: Props) {
  const [videoProduction, setVideoProduction] = useState(initialVideoProduction);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(() => new Set());
  const [failedImageLoads, setFailedImageLoads] = useState<Set<number>>(() => new Set());
  const { brief, concept, generation } = treatment;
  const totalFrames = generation.shots.length;
  const completeCount = generation.shots.filter((shot) => shot.imageStatus === "complete").length;
  const loadedCount = generation.shots.filter((shot) => shot.imageUrl && loadedImages.has(shot.shotNumber)).length;
  const availableImageCount = generation.shots.filter((shot) => Boolean(shot.imageUrl)).length;
  const failedCount = generation.shots.filter((shot) => shot.imageStatus === "failed" || shot.imageStatus === "blocked" || failedImageLoads.has(shot.shotNumber)).length;
  const ready = phase === "storyboard_ready" && completeCount === totalFrames && loadedCount === totalFrames;
  const incomplete = phase === "storyboard_incomplete" || (phase === "storyboard_ready" && completeCount < totalFrames);
  const loadingImages = completeCount === totalFrames && loadedCount < totalFrames && failedImageLoads.size === 0;
  const working = phase === "storyboard_generating" || phase === "images_generating" || loadingImages;
  const filmReady = videoProduction?.status === "ready" && Boolean(videoProduction.finalVideoUrl);
  const statusTitle = filmReady ? "FILM READY" : ready ? "STORYBOARD READY" : incomplete || failedImageLoads.size ? `STORYBOARD INCOMPLETE · ${loadedCount}/${totalFrames} FRAMES` : phase === "images_generating" || loadingImages ? `GENERATING ${loadedCount} OF ${totalFrames}` : phase === "storyboard_generating" ? "DEVELOPING THE VISUAL WORLD" : "BUILDING THE STORYBOARD";
  const statusCopy = filmReady ? "Your finished film is ready to watch and share." : ready ? "Your treatment and all frames are ready to share." : incomplete || failedImageLoads.size ? `${failedCount} ${failedCount === 1 ? "frame needs" : "frames need"} attention. Retry only the affected frame below.` : `${progressStep || (currentShot ? `Drawing frame ${currentShot} of ${totalFrames}` : "Loading the storyboard frames")} · ${progressElapsed}s elapsed`;
  const playFilm = () => {
    const video = document.querySelector<HTMLVideoElement>(".final-ad video");
    video?.scrollIntoView({ behavior: "smooth", block: "center" });
    void video?.play();
  };

  useEffect(() => {
    const pending = generation.shots.filter((shot) => shot.imageUrl && !loadedImages.has(shot.shotNumber) && !failedImageLoads.has(shot.shotNumber));
    if (!pending.length) return;
    const timer = window.setTimeout(() => setFailedImageLoads((current) => {
      const next = new Set(current);
      pending.forEach((shot) => next.add(shot.shotNumber));
      return next;
    }), 45_000);
    return () => window.clearTimeout(timer);
  }, [failedImageLoads, generation.shots, loadedImages]);

  return <main className="page result-page">
    <header className="topbar">{onRestart ? <button className="wordmark" type="button" onClick={onRestart}>FRAME<span>{"///"}</span></button> : <Link className="wordmark" href="/">FRAME<span>{"///"}</span></Link>}<span>30 sec ad maker</span>{onRestart ? <button className="new-button" type="button" onClick={onRestart}>Start over</button> : <Link className="new-button" href="/">Create your own</Link>}</header>
    <section className="treatment-header"><p className="eyebrow">Approved creative direction</p><div><span>Concept name</span><h1>{concept.conceptName || generation.title}</h1><p>{concept.idea || generation.title}</p>{brief.intent === "performance" && concept.whatThisTests && concept.whatThisTests !== "Not applicable" ? <div className="treatment-strategy"><small>WHAT THIS TESTS</small><strong>{concept.whatThisTests}</strong></div> : null}{brief.intent === "cinematic" ? <div className="treatment-strategy"><small>LOGLINE</small><strong>{concept.logline || concept.idea}</strong>{concept.humanTruth && concept.humanTruth !== "Not applicable" ? <p><b>Human truth:</b> {concept.humanTruth}</p> : null}{concept.emotionalArc && concept.emotionalArc !== "Not applicable" ? <p><b>Emotional arc:</b> {concept.emotionalArc}</p> : null}</div> : null}</div><aside><small>FORMAT</small><strong>{generation.duration}</strong><small>PLATFORM</small><strong>{brief.platform}</strong></aside></section>
    <section className={`completion-state ${ready ? "is-ready" : "is-working"}`} aria-live="polite" aria-busy={working}>
      <span className="completion-mark" aria-hidden="true">{ready ? "✓" : ""}</span><div><small>{statusTitle}</small><strong>{statusCopy}</strong></div>
      {ready ? <div className="completion-actions-wrap">{filmReady ? <button className="primary-button" type="button" onClick={playFilm}>Watch film <span aria-hidden="true">↓</span></button> : null}<CompletionActions treatment={treatment} onRestart={onRestart} filmReady={filmReady} canDownloadVideo={totalFrames === 6 && availableImageCount === 6} /></div> : null}
    </section>
    {ready && totalFrames === 6 && completeCount === 6 && (showVideoProduction || videoProduction) ? <VideoProduction generationId={treatment.id} posterUrl={generation.shots[0]?.imageUrl} treatmentTitle={generation.title} initialProduction={videoProduction} onProductionChange={setVideoProduction} /> : null}
    <div className="treatment-rule"><span>Storyboard / {totalFrames} frames</span><span>01—{String(totalFrames).padStart(2, "0")}</span></div>
    <section className="storyboard-sequence" aria-label={`${totalFrames}-frame storyboard`}>{generation.shots.map((shot, index) => {
      const display = getShotDisplay(shot);
      return <article className="treatment-shot" key={shot.shotNumber}>
        <figure className="shot-frame" data-format={getPlatformFormat(brief.platform)} data-status={shot.imageStatus}>
          {shot.imageUrl && !failedImageLoads.has(shot.shotNumber) ? <Image src={shot.imageUrl} alt={`Shot ${shot.shotNumber}: ${display.visual}`} fill sizes="(max-width: 750px) 100vw, 50vw" priority={index < 2} unoptimized crossOrigin="anonymous" data-storyboard-frame onLoad={() => setLoadedImages((current) => current.has(shot.shotNumber) ? current : new Set(current).add(shot.shotNumber))} onError={() => setFailedImageLoads((current) => new Set(current).add(shot.shotNumber))} /> : ((shot.imageStatus === "blocked" || shot.imageStatus === "failed" || failedImageLoads.has(shot.shotNumber)) && treatment.id) ? <BlockedShotRetry shot={failedImageLoads.has(shot.shotNumber) ? { ...shot, imageStatus: "failed", imageError: "This frame could not be loaded. Generate this shot again." } : shot} generationId={treatment.id} platform={brief.platform} totalShots={totalFrames} /> : shot.imageStatus === "failed" ? <div className="shot-frame-failed"><span>FRAME / 0{shot.shotNumber}</span><p>{shot.imageError ?? "This frame couldn't be rendered."}</p>{onRetryShot ? <button type="button" onClick={() => onRetryShot(shot)}>Retry frame</button> : null}</div> : <div className="shot-frame-pending"><span>FRAME / 0{shot.shotNumber}</span><small>{shot.imageStatus === "generating" ? "Directing this frame…" : "Waiting for direction"}</small></div>}
        </figure>
        <header className="shot-heading"><div><span>{String(shot.shotNumber).padStart(2, "0")}</span><h2>{shot.narrativeBeat || shot.purpose}</h2></div><time>{shot.startTime}–{shot.endTime} sec</time></header>
        <div className="shot-summary">
          <section><small>VISUAL</small><p>{display.visual}</p></section>
          <section><small>CAMERA</small><p>{display.camera}</p></section>
          <section><small>ACTION</small><p>{display.action}</p></section>
        </div>
        <details className="shot-generation"><summary>View shot details <span aria-hidden="true">+</span></summary><div>
          <p><small>FULL VISUAL</small>{shot.visualDescription}</p><p><small>PURPOSE</small>{shot.purpose}</p>
          <p><small>FRAMING / LENS</small>{shot.cameraFraming} · {shot.lensSuggestion}</p><p><small>ANGLE / MOVEMENT</small>{shot.cameraAngle} · {shot.cameraMovement}</p>
          {shot.performanceDirection ? <p><small>PERFORMANCE</small>{shot.performanceDirection}</p> : null}{shot.productAction ? <p><small>PRODUCT ACTION</small>{shot.productAction}</p> : null}
          <p><small>LIGHTING</small>{shot.lighting}</p><p><small>LOCATION / PROPS</small>{shot.locationAndProps}</p>
          {shot.focusBehaviour ? <p><small>FOCUS</small>{shot.focusBehaviour}</p> : null}{shot.transitionIntent ? <p><small>TRANSITION</small>{shot.transitionIntent}</p> : null}
          <p><small>PRODUCT PRESENCE</small>{shot.productPresence}</p><p><small>AUDIO</small>{shot.audio}</p>
          {hasDialogue(shot.voiceoverOrDialogue) ? <p><small>VO / DIALOGUE</small>{shot.voiceoverOrDialogue}</p> : null}
          <p className="generation-prompt"><small>IMAGE GENERATION DETAILS</small>{shot.imagePrompt}</p>
        </div></details>
      </article>;
    })}</section>
    {ready ? <footer className="result-footer"><p>{saved ? "Treatment and frames saved." : "Treatment created. Saving was unavailable for this run."}</p></footer> : null}
  </main>;
}
