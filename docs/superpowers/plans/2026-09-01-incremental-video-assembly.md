# Incremental Video Assembly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make final video assembly resumable, with one stored join step per HTTP request, so no request processes all six clips.

**Architecture:** Convex stores the current intermediate MP4 URL, storage ID, completed shot position, and per-step timing. The assembly route claims exactly one next position, downloads only the running intermediate and next durable clip, creates and uploads the next uniform intermediate, then saves progress. The sixth step adds the existing voice mix, performs the existing technical verification, uploads the final MP4, and marks the production ready.

**Tech Stack:** Next.js 16 Route Handlers, Convex, TypeScript, ffmpeg-static, ffprobe-static.

**Spec:** User request in the 2026-09-01 conversation.

## Global Constraints

- Each request advances at most one shot position.
- Persist intermediate media and position after every successful step.
- A failed step preserves the last successful intermediate and remains resumable.
- Run the existing final verification before setting status to `ready`.
- Do not modify clip generation, Runway calls, storyboard code, or UI.

---

### Task 1: Persist resumable assembly state

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/videoProductions.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/video-production.ts`

**Interfaces:**
- Produces: `assemblyPosition`, `assemblyStorageId`, `assemblyUrl`, `assemblyStepDurations`, and atomic mutations that claim/save/fail one assembly step.

- [ ] **Step 1: Add optional assembly fields to the production schema and TypeScript type.**
- [ ] **Step 2: Parse the fields in `parseVideoProduction`.**
- [ ] **Step 3: Add Convex mutations that claim only the next position, save a completed intermediate, and record a resumable failure without clearing prior progress.**
- [ ] **Step 4: Run `npx tsc --noEmit` and confirm it passes.**

### Task 2: Split assembly into one-shot resumable steps

**Files:**
- Modify: `src/lib/video-assembly.ts`

**Interfaces:**
- Consumes: a treatment, production, target shot position, and optional narration.
- Produces: one uploaded-ready intermediate byte array or a verified final byte array plus technical QA.

- [ ] **Step 1: Extract clip normalization so one request normalizes only its target clip.**
- [ ] **Step 2: For position 1, create a uniform running MP4 from shot 1.**
- [ ] **Step 3: For positions 2–6, re-encode the stored running MP4 with only the next normalized clip using H.264, 24 fps, yuv420p, fixed resolution, and faststart.**
- [ ] **Step 4: At position 6, add AAC audio and the existing voice segments, run `probeFinalVideo`, and reject a failed verification.**
- [ ] **Step 5: Run `npx tsc --noEmit` and confirm it passes.**

### Task 3: Advance one position per assemble request

**Files:**
- Modify: `src/app/api/video/assemble/route.ts`

**Interfaces:**
- Consumes: `{ generationId, force?, narration? }`.
- Produces: HTTP 202 with stored progress for positions 1–5, HTTP 200 with a ready production after position 6, or a readable resumable error.

- [ ] **Step 1: Replace the all-at-once call with an atomic claim for the next position.**
- [ ] **Step 2: Execute exactly one assembly step and upload its result.**
- [ ] **Step 3: Persist intermediate progress for positions 1–5; attach and finish only after verified position 6.**
- [ ] **Step 4: On failure, store the error while retaining the last successful position and intermediate URL.**
- [ ] **Step 5: Run ESLint for the changed files, `npx tsc --noEmit`, and `npm run build`.**

### Task 4: Live end-to-end proof

**Files:**
- No source changes.

**Interfaces:**
- Consumes: generation `j57azy6zsx1q594m340kqqqdds8dkp1h` with six completed clips.
- Produces: six request timings, final MP4 duration, and six midpoint frame checks.

- [ ] **Step 1: Deploy the Convex schema/functions and the application code needed for the live route.**
- [ ] **Step 2: POST the assemble endpoint six times, recording each request duration and returned position.**
- [ ] **Step 3: Download the final MP4 and run ffprobe for duration and format.**
- [ ] **Step 4: Extract midpoint frames at 2, 7, 12, 17, 23, and 28 seconds; compare hashes and inspect them visually.**
- [ ] **Step 5: Report exact timings, duration, and whether all six shot segments differ.**
