# Concept Selection to Storyboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present three concepts as polished agency territories and pass the chosen complete concept into text storyboard generation.

**Architecture:** Keep concepts and selection in the existing client page. On `Choose this direction`, persist the selected object in React state and send it with the brief to the existing `/api/generate` route; the route incorporates it into the current structured script-and-six-shot request and stores it with the Convex generation record.

**Tech Stack:** Next.js 16, React 19, TypeScript, OpenAI Responses API, Convex, CSS

**Spec:** User request from 2026-08-29

## Global Constraints

- Display exactly three concepts.
- Prioritize concept name, central idea, hook, and visual world.
- Keep story, product role, and ending visually subordinate and expandable.
- Do not generate images.
- Keep the existing FRAME visual identity and storyboard result shape.

---

### Task 1: Refine concept presentation and interaction

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `Concept[]` from `/api/concepts`.
- Produces: selected `Concept` state and a storyboard request containing the complete object.

- [ ] Render type, concept name, idea, hook, and visual world as the primary treatment.
- [ ] Put story, product role, and ending in a native expandable `details` section.
- [ ] Change the regeneration label to `Generate 3 new directions` and clear selection before requesting replacements.
- [ ] Add `generateStoryboard(concept)` that stores the concept, sends it to `/api/generate`, and transitions to the existing result on success.
- [ ] Show per-selection loading and preserve the selected object when generation fails.
- [ ] Keep cards stacked and readable at mobile widths.

### Task 2: Pass and persist the selected concept

**Files:**
- Modify: `src/app/api/generate/route.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/generations.ts`

**Interfaces:**
- Consumes: `selectedConcept` with all seven concept fields.
- Produces: the existing generation response and a Convex record containing serialized selected concept data.

- [ ] Validate every selected concept field before calling OpenAI.
- [ ] Add the selected concept to the storyboard prompt as the approved creative direction.
- [ ] Keep the existing strict six-script-beat and six-shot schema unchanged.
- [ ] Store `selectedConcept` as a JSON string on the generation record.

### Task 3: Verify

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes: completed Tasks 1–2.
- Produces: a buildable concept-selection-to-storyboard flow.

- [ ] Run `npm run lint`.
- [ ] Run `npm run build` for TypeScript and production compilation.
- [ ] Confirm the selection handler sends all seven concept fields.
- [ ] Confirm regeneration clears the prior selection and requests a fresh set.
