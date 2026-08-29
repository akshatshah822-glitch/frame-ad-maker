# FRAME Creative Director Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert a concepts-only generation and selection step between the brief and the existing storyboard generator.

**Architecture:** Add a dedicated Next.js route that calls the existing OpenAI Responses API model with a strict three-concept JSON schema. Keep the existing storyboard route unchanged, and hold concepts plus the selected concept in client state until the next product step connects selection to storyboard generation.

**Tech Stack:** Next.js 16, React 19, TypeScript, OpenAI Responses API Structured Outputs, CSS

**Spec:** User request from 2026-08-29

## Global Constraints

- Flow is Brief → Generate Concepts → Show 3 concepts → User selects one → Generate Storyboard.
- Generate exactly three fundamentally different concepts.
- Do not generate images.
- Do not remove or modify the current storyboard result shape.
- The selected concept is stored in client state but does not feed storyboard generation until the next step.

---

### Task 1: Add the concepts API

**Files:**
- Create: `src/app/api/concepts/route.ts`

**Interfaces:**
- Consumes: `{ brandProduct: string; audience: string; proposition: string; visualTones: string[]; platform: string }`.
- Produces: `{ concepts: Concept[] }`, where `Concept` contains `conceptName`, `idea`, `hook`, `story`, `productRole`, `visualWorld`, and `ending` strings.

- [ ] Define a strict JSON Schema with one `concepts` array, `minItems: 3`, `maxItems: 3`, and no additional properties.
- [ ] Validate every brief field, require one to three visual tones, and reject malformed request JSON with a 400 response.
- [ ] Call `gpt-5-mini` through `client.responses.create` using the supplied creative-director logic and `text.format.type: "json_schema"`.
- [ ] Parse output defensively, verify exactly three complete concepts, and return a clear 502 error for malformed output.
- [ ] Preserve the existing API-key and rate-limit error messages.

### Task 2: Add concept generation and selection UI

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `{ concepts: Concept[] }` from Task 1.
- Produces: `selectedConcept: Concept | null` in client state for the next storyboard step.

- [ ] Change brief submission to call `/api/concepts` and label the action `Generate concepts`.
- [ ] Render exactly three numbered concept cards with the concept type, name, idea, hook, story, product role, visual world, and ending.
- [ ] Use native selection buttons with `aria-pressed` and FRAME's saved ink/coral selected state.
- [ ] Enable `Generate storyboard` only after selection; for this step, keep it non-submitting so storyboard generation does not run prematurely.
- [ ] Add `Edit brief` and `Try three new concepts` actions with clear loading and error states.
- [ ] Stack cards and actions at mobile widths.

### Task 3: Verify

**Files:**
- Verify: `src/app/api/concepts/route.ts`
- Verify: `src/app/page.tsx`
- Verify: `src/app/globals.css`

**Interfaces:**
- Consumes: completed Tasks 1–2.
- Produces: a type-safe, buildable two-stage flow.

- [ ] Run `npm run lint` and confirm no new errors.
- [ ] Run `npm run build` and confirm TypeScript and production compilation pass.
- [ ] Confirm the page does not call `/api/generate` from the brief submission path.
