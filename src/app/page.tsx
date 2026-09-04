"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { TreatmentView } from "@/components/treatment-view";
import type { AppPhase, Brief, Concept, Generation, Shot } from "@/lib/types";
import { track } from "@/lib/analytics";
import { readJsonResponse } from "@/lib/read-json-response";
import { LandingFilmCarousel } from "@/components/landing-film-carousel";

const conceptTypes = ["Human / Emotional", "Product / Craft-led", "Unexpected / Conceptual"] as const;
const platforms = ["Instagram / Reels", "Meta Ads", "YouTube", "TV / OTT"] as const;
const visualToneOptions = ["Cinematic", "Luxury", "Raw", "Playful", "Emotional", "Bold", "Minimal", "Surreal"] as const;
const testObjectiveOptions = ["New Hook", "New Pitch", "Creative Fatigue", "Product Proof", "Offer", "New Audience", "Other"] as const;
const jewelleryFilmUrl = "https://valiant-cod-559.convex.cloud/api/storage/019fb12a-c618-4393-80a5-1382a8ddde19";
const jewelleryPosterUrl = "https://valiant-cod-559.convex.cloud/api/storage/ab73452c-2f90-4dfa-9a6e-6666cc05e54c";

const initialForm: Brief = {
  intent: "performance",
  brandProduct: "",
  audience: "",
  proposition: "",
  platform: "Instagram / Reels",
  visualTones: ["Cinematic"] as string[],
  testObjective: "New Hook",
  testObjectiveOther: "",
  preserveDetails: "",
};

const exampleBriefs: Array<{ slug: string; label: string; brief: Brief }> = [
  { slug: "ev", label: "Urban EV scooter", brief: { ...initialForm, brandProduct: "A compact electric scooter built for everyday city commutes.", audience: "Urban professionals aged 24–38 who want a cleaner, easier alternative to fuel scooters.", proposition: "Fast charging and lower daily running costs make the city commute easier.", testObjective: "Product Proof", visualTones: ["Cinematic", "Bold"] } },
  { slug: "jewellery", label: "Jewellery brand", brief: { ...initialForm, brandProduct: "A contemporary fine-jewellery collection built around one distinctive sculpted pendant.", audience: "Independent Indian women aged 28–42 who prefer personal design over familiar status symbols.", proposition: "One unmistakable piece can feel more personal than an entire jewellery box.", testObjective: "New Pitch", visualTones: ["Luxury", "Minimal"] } },
  { slug: "skincare", label: "D2C skincare", brief: { ...initialForm, brandProduct: "A lightweight daily face moisturiser designed for a simple morning skincare routine.", audience: "Busy skincare-aware women aged 22–34 who want fewer steps before starting their day.", proposition: "One moisturiser fits naturally into a quick morning routine.", testObjective: "New Hook", visualTones: ["Cinematic", "Minimal"] } },
];

export default function Home() {
  const [form, setForm] = useState(initialForm);
  const [briefTopic, setBriefTopic] = useState("");
  const [briefGenerating, setBriefGenerating] = useState(false);
  const [briefGenerationError, setBriefGenerationError] = useState("");
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [concepts, setConcepts] = useState<Concept[] | null>(null);
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [phase, setPhase] = useState<AppPhase>("idle");
  const [conceptElapsed, setConceptElapsed] = useState(0);
  const [currentShot, setCurrentShot] = useState<number | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runStep, setRunStep] = useState("");
  const [runError, setRunError] = useState("");
  const [phaseElapsed, setPhaseElapsed] = useState(0);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const generationRunRef = useRef(false);
  const runIdRef = useRef(0);
  const conceptAbortRef = useRef<AbortController | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const briefStartedRef = useRef(false);
  const directionsShownRef = useRef(false);
  const jewelleryFilmRef = useRef<HTMLVideoElement | null>(null);
  const [submittedSignupSources, setSubmittedSignupSources] = useState<string[]>([]);
  const [signupError, setSignupError] = useState("");
  const [jewelleryFilmMuted, setJewelleryFilmMuted] = useState(true);
  const conceptsGenerating = phase === "concepts_generating";
  const storyboardWorking = phase === "storyboard_generating" || phase === "images_generating";
  const canSubmitBrief = Boolean(form.brandProduct.trim() && form.audience.trim() && form.proposition.trim());

  useEffect(() => {
    const example = new URLSearchParams(window.location.search).get("example");
    const selected = exampleBriefs.find((item) => item.slug === example);
    if (!selected) return;
    setForm({ ...selected.brief, visualTones: [...selected.brief.visualTones] });
    if (window.location.hash !== "#brief") return;
    window.setTimeout(() => {
      const root = document.documentElement;
      const previousScrollBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      document.getElementById("brief")?.scrollIntoView({ block: "start" });
      submitButtonRef.current?.focus({ preventScroll: true });
      window.requestAnimationFrame(() => { root.style.scrollBehavior = previousScrollBehavior; });
    }, 250);
  }, []);

  useEffect(() => {
    if (!concepts || directionsShownRef.current) return;
    directionsShownRef.current = true;
    track("directions_shown");
  }, [concepts]);

  useEffect(() => {
    const items = Array.from(document.querySelectorAll<HTMLElement>(".landing-page :is(.launch-hero,.home-film,.production-line,.thinking-section,.brief-section,.landing-footer)>*"));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    items.forEach((item, index) => item.style.setProperty("--reveal-delay", `${(index % 4) * 60}ms`));
    if (reducedMotion) {
      items.forEach((item) => item.classList.add("is-revealed"));
      return;
    }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      (entry.target as HTMLElement).classList.add("is-revealed");
      observer.unobserve(entry.target);
    }), { threshold: 0.08 });
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = jewelleryFilmRef.current;
    if (!video) return;
    let playTimer: number | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        window.clearTimeout(playTimer);
        playTimer = window.setTimeout(() => {
          video.preload = "auto";
          void video.play().catch(() => { /* Muted playback may still be blocked by browser policy. */ });
        }, 120);
      } else {
        window.clearTimeout(playTimer);
        video.pause();
      }
    }, { threshold: [0, 0.5] });
    observer.observe(video);
    return () => { window.clearTimeout(playTimer); observer.disconnect(); };
  }, []);

  function clientId() {
    const key = "frame-client-id";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const created = window.crypto.randomUUID();
    window.localStorage.setItem(key, created);
    return created;
  }

  async function submitSignup(event: FormEvent<HTMLFormElement>, source: string) {
    event.preventDefault();
    setSignupError("");
    const email = String(new FormData(event.currentTarget).get("email") || "");
    const response = await fetch("/api/signups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, source }) });
    if (!response.ok) {
      const result = await readJsonResponse<{ error?: string }>(response);
      setSignupError(result?.error || "We couldn't save that email. Try again.");
      return;
    }
    track("email_submitted");
    setSubmittedSignupSources((current) => [...current, source]);
  }

  useEffect(() => {
    if (!conceptsGenerating) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setConceptElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [conceptsGenerating]);

  useEffect(() => {
    if (!runId) return;
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
        const result = await readJsonResponse<{ run?: { step?: string; status?: string; error?: string } }>(response);
        if (!stopped && response.ok && result.run) {
          setRunStep(result.run.step || "");
          setRunError(result.run.status === "failed" ? result.run.error || "This step failed." : "");
        }
      } catch { /* The active request remains the source of error handling. */ }
    };
    void poll();
    const timer = window.setInterval(poll, 1500);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [runId]);

  useEffect(() => {
    if (!["concepts_generating", "storyboard_generating", "images_generating"].includes(phase)) { setPhaseElapsed(0); return; }
    const started = Date.now();
    setPhaseElapsed(0);
    const timer = window.setInterval(() => setPhaseElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  function toggleVisualTone(tone: string) {
    setForm((current) => {
      const selected = current.visualTones.includes(tone);
      if (selected) return { ...current, visualTones: current.visualTones.filter((item) => item !== tone) };
      if (current.visualTones.length === 3) return current;
      return { ...current, visualTones: [...current.visualTones, tone] };
    });
  }

  async function generateBriefFromTopic() {
    const topic = briefTopic.trim();
    if (!topic || briefGenerating) return;
    setBriefGenerating(true);
    setBriefGenerationError("");
    try {
      const response = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
        signal: AbortSignal.timeout(60_000),
      });
      const result = await readJsonResponse<{ brief?: Brief; error?: string }>(response);
      if (!response.ok || !result.brief) throw new Error(result.error || "The brief could not be generated.");
      setForm({ ...result.brief, visualTones: [...result.brief.visualTones] });
      setError("");
      window.requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("#brief textarea")?.focus({ preventScroll: true }));
    } catch (reason) {
      setBriefGenerationError(reason instanceof Error ? reason.message : "The brief could not be generated.");
    } finally {
      setBriefGenerating(false);
    }
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
      const runResponse = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientId(), brief: form }),
        signal: controller.signal,
      });
      const runResult = await readJsonResponse<{ runId?: unknown; error?: string }>(runResponse);
      const createdRunId = String(runResult.runId ?? "").trim();
      if (!runResponse.ok || !createdRunId) throw new Error(runResult.error || "The run could not be started.");
      setRunId(createdRunId);
      const response = await fetch("/api/concepts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, runId: createdRunId }),
        signal: controller.signal,
      });
      const result = await readJsonResponse<{ concepts?: Concept[]; error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "The creative directions could not be generated.");
      if (!Array.isArray(result.concepts) || result.concepts.length !== 3) throw new Error("The creative directions came back incomplete. Please generate them again.");
      let availableConcepts = result.concepts;
      try {
        const statusResponse = await fetch(`/api/runs/${createdRunId}`, { cache: "no-store", signal: controller.signal });
        const statusResult = await readJsonResponse<{ run?: { concepts?: string } }>(statusResponse);
        const persistedConcepts = statusResponse.ok && statusResult.run?.concepts ? JSON.parse(statusResult.run.concepts) : null;
        if (Array.isArray(persistedConcepts) && persistedConcepts.length === 3) availableConcepts = persistedConcepts;
      } catch {
        // The generated directions remain usable if persistence is briefly unavailable.
      }
      if (requestRun !== runIdRef.current) return;
      setConcepts(availableConcepts);
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
    track("brief_submitted");
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

  async function reconcileStoredShot(savedGenerationId: string | undefined, shotNumber: number) {
    if (!savedGenerationId) return null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt) await new Promise((resolve) => window.setTimeout(resolve, 1200));
      try {
        const response = await fetch(`/api/treatments/${savedGenerationId}`, { cache: "no-store" });
        if (!response.ok) continue;
        const result = await readJsonResponse<{ treatment?: { generation?: Generation } }>(response);
        const stored = result.treatment?.generation?.shots.find((item) => item.shotNumber === shotNumber);
        if (stored?.imageStatus === "complete" && stored.imageUrl) return stored;
      } catch {
        // A failed reconciliation check must not trigger another paid image request.
      }
    }
    return null;
  }

  async function renderShot(shot: Shot, savedGenerationId?: string, references?: { faceReferenceUrl: string; productReferenceUrl: string }, totalShots?: number) {
    updateShot(shot.shotNumber, { imageStatus: "generating", imageError: undefined });
    setCurrentShot(shot.shotNumber);
    let lastError: unknown;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        const response = await fetch("/api/images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(125_000),
          body: JSON.stringify({
            imagePrompt: shot.imagePrompt,
            platform: form.platform,
            shotNumber: shot.shotNumber,
            generationId: savedGenerationId,
            runId,
            totalShots: totalShots ?? generation?.shots.length,
            attempt,
            productPresence: shot.productPresence,
            locationAndProps: shot.locationAndProps,
            lighting: shot.lighting,
            cameraFraming: shot.cameraFraming,
            cameraAngle: shot.cameraAngle,
            lensSuggestion: shot.lensSuggestion,
            cameraMovement: shot.cameraMovement,
            ...references,
          }),
        });
        const result = await readJsonResponse<{ error?: string; imageStatus?: "complete" | "blocked"; imageError?: string; imageUrl?: string; imageStorageId?: string; faceReferenceUrl?: string; productReferenceUrl?: string }>(response);
        if (!response.ok) throw new Error(result.error || "This frame couldn't be rendered.");
        if (result.imageStatus === "blocked") {
          updateShot(shot.shotNumber, { imageStatus: "blocked", imageError: result.imageError || "This frame was blocked. Reword it and try again." });
          return { imageStatus: "blocked" as const };
        }
        updateShot(shot.shotNumber, {
          imageStatus: "complete",
          imageUrl: result.imageUrl,
          imageStorageId: result.imageStorageId,
          imageError: undefined,
        });
        return { ...result, imageStatus: "complete" as const };
      } catch (error) {
        lastError = error;
        const stored = await reconcileStoredShot(savedGenerationId, shot.shotNumber);
        if (stored) {
          updateShot(shot.shotNumber, {
            imageStatus: "complete",
            imageUrl: stored.imageUrl,
            imageStorageId: stored.imageStorageId,
            imageError: undefined,
          });
          return { imageStatus: "complete" as const };
        }
        if (attempt < 4) await new Promise((resolve) => window.setTimeout(resolve, 750 * (2 ** (attempt - 1))));
      }
    }
    const reason = lastError instanceof Error ? lastError.message : "This frame couldn't be rendered after three retries.";
    updateShot(shot.shotNumber, { imageStatus: "failed", imageError: reason });
    return { imageStatus: "failed" as const };
  }

  async function renderAllShots(storyboard: Generation, runId: number, savedGenerationId?: string) {
    let references: { faceReferenceUrl: string; productReferenceUrl: string } | undefined;
    let loadedCount = 0;
    for (const shot of storyboard.shots) {
      if (runIdRef.current !== runId) return;
      const result = await renderShot(shot, savedGenerationId, references, storyboard.shots.length);
      if (result.imageStatus === "complete") loadedCount += 1;
      if (shot.shotNumber === 1 && result.imageStatus === "complete" && result.faceReferenceUrl && result.productReferenceUrl) {
        references = { faceReferenceUrl: result.faceReferenceUrl, productReferenceUrl: result.productReferenceUrl };
      }
    }
    if (runIdRef.current === runId) {
      setCurrentShot(null);
      setPhase(loadedCount === storyboard.shots.length ? "storyboard_ready" : "storyboard_incomplete");
    }
  }

  async function generateStoryboard(concept: Concept) {
    if (generationRunRef.current) return;
    generationRunRef.current = true;
    const generationRun = ++runIdRef.current;
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
          intent: form.intent,
          testObjective: form.testObjective,
          testObjectiveOther: form.testObjectiveOther,
          preserveDetails: form.preserveDetails,
          runId,
        }),
      });
      const result = await readJsonResponse<{ generation?: Generation; generationId?: string; saved?: boolean; error?: string }>(response);
      if (!response.ok || !result.generation) throw new Error(result.error || "The storyboard response was incomplete. Try again.");
      const savedGenerationId = String(result.generationId ?? "").trim();
      if (!result.saved || !savedGenerationId) throw new Error("We could not save this treatment. Retry.");
      setGeneration(result.generation);
      setGenerationId(savedGenerationId);
      setSaved(true);
      window.history.replaceState(window.history.state, "", `/treatment/${encodeURIComponent(savedGenerationId)}`);
      setPhase("images_generating");
      await renderAllShots(result.generation, generationRun, savedGenerationId);
    } catch (err) {
      if (runIdRef.current !== generationRun) return;
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("error");
    } finally {
      generationRunRef.current = false;
    }
  }

  async function retryShot(shot: Shot) {
    setPhase("images_generating");
    const result = await renderShot(shot, generationId ?? undefined);
    setCurrentShot(null);
    const otherComplete = generation?.shots.filter((item) => item.shotNumber !== shot.shotNumber && item.imageStatus === "complete").length ?? 0;
    setPhase(result.imageStatus === "complete" && otherComplete + 1 === generation?.shots.length ? "storyboard_ready" : "storyboard_incomplete");
  }

  function restart() {
    runIdRef.current += 1;
    generationRunRef.current = false;
    setGeneration(null);
    setConcepts(null);
    setSelectedConcept(null);
    setGenerationId(null);
    setRunId(null);
    setRunStep("");
    setRunError("");
    setSaved(null);
    setPhase("idle");
    setCurrentShot(null);
    setError("");
  }

  if (generation && selectedConcept) return <TreatmentView treatment={{ id: generationId ?? undefined, brief: form, concept: selectedConcept, generation }} phase={phase} saved={saved} currentShot={currentShot} progressStep={runStep} progressElapsed={phaseElapsed} onRetryShot={retryShot} onRestart={restart} />;

  if (concepts) return <main className="page concepts-page">
    <header className="topbar"><button className="wordmark" onClick={() => { setConcepts(null); setSelectedConcept(null); setPhase("idle"); }}>FRAME<span>{"///"}</span></button><span>Creative director</span><button className="new-button" onClick={() => { setConcepts(null); setSelectedConcept(null); setError(""); setPhase("idle"); }}>Edit brief</button></header>
    <section className="concepts-header"><div><p className="eyebrow">Three creative territories</p><h1>Choose the idea<br /><i>worth making.</i></h1></div><p>Each route starts from the same product truth. Select the one that gives your brand the strongest way into culture.</p></section>
    <div className="concept-grid">{concepts.map((concept, index) => { const selected = selectedConcept === concept; const buildingThis = selected && storyboardWorking; const strategyLabel = form.intent === "performance" ? "WHAT THIS TESTS" : "LOGLINE"; const strategyValue = form.intent === "performance" ? concept.whatThisTests : concept.logline; return <article className="concept-card" data-selected={selected} key={`${concept.conceptName}-${index}`}><header><span>0{index + 1}</span><small>{form.intent === "performance" ? (concept.creativeMechanism || conceptTypes[index]) : "Cinematic direction"}</small></header><div className="concept-title"><p>Creative territory</p><h2>{concept.conceptName}</h2><strong>{concept.idea}</strong></div>{strategyValue && strategyValue !== "Not applicable" ? <div className="concept-test"><small>{strategyLabel}</small><p>{strategyValue}</p></div> : null}<div className="concept-detail concept-hook"><small>{form.intent === "performance" ? "HOOK" : "HUMAN TRUTH"}</small><p>{form.intent === "performance" ? concept.hook : (concept.humanTruth || concept.hook)}</p></div><div className="concept-detail concept-visual"><small>VISUAL FEEL</small><p>{concept.visualWorld}</p></div><details className="concept-more"><summary>View story <span>+</span></summary><div><section><small>STORY</small><p>{concept.story}</p></section><section><small>{form.intent === "performance" ? "PROOF MECHANISM" : "CENTRAL CONFLICT"}</small><p>{form.intent === "performance" ? (concept.proofMechanism || concept.productRole) : (concept.centralConflict || concept.productRole)}</p></section><section><small>ENDING</small><p>{concept.ending}</p></section></div></details><button className="concept-select" type="button" aria-pressed={selected} disabled={storyboardWorking || conceptsGenerating} onClick={() => generateStoryboard(concept)}>{buildingThis ? "Building storyboard…" : "Choose this direction"}<span>{buildingThis ? "•••" : "↗"}</span></button></article>; })}</div>
    {error || runError ? <p className="error concepts-error" role="alert">{error || runError} <button type="button" onClick={() => selectedConcept ? generateStoryboard(selectedConcept) : requestConcepts()}>Retry failed step</button></p> : null}
    {conceptsGenerating ? <ConceptLoading elapsed={conceptElapsed} intent={form.intent} statusOverride={runStep} onCancel={cancelConcepts} /> : null}
    <footer className="concept-actions"><button className="new-button" type="button" disabled={conceptsGenerating || storyboardWorking} onClick={regenerateConcepts}>Generate 3 new directions</button><small>{storyboardWorking ? `${runStep || (phase === "storyboard_generating" ? "Building the storyboard" : `Drawing frame ${currentShot ?? 1}`)} · ${phaseElapsed}s elapsed` : selectedConcept ? `Selected: ${selectedConcept.conceptName}` : "Choose a direction to generate its storyboard"}</small></footer>
  </main>;

  return <main className="page landing-page">
    <header className="topbar landing-nav"><span className="wordmark">FRAME<span>{"///"}</span></span><nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#brief">Create an ad</a></nav><a className="nav-cta" href="#brief">Start with a brief <span>↗</span></a></header>
    <section className="launch-hero">
      <h1>Turn your brief into the film.</h1>
      <LandingFilmCarousel />
      <a className="launch-primary" href="#brief">Create an ad <span>↗</span></a>
      <div className="example-briefs" aria-label="Try an example brief">{exampleBriefs.map((example) => { const selected = form.brandProduct === example.brief.brandProduct; return <a key={example.label} data-selected={selected} aria-current={selected ? "true" : undefined} href={`/?example=${example.slug}#brief`}>{example.label}</a>; })}</div>
    </section>
    <section className="home-film" aria-labelledby="home-film-title">
      <h2 id="home-film-title">Made by FRAME from one brief.</h2>
      <div className="home-film-player">
        <video ref={jewelleryFilmRef} muted={jewelleryFilmMuted} loop playsInline preload="none" poster={jewelleryPosterUrl} aria-label="Finished jewellery advertisement made by FRAME"><source src={jewelleryFilmUrl} type="video/mp4" /></video>
        <button type="button" className="film-sound-toggle" aria-label={jewelleryFilmMuted ? "Unmute film" : "Mute film"} aria-pressed={!jewelleryFilmMuted} onClick={() => setJewelleryFilmMuted((muted) => !muted)}><span aria-hidden="true">{jewelleryFilmMuted ? "🔇" : "🔊"}</span></button>
      </div>
      <div className="home-film-capture">
        <h3>Make one for my product</h3>
        {submittedSignupSources.includes("home-under-film") ? <p role="status">We’ll be in touch.</p> : <form className="updates-form" onSubmit={(event) => void submitSignup(event, "home-under-film")}><label className="sr-only" htmlFor="film-email">Email</label><input id="film-email" name="email" type="email" required placeholder="you@company.com" /><button type="submit">Make one for my product</button></form>}
        {signupError ? <p className="error" role="alert">{signupError}</p> : null}
      </div>
    </section>
    <section className="production-line" id="how-it-works" aria-label="FRAME creative workflow"><span><b>01</b> Brief</span><i>→</i><span><b>02</b> Creative directions</span><i>→</i><span><b>03</b> Visual direction</span><i>→</i><span><b>04</b> Directed treatment</span></section>
    <section className="thinking-section">
      <div><p className="eyebrow">Not prompt to pixels</p><h2>FRAME <span className="keep-together">figures out</span><br />what to make first.</h2></div>
      <div className="thinking-grid"><article><span>01</span><h3>Finds the idea</h3><p>Three genuinely different creative territories, built from your audience and objective.</p></article><article><span>02</span><h3>Directs the story</h3><p>One visual world, a structure chosen for the idea, and production direction that holds together.</p></article><article><span>03</span><h3>Builds the treatment</h3><p>Production-ready frames and clear shot direction you can review, share, and produce.</p></article></div>
    </section>
    <section className="brief-section">
      <div className="brief-intro"><p className="eyebrow">Start here</p><h2>Your brief<br />becomes the treatment.</h2><p>No production language needed. Give FRAME the decisions only you can make.</p><div className="brief-promise"><span>YOU BRING</span><strong>Product · audience · one message</strong><span>FRAME BUILDS</span><strong>Idea · direction · storyboard · frames</strong></div></div>
      <form className="brief-card" id="brief" onSubmit={generateConcepts} onFocus={() => { if (!briefStartedRef.current) { briefStartedRef.current = true; track("brief_started"); } }}>
        <div className="section-label"><span>BR</span><h2>Creative brief</h2><em>Focused brief</em></div>
        <section className="brief-generator" aria-labelledby="brief-generator-title">
          <div><small>Start with one line</small><h3 id="brief-generator-title">What should the film be about?</h3><p>FRAME will draft the complete brief below. Every field stays editable.</p></div>
          <div className="brief-generator-control"><input type="text" maxLength={240} value={briefTopic} onChange={(event) => setBriefTopic(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void generateBriefFromTopic(); } }} placeholder="e.g. the revolt of 1857" aria-label="Topic or product idea" disabled={briefGenerating} /><button type="button" onClick={() => void generateBriefFromTopic()} disabled={briefGenerating || briefTopic.trim().length < 3}>{briefGenerating ? "Drafting brief…" : "Generate brief"}<span aria-hidden="true">↘</span></button></div>
          {briefGenerationError ? <p className="brief-generator-error" role="alert">{briefGenerationError}</p> : <small className="brief-generator-status" aria-live="polite">{briefGenerating ? "Turning your idea into the existing brief fields…" : "Or fill in the brief yourself below."}</small>}
        </section>
        <section className="intent-step"><small>What do you want to create?</small><div className="intent-choices" role="group" aria-label="What do you want to create?"> <button className="intent-choice" type="button" aria-pressed={form.intent === "performance"} onClick={() => setForm({ ...form, intent: "performance" })}><strong>Performance ad</strong><span>Create around a hook, pitch, proof or offer you want to test.</span></button><button className="intent-choice" type="button" aria-pressed={form.intent === "cinematic"} onClick={() => setForm({ ...form, intent: "cinematic" })}><strong>Cinematic story</strong><span>Turn an idea into a visual story, scene by scene.</span></button></div></section>
        <section className="brief-step"><div className="step-heading"><b>01</b><div><small>{form.intent === "performance" ? "Brand / Product" : "Story / Subject"}</small><h3>{form.intent === "performance" ? "What are we advertising?" : "What's the story about?"}</h3></div></div><textarea required value={form.brandProduct} onChange={(event) => setForm({ ...form, brandProduct: event.target.value })} rows={2} placeholder={form.intent === "performance" ? "e.g. A protein snack for busy workdays" : "e.g. A working SSC aspirant studies after everyone sleeps"} aria-label={form.intent === "performance" ? "What are we advertising?" : "What's the story about?"} /></section>
        <section className="brief-step"><div className="step-heading"><b>02</b><div><small>Audience</small><h3>{form.intent === "performance" ? "Who specifically needs to care?" : "Who is this for?"}</h3></div></div><textarea required maxLength={160} rows={2} value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })} placeholder="Be specific about the person" aria-label={form.intent === "performance" ? "Who specifically needs to care?" : "Who is this for?"} /></section>
        <section className="brief-step proposition-step"><div className="step-heading"><b>03</b><div><small>{form.intent === "performance" ? "Single-minded proposition" : "Emotional takeaway"}</small><h3>{form.intent === "performance" ? "What's the ONE thing they should remember?" : "What should they feel or remember?"}</h3></div></div><textarea required value={form.proposition} onChange={(event) => setForm({ ...form, proposition: event.target.value })} rows={2} placeholder="One clear takeaway" aria-label={form.intent === "performance" ? "What one thing should they remember?" : "What should they feel or remember?"} /></section>
        <details className="advanced-brief"><summary>Advanced <span>Test, platform and tone</span></summary><div>
          {form.intent === "performance" ? <section className="brief-step"><div className="step-heading"><b>+</b><div><small>Creative test</small><h3>What are you trying to test?</h3></div></div><div className="choice-grid test-choices" role="group" aria-label="What are you trying to test?">{testObjectiveOptions.map((test) => <button className="choice-chip" type="button" aria-pressed={form.testObjective === test} key={test} onClick={() => setForm({ ...form, testObjective: test })}>{test}</button>)}</div>{form.testObjective === "Other" ? <input maxLength={120} value={form.testObjectiveOther} onChange={(event) => setForm({ ...form, testObjectiveOther: event.target.value })} placeholder="What do you want to learn?" aria-label="Describe what you want to test" /> : null}</section> : null}
          <section className="brief-step"><div className="step-heading"><b>+</b><div><small>Platform</small><h3>{form.intent === "performance" ? "Where will this ad run?" : "Where will this content run?"}</h3></div></div><div className="choice-grid platform-choices" role="group" aria-label="Platform">{platforms.map((platform) => <button className="choice-chip" type="button" aria-pressed={form.platform === platform} key={platform} onClick={() => setForm({ ...form, platform })}>{platform}</button>)}</div></section>
          <section className="brief-step"><div className="step-heading"><b>+</b><div><small>Visual tone</small><h3>How should it feel?</h3></div><span className="selection-count" id="tone-limit">{form.visualTones.length} / 3</span></div><div className="choice-grid tone-choices" role="group" aria-label="Visual tone" aria-describedby="tone-limit">{visualToneOptions.map((tone) => { const selected = form.visualTones.includes(tone); const atLimit = form.visualTones.length === 3; return <button className="choice-chip" type="button" aria-pressed={selected} disabled={!selected && atLimit} key={tone} onClick={() => toggleVisualTone(tone)}>{tone}</button>; })}</div></section>
        </div></details>
        {form.intent === "cinematic" ? <section className="brief-step optional-step"><div className="step-heading"><b>+</b><div><small>Optional continuity</small><h3>Any character, setting or cultural detail we must preserve?</h3></div></div><input maxLength={240} value={form.preserveDetails} onChange={(event) => setForm({ ...form, preserveDetails: event.target.value })} placeholder="e.g. Shared room in Jaipur; modest office clothes; no pity imagery" aria-label="Character, setting or cultural detail to preserve" /></section> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
        <div className="form-expectation">{form.intent === "performance" ? "FRAME will develop three different creative directions around your test." : "FRAME will develop three different storytelling directions from your idea."}</div><div className="form-action"><button ref={submitButtonRef} className="primary-button" disabled={conceptsGenerating || !canSubmitBrief}>{conceptsGenerating ? "Developing directions…" : <>Develop directions <span>↗</span></>}</button>{!canSubmitBrief ? <p className="required-helper">Fill the three answers above</p> : <small>3 distinct creative directions</small>}</div>
      </form>
    </section>
    <footer className="landing-footer"><span className="wordmark">FRAME<span>{"///"}</span></span>{submittedSignupSources.includes("footer") ? <p role="status">You’re on the FRAME updates list.</p> : <form className="updates-form" onSubmit={(event) => void submitSignup(event, "footer")}><label htmlFor="updates-email">Get launch updates</label><input id="updates-email" name="email" type="email" required placeholder="you@company.com" /><button type="submit">Join</button></form>}<a href="#brief">Start creating ↑</a></footer>
    {conceptsGenerating ? <ConceptLoading elapsed={conceptElapsed} intent={form.intent} statusOverride={runStep} onCancel={cancelConcepts} /> : null}
  </main>;
}

function ConceptLoading({ elapsed, intent, statusOverride, onCancel }: { elapsed: number; intent: Brief["intent"]; statusOverride?: string; onCancel: () => void }) {
  const status = intent === "performance"
    ? elapsed < 4 ? ["UNDERSTANDING YOUR TEST", "Finding the strongest product, audience and response tension."] : elapsed < 9 ? ["DEVELOPING CREATIVE DIRECTIONS", "Exploring different ways to test the idea."] : ["BUILDING THE IDEA", "Turning the strongest routes into three directions."]
    : elapsed < 4 ? ["FINDING THE HUMAN STORY", "Looking for the character, conflict and emotional truth."] : elapsed < 9 ? ["DEVELOPING STORY DIRECTIONS", "Exploring three distinct ways into the story."] : ["BUILDING THE WORLD", "Turning the strongest routes into three directions."];
  return <section className="concept-loading" role="status" aria-live="polite" aria-busy="true"><span className="loading-frame" aria-hidden="true">FRAME / CD</span><div><small>{statusOverride || status[0]}</small><strong>{status[1]}</strong>{elapsed >= 10 ? <p>Creative directions can take about a minute. Building the complete treatment and frames may take several minutes.</p> : null}</div><button type="button" onClick={onCancel}>Back to brief</button></section>;
}
