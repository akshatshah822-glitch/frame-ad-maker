# Brand-Aware Ad Maker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a focused landing page and make category and target audience shape every generated ad and persist with each Convex record.

**Architecture:** Keep the existing single-page Next.js flow. Extend the client brief, validate and normalize both fields in the API route, include them in the OpenAI creative brief, and pass them through the existing Convex mutation into the schema.

**Tech Stack:** Next.js 16, React 19, TypeScript, OpenAI Responses API, Convex, CSS

**Spec:** User request from 2026-08-29

## Global Constraints

- Categories are exactly: Beauty & Skincare, Food & Beverages, Snacks, Fashion, Wellness.
- Target audience is one line of free text.
- Category and target audience must influence tone, hook style, and shot list.
- Both fields must be stored on the generation record in Convex.
- Existing generation and results behavior stays unchanged.

---

### Task 1: Extend the brief and landing page

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: JSON request with `brandName`, `brandCategory`, `targetAudience`, `usp`, and `product` strings.

- [ ] Add the five category options as a module-level constant and extend the initial form state.
- [ ] Add a required category `<select>` and a required one-line audience `<input>`.
- [ ] Reshape the landing view into a responsive director-treatment composition while preserving the results view and submit flow.
- [ ] Add visible keyboard focus, disabled state, and reduced-motion support.
- [ ] Update page title and description to describe the concrete product.

### Task 2: Make generation category- and audience-aware

**Files:**
- Modify: `src/app/api/generate/route.ts`

**Interfaces:**
- Consumes: the five-field brief JSON from Task 1.
- Produces: the existing `Generation` JSON shape and a Convex save call carrying both new strings.

- [ ] Extend `Brief` with `brandCategory` and `targetAudience`.
- [ ] Reject missing fields and category values outside the five-item allow-list.
- [ ] Rewrite the prompt as a structured creative brief that explicitly adapts tone, opening hook, visual world, casting, and six-shot plan to the category and audience.
- [ ] Keep the response schema, model, error mapping, and response shape unchanged.

### Task 3: Persist the new brief fields

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/generations.ts`
- Regenerate: `convex/_generated/dataModel.d.ts`

**Interfaces:**
- Consumes: `brandCategory: string` and `targetAudience: string` from the API route.
- Produces: generation records containing both fields.

- [ ] Add required string validators for both fields to the table schema and save mutation.
- [ ] Regenerate Convex types if the local Convex tooling supports it.

### Task 4: Verify the complete change

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: a buildable, lint-clean feature.

- [ ] Run `npm run lint` and fix errors caused by this change.
- [ ] Run `npm run build` and fix compile or type errors caused by this change.
- [ ] Check the landing page at desktop and mobile widths if a local browser is available.
- [ ] Confirm `.env.local` remains ignored or outside version control and do not expose its values.
