"use client";

import Image from "next/image";
import Link from "next/link";
import { getPlatformFormat } from "@/lib/image-prompt";
import { getShotDisplay, hasDialogue } from "@/lib/treatment";
import type { AppPhase, Shot, TreatmentData } from "@/lib/types";
import { CompletionActions } from "@/components/completion-actions";
import { VideoProduction } from "@/components/video-production";

const shotLabels = ["Hook", "Tension", "Product", "Proof", "Payoff", "Brand"] as const;

type Props = {
  treatment: TreatmentData;
  phase?: AppPhase;
  saved?: boolean | null;
  currentShot?: number | null;
  onRetryShot?: (shot: Shot) => void;
  onRestart?: () => void;
};

export function TreatmentView({ treatment, phase = "storyboard_ready", saved = true, currentShot, onRetryShot, onRestart }: Props) {
  const { brief, concept, generation } = treatment;
  const completeCount = generation.shots.filter((shot) => shot.imageStatus === "complete").length;
  const failedCount = generation.shots.filter((shot) => shot.imageStatus === "failed").length;
  const unfinishedCount = generation.shots.filter((shot) => shot.imageStatus === "pending" || shot.imageStatus === "generating").length;
  const ready = phase === "storyboard_ready";
  const statusTitle = ready ? (unfinishedCount ? `STORYBOARD SAVED · ${completeCount}/6 FRAMES` : failedCount ? `STORYBOARD READY · ${completeCount}/6 FRAMES` : "STORYBOARD READY") : phase === "storyboard_generating" ? "DEVELOPING THE VISUAL WORLD" : "BUILDING THE STORYBOARD";
  const statusCopy = ready ? (unfinishedCount ? `${unfinishedCount} ${unfinishedCount === 1 ? "frame was" : "frames were"} not finished in this saved treatment.` : failedCount ? `${failedCount === 1 ? "One frame couldn't" : `${failedCount} frames couldn't`} be rendered. The treatment is ready to use.` : "Your treatment and frames are ready to share.") : currentShot ? `Directing shot ${String(currentShot).padStart(2, "0")} of 06.` : "Defining the shared visual direction and six-shot sequence.";

  return <main className="page result-page">
    <header className="topbar">{onRestart ? <button className="wordmark" type="button" onClick={onRestart}>FRAME<span>{"///"}</span></button> : <Link className="wordmark" href="/">FRAME<span>{"///"}</span></Link>}<span>30 sec ad maker</span>{onRestart ? <button className="new-button" type="button" onClick={onRestart}>Start over</button> : <Link className="new-button" href="/">Create your own</Link>}</header>
    <section className="treatment-header"><p className="eyebrow">Approved creative direction</p><div><span>Concept name</span><h1>{concept.conceptName || generation.title}</h1><p>{concept.idea || generation.title}</p></div><aside><small>FORMAT</small><strong>{generation.duration}</strong><small>PLATFORM</small><strong>{brief.platform}</strong></aside></section>
    <section className={`completion-state ${ready ? "is-ready" : "is-working"}`} aria-live="polite" aria-busy={!ready}>
      <span className="completion-mark" aria-hidden="true">{ready ? "✓" : ""}</span><div><small>{statusTitle}</small><strong>{statusCopy}</strong></div>
      {ready ? <CompletionActions treatment={treatment} onRestart={onRestart} /> : null}
    </section>
    <div className="treatment-rule"><span>Storyboard / six frames</span><span>01—06</span></div>
    <section className="storyboard-sequence" aria-label="Six-shot storyboard">{generation.shots.map((shot, index) => {
      const display = getShotDisplay(shot);
      return <article className="treatment-shot" key={shot.shotNumber}>
        <figure className="shot-frame" data-format={getPlatformFormat(brief.platform)} data-status={shot.imageStatus}>
          {shot.imageUrl ? <Image src={shot.imageUrl} alt={`Shot ${shot.shotNumber}: ${display.visual}`} fill sizes="(max-width: 750px) 100vw, 50vw" priority={index < 2} unoptimized /> : shot.imageStatus === "failed" ? <div className="shot-frame-failed"><span>FRAME / 0{shot.shotNumber}</span><p>{shot.imageError ?? "This frame couldn't be rendered."}</p>{onRetryShot ? <button type="button" onClick={() => onRetryShot(shot)}>Retry frame</button> : null}</div> : <div className="shot-frame-pending"><span>FRAME / 0{shot.shotNumber}</span><small>{shot.imageStatus === "generating" ? "Directing this frame…" : "Waiting for direction"}</small></div>}
        </figure>
        <header className="shot-heading"><div><span>0{shot.shotNumber}</span><h2>{shotLabels[index]}</h2></div><time>{shot.startTime}–{shot.endTime} sec</time></header>
        <div className="shot-summary">
          <section><small>VISUAL</small><p>{display.visual}</p></section>
          <section><small>CAMERA</small><p>{display.camera}</p></section>
          <section><small>ACTION</small><p>{display.action}</p></section>
        </div>
        <details className="shot-generation"><summary>View shot details <span aria-hidden="true">+</span></summary><div>
          <p><small>FULL VISUAL</small>{shot.visualDescription}</p><p><small>PURPOSE</small>{shot.purpose}</p>
          <p><small>FRAMING / LENS</small>{shot.cameraFraming} · {shot.lensSuggestion}</p><p><small>ANGLE / MOVEMENT</small>{shot.cameraAngle} · {shot.cameraMovement}</p>
          <p><small>LIGHTING</small>{shot.lighting}</p><p><small>LOCATION / PROPS</small>{shot.locationAndProps}</p>
          <p><small>PRODUCT PRESENCE</small>{shot.productPresence}</p><p><small>AUDIO</small>{shot.audio}</p>
          {hasDialogue(shot.voiceoverOrDialogue) ? <p><small>VO / DIALOGUE</small>{shot.voiceoverOrDialogue}</p> : null}
          <p className="generation-prompt"><small>IMAGE GENERATION DETAILS</small>{shot.imagePrompt}</p>
        </div></details>
      </article>;
    })}</section>
    {ready && completeCount === 6 ? <VideoProduction generationId={treatment.id} /> : null}
    {ready ? <footer className="result-footer"><p>{saved ? "Treatment and frames saved." : "Treatment created. Saving was unavailable for this run."}</p></footer> : null}
  </main>;
}
