# FRAME Brief Form Step 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing brief controls with a focused five-part creative brief while preserving the current generation endpoint and result.

**Architecture:** Keep the form and state in the existing client page. Submit the three text answers through the current brief fields, include platform and visual-tone state for the next product step, and make the API accept a neutral D2C category so removed UI does not silently label every brand as Fashion.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS

**Spec:** User request from 2026-08-29

## Global Constraints

- Do not change the generation result shape or results UI.
- Platform is a required single selection rendered as buttons.
- Visual tone allows one to three selections rendered as buttons.
- Do not add image uploads.
- Keep FRAME's existing ink, paper, blue, and coral visual language.

---

### Task 1: Reorganize brief state and controls

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Produces: the existing `/api/generate` request fields plus `platform: string` and `visualTones: string[]`.

- [ ] Replace the old form state with `brandProduct`, `audience`, `proposition`, `platform`, and `visualTones`.
- [ ] Add four native platform buttons with `aria-pressed` selected states.
- [ ] Add eight native tone buttons, enforce a maximum of three, and expose the selection limit to assistive technology.
- [ ] Map `brandProduct` to the existing `brandName` and `product` request keys, `audience` to `targetAudience`, and `proposition` to `usp`.
- [ ] Preserve the existing loading, error, generation, and results behavior.

### Task 2: Style the focused brief

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `.brief-step`, `.choice-grid`, `.choice-chip`, and selected/disabled button states from Task 1.

- [ ] Add a numbered section hierarchy using the existing coral accent.
- [ ] Add square, compact chips with clear default, hover, active, focus, selected, and disabled states.
- [ ] Stack fields and controls cleanly at mobile widths.

### Task 3: Preserve neutral generation input and verify

**Files:**
- Modify: `src/app/api/generate/route.ts`

**Interfaces:**
- Consumes: `brandCategory: "D2C brand"` from Task 1.
- Produces: the existing generation JSON shape without changes.

- [ ] Permit the neutral D2C category without adding platform or visual tone to the prompt yet.
- [ ] Run `npm run lint` and confirm no new errors.
- [ ] Run `npm run build` and confirm the production build succeeds.
