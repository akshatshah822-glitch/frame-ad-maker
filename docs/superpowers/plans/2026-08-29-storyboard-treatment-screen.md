# Storyboard Treatment Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the six-shot result into an image-led commercial treatment with clear filmmaking information.

**Architecture:** Keep the current result data and generation flow. Replace only the result markup and its CSS, using native details controls for secondary generation information and an honest visual placeholder until generated image URLs exist.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS

**Spec:** User request in the 2026-08-29 conversation.

## Global Constraints

- Keep exactly six generated frames in narrative order.
- Do not show raw image prompts by default.
- Do not add shot-directing controls.
- Preserve FRAME tokens and mobile behavior.

---

### Task 1: Treatment markup

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: existing `generation`, `selectedConcept`, and six shots.
- Produces: concept masthead and six semantic shot figures with expandable generation details.

- [ ] Replace the current result header with concept name and one-line idea.
- [ ] Render each shot as a figure-led treatment panel in its existing array order.
- [ ] Keep camera, action, audio, and optional dialogue visible.
- [ ] Place lighting, production design, product continuity, and raw prompt inside `View generation details`.

### Task 2: Treatment styling and checks

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: the new treatment class names.
- Produces: dominant 16:9 frame wells, editorial shot metadata, and one-column mobile layout.

- [ ] Replace the old equal-weight card styling with an image-first two-column sequence.
- [ ] Add a film-frame empty state that never implies an image was generated.
- [ ] Run `npm run lint` and `npm run build`.
