# Continuous Narration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one continuous OpenAI `cedar` narration track from a generation's saved script to the final assembled film.

**Architecture:** Load the optional saved script into `TreatmentData`, generate one MP3 only during the last incremental assembly step, and replace all clip audio with that track plus silence padding. Reject narration longer than the film so it is never silently cut off.

**Tech Stack:** TypeScript, Next.js, Convex, OpenAI Audio API, FFmpeg

**Spec:** User request in the active conversation.

## Global Constraints

- Do not regenerate clips or call Runway.
- Do not change storyboard code, brief generation, or treatment page layout.
- Use one continuous `cedar` track beginning at 0:00.
- Mute source-clip audio and never cut narration off.
- Do not deploy.

---

### Task 1: Load and generate saved narration

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/treatment.ts`
- Modify: `src/lib/voice.ts`

**Interfaces:**
- Consumes: `generations.script`
- Produces: `Generation.script?: string` and `generateNarrationTrack(script: string): Promise<Uint8Array>`

- [ ] Add the optional saved script to the parsed treatment type.
- [ ] Replace per-shot generation with one `gpt-4o-mini-tts` request using `cedar`.
- [ ] Typecheck the changed interfaces.

### Task 2: Mix narration only at final assembly

**Files:**
- Modify: `src/lib/video-assembly.ts`

**Interfaces:**
- Consumes: `TreatmentData.generation.script` and `generateNarrationTrack`
- Produces: a silent intermediate MP4 or a final MP4 containing one narration track from 0:00

- [ ] Keep intermediate assembly audio silent and ignore source-clip audio.
- [ ] Generate narration once at the last assembly position.
- [ ] Probe narration duration and reject it if longer than the film.
- [ ] Pad shorter narration with silence to the film duration.

### Task 3: Verify

**Files:**
- Test: `src/lib/voice.ts`
- Test: `src/lib/video-assembly.ts`

**Interfaces:**
- Consumes: project scripts and local OpenAI credentials
- Produces: typecheck, lint, build, and duration evidence

- [ ] Run typecheck.
- [ ] Run lint.
- [ ] Run a local production build.
- [ ] Generate the saved script locally with `cedar`, probe it, and report its duration beside the 30-second film duration.
