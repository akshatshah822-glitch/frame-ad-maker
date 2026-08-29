# FRAME Launch Ad Implementation Plan

> **For agentic workers:** Execute inline; no subagent is available in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and publish one polished 20–25 second vertical FRAME launch advertisement from real FRAME UI and existing stored cinematic clips.

**Architecture:** Add a repository-scoped production script that captures actual FRAME screens, builds deterministic typography/UI sequences, selects three existing paid clips, generates one approved voice track, creates an original procedural music/SFX bed, and assembles one H.264/AAC MP4. Upload the validated result through the existing Convex storage path without changing the product flow.

**Tech Stack:** Playwright, FFmpeg/FFprobe, OpenAI TTS, Convex storage, TypeScript.

**Spec:** User-provided `FRAME LAUNCH AD — END-TO-END PRODUCTION TASK`.

## Global Constraints

- Duration is 20–25 seconds, primary format 9:16, H.264 video, AAC audio.
- Use actual FRAME UI and deterministic typography; do not generate UI or text with an AI video model.
- Reuse existing paid clips first; no new Runway request unless a selected clip materially fails QA.
- Approved VO text must remain unchanged.
- Preserve existing Next.js, Convex, OpenAI, storyboard, Visual Bible, image pipeline, and styling architecture.

---

### Task 1: Audit and source selection

**Files:**
- Read: `src/lib/video-assembly.ts`
- Read: `src/lib/video-production.ts`
- Read: `src/lib/voice.ts`
- Read: `src/app/globals.css`
- Create: `artifacts/frame-launch/source-manifest.json`

- [ ] Inspect the production record and select exactly three usable stored clips.
- [ ] Capture actual FRAME brief, concept, storyboard, and ready states.
- [ ] Record source URLs, timings, and provider usage in the manifest.

### Task 2: Launch-film production capability

**Files:**
- Create: `scripts/produce-frame-launch-ad.mjs`

**Interfaces:**
- Consumes: production record JSON, actual FRAME routes, `OPENAI_API_KEY`, FFmpeg binaries.
- Produces: `artifacts/frame-launch/frame-launch-ad.mp4`, `artifacts/frame-launch/production-report.json`.

- [ ] Create deterministic opening typography and end card at 720×1280 and 24 fps.
- [ ] Animate actual UI captures with controlled pushes and rhythmic storyboard reveals.
- [ ] Use three stored cinematic clips with a static-to-motion match cut.
- [ ] Generate the approved VO once, create an original procedural music bed and restrained SFX, then mix with ducking and limiting.
- [ ] Encode the final file as H.264/yuv420p video and AAC/48 kHz audio.

### Task 3: QA, persistence, and delivery

**Files:**
- Create: `scripts/qa-frame-launch-ad.mjs`
- Create: `artifacts/frame-launch/production-report.json`

**Interfaces:**
- Consumes: `artifacts/frame-launch/frame-launch-ad.mp4`.
- Produces: machine-readable QA and a durable Convex media URL.

- [ ] Validate duration, 720×1280 orientation, 24 fps, H.264, yuv420p, AAC, 48 kHz, audio presence, and browser metadata playback.
- [ ] Inspect representative frames for clean typography, real UI, storyboard rhythm, static-to-motion transition, and end card.
- [ ] Upload the final MP4 to Convex and confirm ranged download works.
- [ ] Run lint, TypeScript, production build, and existing browser tests.
- [ ] Commit and push only required source/report files; do not commit secrets or temporary media inputs.
