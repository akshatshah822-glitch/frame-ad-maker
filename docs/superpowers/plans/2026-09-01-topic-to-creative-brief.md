# Topic-to-Creative-Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user turn one topic line into the exact existing editable `Brief` object without changing the manual brief workflow or downstream contracts.

**Architecture:** A new POST route validates a short `topic`, asks OpenAI for strict structured JSON matching the existing `Brief` fields, validates every returned enum and required string, and returns `{ brief }`. The existing landing-page form adds one topic input and fills its current React state from that response; all current controls remain the source of truth and stay editable.

**Tech Stack:** Next.js 16 Route Handlers, React 19, TypeScript, OpenAI Responses API with strict JSON schema, existing global CSS system.

**Spec:** User request in the 2026-09-01 conversation.

## Global Constraints

- Keep the existing `Brief` field names and value structure unchanged.
- Keep manual entry and pasted field values working unchanged.
- Do not modify storyboard, image generation, video generation, assembly, or treatment-page code.
- Generated briefs must use only the platform, tone, intent, and test-objective values already accepted downstream.
- The generated result must populate the existing editable form before creative directions begin.

---

### Task 1: Strict brief-generation API

**Files:**
- Create: `src/app/api/brief/route.ts`
- Create: `src/lib/brief-options.ts`
- Modify: `src/app/api/concepts/route.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `{ topic: string }` where `topic` is trimmed and 3–240 characters.
- Produces: `{ brief: Brief }` with `intent`, `brandProduct`, `audience`, `proposition`, `platform`, `visualTones`, `testObjective`, `testObjectiveOther`, and `preserveDetails`.

- [ ] **Step 1: Centralize the accepted platform, tone, and test-objective constants so the generator and current form share exact values.**
- [ ] **Step 2: Add a strict JSON schema whose required keys exactly match `Brief`.**
- [ ] **Step 3: Validate the request before OpenAI and validate every generated field after parsing.**
- [ ] **Step 4: Return readable 400, 429, 502, and 503 JSON errors using the existing API helpers.**
- [ ] **Step 5: Run TypeScript and ESLint for the new route and shared constants.**

### Task 2: Populate the current editable form

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: the topic input and `/api/brief` response.
- Produces: the existing `form: Brief` state with no downstream translation.

- [ ] **Step 1: Add topic, loading, and local error state without changing the existing brief submission state.**
- [ ] **Step 2: Add one native text input and one generate button above the current intent selector.**
- [ ] **Step 3: On success, replace `form` with a defensive copy of the returned `Brief`, keeping every current textarea and choice button editable.**
- [ ] **Step 4: Add loading, disabled, error, focus, mobile, and reduced-motion styles using the existing FRAME tokens and sharp workbench pattern.**
- [ ] **Step 5: Verify manual typing and example briefs still populate and submit through the original code path.**

### Task 3: Build and browser verification

**Files:**
- No additional source files.

**Interfaces:**
- Produces: verified desktop/mobile UI and a deployed endpoint ready for end-to-end proof.

- [ ] **Step 1: Run `npx tsc --noEmit`, changed-file ESLint, and `git diff --check`.**
- [ ] **Step 2: Run the Next.js webpack production build and confirm success.**
- [ ] **Step 3: Run the app at 1440px and 390px; confirm the topic control, populated form, manual path, focus states, and no overflow.**
- [ ] **Step 4: Stage only this feature’s source and plan, commit, push, and wait for the Vercel deployment to pass.**

### Task 4: Live “revolt of 1857” proof

**Files:**
- No source changes.

**Interfaces:**
- Consumes: topic `the revolt of 1857`.
- Produces: a full `Brief`, three creative directions, and one storyboard containing exactly six valid shots.

- [ ] **Step 1: POST the topic to `/api/brief` and retain the full returned brief.**
- [ ] **Step 2: Create a normal run and POST the unchanged brief fields to `/api/concepts`; require HTTP 200 and exactly three concepts.**
- [ ] **Step 3: Select the first returned concept and POST the same brief fields plus that concept and string run ID to `/api/generate`.**
- [ ] **Step 4: Require HTTP 200, a saved generation ID, and exactly six complete storyboard shot objects; record any JSON parsing or 502 response as a failure.**
- [ ] **Step 5: Report the entire generated brief and the exact storyboard pass result.**
