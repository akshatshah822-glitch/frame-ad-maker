# Systematic Image Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every storyboard image prompt from one shared Visual Bible plus shot-specific direction.

**Architecture:** The existing storyboard request will use OpenAI Structured Outputs to return a Visual Bible once and six shot records without final image prompts. A pure server-side builder will combine the shared Bible with each shot, so prompt wording and safety exclusions stay consistent while action and composition vary.

**Tech Stack:** Next.js 16, TypeScript, OpenAI Responses API, Convex

**Spec:** User request in the 2026-08-29 conversation.

## Global Constraints

- Keep the current OpenAI model and provider.
- Generate exactly six storyboard shots.
- Use one identical Visual Bible for all six prompts.
- Do not add image generation or expose Visual Bible controls in the UI.

---

### Task 1: Reusable image prompt builder

**Files:**
- Create: `src/lib/image-prompt.ts`

**Interfaces:**
- Consumes: `VisualBible`, `ImagePromptShot`, story context, selected tones, and platform.
- Produces: `buildImagePrompt(input: ImagePromptInput): string`.

- [ ] Define the shared Visual Bible and shot direction types.
- [ ] Map each platform to a useful aspect ratio.
- [ ] Build the requested fixed prompt sections in one pure function.

### Task 2: Generate one Bible and assemble six prompts

**Files:**
- Modify: `src/app/api/generate/route.ts`

**Interfaces:**
- Consumes: the existing brief and selected concept.
- Produces: a generation containing one `visualBible` and six shots with deterministic `imagePrompt` values.

- [ ] Extend the strict JSON schema with one Visual Bible and shot-specific `locationAndProps`.
- [ ] Stop asking the model to author final image prompts.
- [ ] Validate the Visual Bible and all six shot records.
- [ ] Add each final prompt with `buildImagePrompt` after parsing.

### Task 3: Persist shared continuity context

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/generations.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: the generated Visual Bible.
- Produces: saved Visual Bible JSON and a matching client response type.

- [ ] Add an optional historical-safe Visual Bible field to the Convex table.
- [ ] Require the Visual Bible on new saves.
- [ ] Add the Visual Bible to the client generation type without changing the visible flow.

### Task 4: Verification

**Files:**
- Verify: `src/lib/image-prompt.ts`
- Verify: `src/app/api/generate/route.ts`

**Interfaces:**
- Consumes: the completed implementation.
- Produces: build and lint evidence.

- [ ] Run `npm run lint` and review every warning.
- [ ] Run `npm run build` and confirm TypeScript and Next.js compilation pass.
- [ ] Inspect the builder call to confirm every shot receives the same Visual Bible object and its own shot direction.
