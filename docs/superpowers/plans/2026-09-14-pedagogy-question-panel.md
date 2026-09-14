# Pedagogy Question Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep an uploaded question and its options visible above the changing solution board in question-based pedagogy videos.

**Architecture:** The existing spreadsheet reader will accept five optional question fields and carry a complete question block forward from its first nonblank `question_text` row. The code-drawn slide will retain the existing concept-only layout unless an effective question exists, then draw a fixed question panel above the solution panel.

**Tech Stack:** TypeScript, XLSX, React preview, Sharp SVG slides, existing pedagogy renderer.

**Spec:** User request in this conversation: optional `question_text`, `option_a`, `option_b`, `option_c`, and `option_d` spreadsheet columns; question and options permanently visible above the solution box.

## Global Constraints

- Existing required pedagogy columns remain unchanged.
- The five question fields are optional; old concept briefs retain the current slide layout.
- Import question and option text character-for-character; do not rewrite or normalize it.
- Do not change narration, timing, audio, database schemas, validators, environment variables, or ad/film paths.
- No merge or deployment.

---

### Task 1: Preserve optional question fields through the brief

**Files:**
- Modify: `src/lib/pedagogy-brief.ts`
- Modify: `src/lib/pedagogy-workbook.ts`
- Modify: `src/app/api/question/pedagogy/render/route.ts`
- Test: `tests/pedagogy-brief.test.ts`

**Interfaces:**
- Consumes: first-worksheet row objects with optional `question_text` and `option_a` through `option_d`.
- Produces: `PedagogyRow.questionText`, `options`, `effectiveQuestionText`, and `effectiveOptions`.

- [x] Parse each optional field without making it required.
- [x] Carry the complete question block forward after a nonblank question text, including intentionally blank options.
- [x] Preserve optional fields through preview-to-render rows.
- [x] Test old rows and question rows character-for-character.

### Task 2: Draw the fixed question panel

**Files:**
- Modify: `src/lib/pedagogy-slide.ts`
- Modify: `src/lib/pedagogy-video.ts`
- Test: `tests/pedagogy-slide.test.ts`

**Interfaces:**
- Consumes: `PedagogySlideState.questionText` and `options`.
- Produces: a question panel above the solution panel only when the question text is nonblank.

- [x] Fit question and options into a top panel without changing the concept-only layout.
- [x] Keep exact whitespace, punctuation, and Unicode values in the SVG.
- [x] Pass effective question data to every adjusted-timeline slide.
- [x] Test fixed question presence, option presence, carry-forward, and absent-question fallback.

### Task 3: Surface and verify the optional fields

**Files:**
- Modify: `src/components/pedagogy-brief-upload.tsx`
- Test: `tests/pedagogy-upload.spec.ts`

**Interfaces:**
- Consumes: preview rows containing optional question data.
- Produces: a question preview column when question text is available.

- [x] Display imported question text in the preview without changing manual mode.
- [x] Run focused unit/UI tests, TypeScript, and production build.
- [x] Verify changed paths exclude the ad/film flow.
