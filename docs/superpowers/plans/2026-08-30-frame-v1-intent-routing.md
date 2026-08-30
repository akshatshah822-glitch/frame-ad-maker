# FRAME V1 Intent Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing FRAME flow with Performance Ad and Cinematic Story intent routing while preserving saved treatments and working export/share behavior.

**Architecture:** Keep one brief, concepts API, storyboard API, Visual Bible, prompt builder, image queue, Convex table, and treatment renderer. Add intent-specific fields and prompt branches at the shared boundaries. Allow 4–8 generated shots while continuing to read old six-shot records.

**Tech Stack:** Next.js 16, React 19, TypeScript, OpenAI Responses/Image APIs, Convex, pdf-lib, Playwright.

**Spec:** User-provided FRAME V1 incremental upgrade specification in this session.

## Global Constraints

- Do not rebuild or create parallel generators.
- Preserve old six-shot treatments and existing export/share routes.
- Generate exactly three concepts.
- Performance asks what is being tested; Cinematic does not.
- New storyboard shot count is 4–8; each image retains independent status and retry.
- Do not require accounts or build Brand Memory.
- Do not promise reliable finished video in landing copy.

---

### Task 1: Shared domain and persistence

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/generations.ts`
- Modify: `src/lib/treatment.ts`

**Interfaces:**
- Produces: backward-compatible `Brief`, `Concept`, and dynamic `Generation` records.

- [ ] Add intent and intent-specific optional fields without invalidating stored records.
- [ ] Persist new fields as optional Convex columns.
- [ ] Accept stored treatments with 4–10 shots and default old records to Performance Ad.
- [ ] Run Convex code generation and TypeScript.

### Task 2: Shared concept engine with intent routing

**Files:**
- Modify: `src/app/api/concepts/route.ts`

**Interfaces:**
- Consumes: `Brief.intent`, performance test fields, cinematic preservation details.
- Produces: exactly three concepts with shared fields and intent-specific strategy fields.

- [ ] Expand strict JSON schema and validation.
- [ ] Add one shared creative-director prompt with Performance and Cinematic branches.
- [ ] Make `whatThisTests` materially use the selected test objective.
- [ ] Add dignity and anti-stereotype direction to Cinematic concepts.
- [ ] Run type checks.

### Task 3: Dynamic narrative architect

**Files:**
- Modify: `src/app/api/generate/route.ts`
- Modify: `src/lib/image-prompt.ts`
- Modify: `src/app/api/images/route.ts`

**Interfaces:**
- Consumes: intent, selected concept, shared Visual Bible.
- Produces: 4–8 ordered shots totalling 30 seconds with narrative beats chosen by the model.

- [ ] Remove the fixed Hook/Tension/Product/Proof/Payoff/Brand schema.
- [ ] Add useful common shot fields and validate ordered timings.
- [ ] Pass intent and narrative context into the existing image prompt builder.
- [ ] Raise safe image-route shot validation to 10 without changing retry isolation.
- [ ] Run type and build checks.

### Task 4: Landing and contextual brief

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: truthful landing message, two-choice onboarding, conditional brief, intent-aware loading.

- [ ] Replace finished-ad overpromise with production-ready creative language.
- [ ] Add accessible Performance Ad / Cinematic Story intent choices at the brief.
- [ ] Add the Performance test selector and conditional Other field.
- [ ] Add the Cinematic preservation field and contextual question labels.
- [ ] Pass all fields to both APIs and use intent-aware staged loading copy.
- [ ] Verify desktop and mobile.

### Task 5: Concept and treatment presentation

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/treatment-view.tsx`
- Modify: `src/lib/treatment.ts`
- Modify: `src/lib/treatment-pdf.ts`
- Modify: `.interface-design/system.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: old and new concept/shot shapes.
- Produces: intent-aware concept cards, treatment, clipboard text, and PDF.

- [ ] Show What this tests first for Performance and Logline/Human truth for Cinematic.
- [ ] Render dynamic narrative beats and shot totals with no fixed six-shot labels.
- [ ] Keep concise Visual/Camera/Action first and details collapsed.
- [ ] Adapt copied treatment and PDF strategy summaries to intent.
- [ ] Update system and product documentation.
- [ ] Run lint, TypeScript, build, and Playwright mobile/desktop smoke tests.
