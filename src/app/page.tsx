"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { TreatmentView } from "@/components/treatment-view";
import type { AppPhase, Brief, Concept, Generation, Shot } from "@/lib/types";

const conceptTypes = ["Human / Emotional", "Product / Craft-led", "Unexpected / Conceptual"] as const;
const platforms = ["Instagram / Reels", "Meta Ads", "YouTube", "TV / OTT"] as const;
const visualToneOptions = ["Cinematic", "Luxury", "Raw", "Playful", "Emotional", "Bold", "Minimal", "Surreal"] as const;

const campaignDirections = [
  { category: "Beauty & Skincare", number: "01", concept: "The mirror test", hook: "Your glow shouldn’t disappear when the filter does.", tone: "Honest · tactile · assured", visual: "Morning light. Bare skin. One satisfying product ritual captured in macro.", palette: "rose" },
  { category: "Food & Beverages", number: "02", concept: "Crave the first pour", hook: "You’ll hear the refreshment before you taste it.", tone: "Sensory · bright · immediate", visual: "Cold glass. Condensation. A slow pour that becomes the soundtrack.", palette: "citrus" },
  { category: "Snacks", number: "03", concept: "Break the boring", hook: "Your 4 PM meeting deserves a better crunch.", tone: "Quick · playful · knowing", visual: "A dull desk snaps into colour on the first bite. Crumbs become confetti.", palette: "berry" },
  { category: "Fashion", number: "04", concept: "Only yours", hook: "Seen everywhere? Then it was never really yours.", tone: "Selective · expressive · cinematic", visual: "One silver piece moves through a crowd of identical silhouettes.", palette: "silver" },
  { category: "Wellness", number: "05", concept: "A ritual that fits", hook: "Wellness shouldn’t feel like another task.", tone: "Calm · human · grounded", visual: "A real morning in fragments: water, breath, sunlight, product, out the door.", palette: "sage" },
] as const;

const initialForm: Brief = {
  brandProduct: "",
  audience: "",
  proposition: "",
  platform: "Instagram / Reels",
  visualTones: ["Cinematic"] as string[],
};

const directingCopy = [
  "Directing the opening hook…",
  "Lighting the tension…",
  "Framing the product reveal…",
  "Building the proof…",
  "Capturing the payoff…",
  "Finishing the brand frame…",
] as const;

export default function Home() {
  const [form, setForm] = useState(initialForm);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [concepts, setConcepts] = useState<Concept[] | null>(null);
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [phase, setPhase] = useState<AppPhase>("idle");
  const [conceptElapsed, setConceptElapsed] = useState(0);
  const [currentShot, setCurrentShot] = useState<number | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [showcaseIndex, setShowcaseIndex] = useState(0);
  const showcase = campaignDirections[showcaseIndex];
  const generationRunRef = useRef(false);
  const runIdRef = useRef(0);
  const conceptAbortRef = useRef<AbortController | null>(null);
  const conceptsGenerating = phase === "concepts_generating";
  const storyboardWorking = phase === "storyboard_generating" || phase === "images_generating";

  useEffect(() => {
    if (!conceptsGenerating) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setConceptElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [conceptsGenerating]);

  function toggleVisualTone(tone: string) {
    setForm((current) => {
      const selected = current.visualTones.includes(tone);
      if (selected) return { ...current, visualTones: current.visualTones.filter((item) => item !== tone) };
      if (current.visualTones.length === 3) return current;
      return { ...current, visualTones: [...current.visualTones, tone] };
    });
  }

  async function requestConcepts() {
    setError("");
    if (form.visualTones.length === 0) {
      setError("Choose at least one visual tone.");
      return;
    }
    conceptAbortRef.current?.abort();
    const controller = new AbortController();
    conceptAbortRef.current = controller;
    const requestRun = ++runIdRef.current;
    setConceptElapsed(0);
    setPhase("concepts_generating");
    try {
      const response = await fetch("/api/concepts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Something went wrong.");
      if (!Array.isArray(result.concepts) || result.concepts.length !== 3) throw new Error("The concepts came back incomplete. Please generate them again.");
      if (requestRun !== runIdRef.current) return;
      setConcepts(result.concepts);
      setSelectedConcept(null);
      setPhase("concepts_ready");
    } catch (err) {
      if (controller.signal.aborted || requestRun !== runIdRef.current) return;
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("error");
    } finally {
      if (conceptAbortRef.current === controller) conceptAbortRef.current = null;
    }
  }

  function cancelConcepts() {
    runIdRef.current += 1;
    conceptAbortRef.current?.abort();
    conceptAbortRef.current = null;
    setPhase(concepts ? "concepts_ready" : "idle");
    setConceptElapsed(0);
  }

  async function generateConcepts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestConcepts();
  }

  async function regenerateConcepts() {
    setSelectedConcept(null);
    await requestConcepts();
  }

  function updateShot(shotNumber: number, update: Partial<Shot>) {
    setGeneration((current) => current ? {
      ...current,
      shots: current.shots.map((shot) => shot.shotNumber === shotNumber ? { ...shot, ...update } : shot),
    } : current);
  }

  async function renderShot(shot: Shot, savedGenerationId?: string) {
    updateShot(shot.shotNumber, { imageStatus: "generating", imageError: undefined });
    setCurrentShot(shot.shotNumber);
    try {
      const response = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagePrompt: shot.imagePrompt,
          platform: form.platform,
          shotNumber: shot.shotNumber,
          generationId: savedGenerationId,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "This frame couldn't be rendered.");
      updateShot(shot.shotNumber, {
        imageStatus: "complete",
        imageUrl: result.imageUrl,
        imageStorageId: result.imageStorageId,
        imageError: undefined,
      });
    } catch (err) {
      updateShot(shot.shotNumber, {
        imageStatus: "failed",
        imageError: err instanceof Error ? err.message : "This frame couldn't be rendered.",
      });
    }
  }

  async function renderAllShots(storyboard: Generation, runId: number, savedGenerationId?: string) {
    for (const shot of storyboard.shots) {
      if (runIdRef.current !== runId) return;
      await renderShot(shot, savedGenerationId);
    }
    if (runIdRef.current === runId) {
      setCurrentShot(null);
      setPhase("storyboard_ready");
    }
  }

  async function generateStoryboard(concept: Concept) {
    if (generationRunRef.current) return;
    generationRunRef.current = true;
    const runId = ++runIdRef.current;
    setSelectedConcept(concept);
    setPhase("storyboard_generating");
    setCurrentShot(null);
    setError("");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandProduct: form.brandProduct,
          audience: form.audience,
          proposition: form.proposition,
          platform: form.platform,
          visualTones: form.visualTones,
          selectedConcept: concept,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Something went wrong.");
      setGeneration(result.generation);
      setGenerationId(result.generationId ?? null);
      setSaved(result.saved);
      setPhase("images_generating");
      await renderAllShots(result.generation, runId, result.generationId);
    } catch (err) {
      if (runIdRef.current !== runId) return;
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("error");
    } finally {
      generationRunRef.current = false;
    }
  }

  async function retryShot(shot: Shot) {
    setPhase("images_generating");
    await renderShot(shot, generationId ?? undefined);
    setCurrentShot(null);
    setPhase("storyboard_ready");
  }

  function restart() {
    runIdRef.current += 1;
    generationRunRef.current = false;
    setGeneration(null);
    setConcepts(null);
    setSelectedConcept(null);
    setGenerationId(null);
    setSaved(null);
    setPhase("idle");
    setCurrentShot(null);
    setError("");
  }

  if (generation && selectedConcept) return <TreatmentView treatment={{ id: generationId ?? undefined, brief: form, concept: selectedConcept, generation }} phase={phase} saved={saved} currentShot={currentShot} onRetryShot={retryShot} onRestart={restart} />;

  if (concepts) return <main className="page concepts-page">
    <header className="topbar"><button className="wordmark" onClick={() => { setConcepts(null); setSelectedConcept(null); setPhase("idle"); }}>FRAME<span>{"///"}</span></button><span>Creative director</span><button className="new-button" onClick={() => { setConcepts(null); setSelectedConcept(null); setError(""); setPhase("idle"); }}>Edit brief</button></header>
    <section className="concepts-header"><div><p className="eyebrow">Three creative territories</p><h1>Choose the idea<br /><i>worth making.</i></h1></div><p>Each route starts from the same product truth. Select the one that gives your brand the strongest way into culture.</p></section>
    <div className="concept-grid">{concepts.map((concept, index) => { const selected = selectedConcept === concept; const buildingThis = selected && storyboardWorking; return <article className="concept-card" data-selected={selected} key={`${concept.conceptName}-${index}`}><header><span>0{index + 1}</span><small>{conceptTypes[index]}</small></header><div className="concept-title"><p>Creative territory</p><h2>{concept.conceptName}</h2><strong>{concept.idea}</strong></div><div className="concept-detail concept-hook"><small>THE OPEN</small><p>{concept.hook}</p></div><div className="concept-detail concept-visual"><small>VISUAL WORLD</small><p>{concept.visualWorld}</p></div><details className="concept-more"><summary>Read the full treatment <span>+</span></summary><div><section><small>30-SECOND STORY</small><p>{concept.story}</p></section><section><small>PRODUCT&apos;S ROLE</small><p>{concept.productRole}</p></section><section><small>ENDING</small><p>{concept.ending}</p></section></div></details><button className="concept-select" type="button" aria-pressed={selected} disabled={storyboardWorking || conceptsGenerating} onClick={() => generateStoryboard(concept)}>{buildingThis ? "Building storyboard…" : "Choose this direction"}<span>{buildingThis ? "•••" : "↗"}</span></button></article>; })}</div>
    {error ? <p className="error concepts-error" role="alert">{error}</p> : null}
    {conceptsGenerating ? <ConceptLoading elapsed={conceptElapsed} onCancel={cancelConcepts} /> : null}
    <footer className="concept-actions"><button className="new-button" type="button" disabled={conceptsGenerating || storyboardWorking} onClick={regenerateConcepts}>Generate 3 new directions</button><small>{storyboardWorking ? (phase === "storyboard_generating" ? "Developing the visual world…" : directingCopy[(currentShot ?? 1) - 1]) : selectedConcept ? `Selected: ${selectedConcept.conceptName}` : "Choose a direction to generate its storyboard"}</small></footer>
  </main>;

  return <main className="page landing-page">
    <header className="topbar"><span className="wordmark">FRAME<span>{"///"}</span></span><span>30 sec ad maker</span><span className="status-dot">Studio ready</span></header>
    <section className="hero">
      <div className="hero-copy"><p className="eyebrow">Audience-aware scripts. Shoot-ready shots.</p><h1>Ads that know<br /><i>who they&apos;re for.</i></h1><p className="intro">FRAME turns your product, audience, and single-minded proposition into one focused 30-second commercial—not another generic AI ad.</p><div className="brief-recipe" aria-label="How Frame creates your ad"><span><b>01</b> Your product</span><span><b>02</b> Your audience</span><span><b>03</b> One thing to remember</span></div><a className="text-link" href="#brief">Create my shoot-ready ad <span>↓</span></a></div>
      <div className="campaign-carousel" data-palette={showcase.palette} aria-label="Example campaign directions">
        <div className="carousel-top"><span>CAMPAIGN DIRECTION / {showcase.number}</span><div><button type="button" aria-label="Previous campaign direction" onClick={() => setShowcaseIndex((showcaseIndex + campaignDirections.length - 1) % campaignDirections.length)}>←</button><span>{showcase.number} / 05</span><button type="button" aria-label="Next campaign direction" onClick={() => setShowcaseIndex((showcaseIndex + 1) % campaignDirections.length)}>→</button></div></div>
        <div className="campaign-visual" aria-hidden="true"><span className="visual-word">{showcase.concept}</span><div className="viewfinder"><i></i><i></i><i></i><i></i></div><b>{showcase.category.split(" ")[0]}</b></div>
        <div className="campaign-copy"><div><small>OPENING HOOK</small><blockquote>“{showcase.hook}”</blockquote></div><div className="direction-details"><p><small>TONE</small>{showcase.tone}</p><p><small>SHOT TREATMENT</small>{showcase.visual}</p></div></div>
        <div className="carousel-tabs" role="tablist" aria-label="Choose an example category">{campaignDirections.map((direction, index) => <button type="button" role="tab" aria-selected={index === showcaseIndex} key={direction.category} onClick={() => setShowcaseIndex(index)}><span>{direction.number}</span>{direction.category}</button>)}</div>
      </div>
    </section>
    <section className="brief-section" id="brief">
      <div className="brief-intro"><p className="eyebrow">The brief</p><h2>Five answers.<br />One filmable idea.</h2><p>Focus the message, choose the screen, and set the visual character.</p></div>
      <form className="brief-card" onSubmit={generateConcepts}>
        <div className="section-label"><span>BR</span><h2>Creative brief</h2><em>5 decisions</em></div>
        <section className="brief-step"><div className="step-heading"><b>01</b><div><small>Brand / Product</small><h3>What are we advertising?</h3></div></div><textarea required value={form.brandProduct} onChange={(event) => setForm({ ...form, brandProduct: event.target.value })} rows={2} placeholder="e.g. Noor — one-of-one sterling silver jewellery" aria-label="What are we advertising?" /></section>
        <section className="brief-step"><div className="step-heading"><b>02</b><div><small>Audience</small><h3>Who specifically needs to care?</h3></div></div><input required maxLength={160} value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })} placeholder="e.g. Design-conscious women who value original pieces" aria-label="Who specifically needs to care?" /></section>
        <section className="brief-step"><div className="step-heading"><b>03</b><div><small>Single-minded proposition</small><h3>After watching this ad, what ONE thing should they remember?</h3></div></div><textarea required value={form.proposition} onChange={(event) => setForm({ ...form, proposition: event.target.value })} rows={2} placeholder="e.g. Every piece is made only once" aria-label="What one thing should they remember?" /></section>
        <section className="brief-step"><div className="step-heading"><b>04</b><div><small>Platform</small><h3>Where will this ad run?</h3></div></div><div className="choice-grid platform-choices" role="group" aria-label="Platform">{platforms.map((platform) => <button className="choice-chip" type="button" aria-pressed={form.platform === platform} key={platform} onClick={() => setForm({ ...form, platform })}>{platform}</button>)}</div></section>
        <section className="brief-step"><div className="step-heading"><b>05</b><div><small>Visual tone</small><h3>How should it feel?</h3></div><span className="selection-count" id="tone-limit">{form.visualTones.length} / 3</span></div><div className="choice-grid tone-choices" role="group" aria-label="Visual tone" aria-describedby="tone-limit">{visualToneOptions.map((tone) => { const selected = form.visualTones.includes(tone); const atLimit = form.visualTones.length === 3; return <button className="choice-chip" type="button" aria-pressed={selected} disabled={!selected && atLimit} key={tone} onClick={() => toggleVisualTone(tone)}>{tone}</button>; })}</div></section>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <div className="form-action"><button className="primary-button" disabled={conceptsGenerating}>{conceptsGenerating ? "Developing concepts…" : <>Develop concepts <span>↗</span></>}</button><small>3 distinct creative directions</small></div>
      </form>
    </section>
    {conceptsGenerating ? <ConceptLoading elapsed={conceptElapsed} onCancel={cancelConcepts} /> : null}
  </main>;
}

function ConceptLoading({ elapsed, onCancel }: { elapsed: number; onCancel: () => void }) {
  const status = elapsed < 4 ? ["READING YOUR BRIEF", "Finding the strongest product and audience tension."] : elapsed < 9 ? ["DRAFTING CREATIVE TERRITORIES", "Exploring different ways to dramatize the idea."] : ["BUILDING YOUR OPTIONS", "Turning the strongest directions into three concepts."];
  return <section className="concept-loading" role="status" aria-live="polite" aria-busy="true"><span className="loading-frame" aria-hidden="true">FRAME / CD</span><div><small>{status[0]}</small><strong>{status[1]}</strong>{elapsed >= 10 ? <p>Good ideas can take a moment — this usually finishes within 45 seconds.</p> : null}</div><button type="button" onClick={onCancel}>Back to brief</button></section>;
}
