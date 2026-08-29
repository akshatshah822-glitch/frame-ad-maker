# Concept-Led Storyboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate one coherent six-shot text storyboard from the approved concept and current five-field brief.

**Architecture:** Extend the existing `/api/generate` route and OpenAI Responses API call rather than adding another generator. Replace the route's legacy brief aliases with the current form contract, expand the strict shot schema, update the existing result renderer, and keep old Convex fields optional so historical records remain valid.

**Tech Stack:** Next.js 16, React 19, TypeScript, OpenAI Responses API Structured Outputs, Convex, CSS

**Spec:** User request from 2026-08-29

## Global Constraints

- Generate exactly six shots with the fixed 0–3, 3–7, 7–12, 12–18, 18–25, and 25–30 second structure.
- Pass brand/product, audience, proposition, platform, tone, and every selected-concept field.
- Keep all shots continuous in character, wardrobe, product, location logic, palette, and cinematic style.
- Do not add or call image generation; preserve `imagePrompt` for future integration.
- Keep the existing `/api/generate` route and Convex `generations` table.

---

### Task 1: Expand the existing structured storyboard generator

**Files:**
- Modify: `src/app/api/generate/route.ts`

**Interfaces:**
- Consumes: `{ brandProduct, audience, proposition, platform, visualTones, selectedConcept }`.
- Produces: `{ title, duration, shots }`, with exactly six complete production-ready shot objects.

- [ ] Replace legacy request aliases with the current brief fields and validate one to three tones.
- [ ] Define all fifteen required shot fields with `additionalProperties: false`, `minItems: 6`, and `maxItems: 6`.
- [ ] Add the approved concept and fixed narrative timing to the existing OpenAI prompt.
- [ ] Add continuity rules and require `imagePrompt` to repeat stable character, wardrobe, product, location, palette, and cinematic anchors.
- [ ] Validate parsed output and return a clear 502 response for malformed storyboards.

### Task 2: Render the expanded six-shot result

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `{ title, duration, shots }` from Task 1.
- Produces: a responsive six-shot treatment with readable primary and secondary production detail.

- [ ] Update the `Generation` type with all shot fields.
- [ ] Keep shot purpose, time, visual, action, framing, audio, and dialogue visible.
- [ ] Put lens, angle, movement, lighting, product presence, and image prompt in expandable production notes.
- [ ] Keep the FRAME result header and start-over behavior.

### Task 3: Store current brief fields and storyboard

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/generations.ts`

**Interfaces:**
- Consumes: the current five-field brief, selected concept JSON, title, and shots JSON.
- Produces: a generation record without active dependencies on legacy brief aliases.

- [ ] Add optional current brief fields to the existing table and keep legacy fields optional for historical data.
- [ ] Update the save mutation to require current fields and store visual tones as strings.
- [ ] Store the full selected concept and expanded shot list as JSON strings.

### Task 4: Verify

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: a buildable, concept-led storyboard flow.

- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Test missing selected concept and current brief validation locally.
- [ ] Confirm active client and API code no longer reference legacy brief aliases.
- [ ] Confirm no image-generation API call was introduced.
