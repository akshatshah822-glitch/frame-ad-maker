# Pedagogy Adjusted Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a complete pedagogy MP4 from the 151-row brief by measuring all narration, allocating every slot safely, and cascading adjusted timestamps forward.

**Architecture:** Keep imported row timestamps immutable as the original timeline. After every actual MP3 is measured, build a pure adjusted timeline with `max(originalGap, narrationDuration + 0.5)` for each non-final row and `narrationDuration + 0.5` for the final row. Preview returns the audit; renderer uses adjusted starts for slides, board states, audio delay, and video duration.

**Tech Stack:** Next.js Route Handlers, React client component, OpenAI text-to-speech, ffmpeg-static, Web Streams API, Node test runner, Playwright, ffprobe.

**Spec:** User request in this conversation, 2026-09-11.

## Global Constraints

- Work only in the exam-question pedagogy path; do not touch ad/film or manual exam-question generation.
- Do not alter narration, board text, grammar-warning meaning, spreadsheet parsing, schemas, validators, or environment variables.
- Grammar warnings are advisory and deduplicated. Narration measurement failures and invalid input remain visible errors with safe code, source row when known, and reason.
- No timing-overflow response for an otherwise valid brief; adjusted timing is automatic.
- No merge or deploy.

---

### Task 1: Build a pure adjusted timeline and complete timing audit

**Files:**
- Modify: `src/lib/pedagogy-brief.ts`
- Test: `tests/pedagogy-brief.test.ts`

**Interfaces:**
- Produces: `buildAdjustedPedagogyTimeline(rows, narrationDurations)` returning adjusted starts, allocations, total duration, and every audit field.

- [ ] **Step 1: Write a two-overflow test**

```ts
const adjusted = buildAdjustedPedagogyTimeline(rows, [6.55, 7.56, 2]);
assert.equal(adjusted.audit[0].allocatedDuration, 7.05);
assert.equal(adjusted.audit[1].adjustedGeneratedTime, 7.05);
assert.equal(adjusted.audit[1].allocatedDuration, 8.06);
```

- [ ] **Step 2: Allocate without rounding internal values**

```ts
const allocatedDuration = index === rows.length - 1
  ? narrationDuration + 0.5
  : Math.max(originalAvailableDuration, narrationDuration + 0.5);
```

- [ ] **Step 3: Cascade starts and calculate added duration**

```ts
let adjustedGeneratedTime = 0;
// Each next row starts after the preceding final allocation.
```

- [ ] **Step 4: Run the focused unit test**

Run: `npx tsx --test tests/pedagogy-brief.test.ts`

Expected: PASS.

### Task 2: Measure every row with truthful progress, then return the audit

**Files:**
- Modify: `src/lib/pedagogy-narration-duration.ts`
- Create: `src/lib/pedagogy-preview-stream.ts`
- Modify: `src/app/api/question/pedagogy/preview/route.ts`
- Test: `tests/pedagogy-brief.test.ts`

**Interfaces:**
- Produces newline-delimited progress `{ type: "progress", phase, completed, total }`, result with `timingAudit`, or safe error `{ type: "error", error, code, sourceRow }`.

- [ ] **Step 1: Emit progress after each measured MP3**

```ts
onProgress?.({ completed: index + 1, total: rows.length });
```

- [ ] **Step 2: Stream grammar, measurement, timeline, and result events**

```ts
send({ type: "progress", phase: "measuring", completed, total });
send({ type: "progress", phase: "building-timeline", completed: total, total });
```

- [ ] **Step 3: Deduplicate warnings and log only counts**

```ts
const grammarWarnings = [...new Set(await reviewPedagogyNarration(rows))];
console.warn("Pedagogy grammar warnings", { count: grammarWarnings.length });
```

- [ ] **Step 4: Run focused tests**

Run: `npx tsx --test tests/pedagogy-brief.test.ts`

Expected: PASS.

### Task 3: Render slides and audio from adjusted starts

**Files:**
- Modify: `src/lib/pedagogy-video.ts`
- Modify: `src/app/api/question/pedagogy/render/route.ts`
- Test: `tests/pedagogy-brief.test.ts`

**Interfaces:**
- Consumes: measured durations and `buildAdjustedPedagogyTimeline`.
- Produces: MP4 whose audio delays, slide start labels, board changes, and final duration use adjusted starts.

- [ ] **Step 1: Remove the early timing-overflow path from valid rendering**

```ts
const timeline = buildAdjustedPedagogyTimeline(rows, narrationDurations);
```

- [ ] **Step 2: Use adjusted starts in frame labels and audio delays**

```ts
const delay = Math.round(timeline.rows[index].adjustedGeneratedTime * 1000);
```

- [ ] **Step 3: Use calculated final end time for the MP4**

```ts
"-t", timeline.totalDuration.toFixed(6)
```

- [ ] **Step 4: Run focused tests**

Run: `npx tsx --test tests/pedagogy-brief.test.ts`

Expected: PASS.

### Task 4: Display audit and row progress in FRAME

**Files:**
- Modify: `src/components/pedagogy-brief-upload.tsx`
- Modify: `tests/pedagogy-upload.spec.ts`

**Interfaces:**
- Consumes streamed progress and the timing audit.
- Produces visible `Measuring narration: 34 of 151`, `Building adjusted timeline`, and audit table before generation.

- [ ] **Step 1: Read newline-delimited stream events**

```ts
const result = await readPedagogyPreviewStream(response, setReviewProgress);
```

- [ ] **Step 2: Show live stage and row count**

```tsx
{isReviewing ? `Measuring narration: ${reviewProgress.completed} of ${reviewProgress.total}` : fileName}
```

- [ ] **Step 3: Render every audit column**

```tsx
<th>Adjusted video time</th><th>Measured narration</th><th>Final allocation</th>
```

- [ ] **Step 4: Verify the visible progress state and manual tab**

Run: `npx playwright test tests/pedagogy-upload.spec.ts`

Expected: PASS.

### Task 5: Verify the complete supplied brief locally

**Files:**
- Verify only: `/Users/admin/Downloads/Anubhav_Sir_Pedagogy_Transcript_Timing_Fixed.xlsx`

- [ ] **Step 1: Upload the supplied 151-row file and save the audit**

Run: local preview request against `http://127.0.0.1:3002/api/question/pedagogy/preview`.

Expected: 151 measured rows, no timing-overflow error.

- [ ] **Step 2: Render the same review result to MP4**

Run: local render request with reviewed rows.

Expected: one MP4 with audio and video streams.

- [ ] **Step 3: Use ffprobe for stream and duration proof**

Run: `ffprobe -v error -show_streams -show_format -of json <mp4>`.

Expected: h264 video, AAC audio, and duration matching the calculated final end.

- [ ] **Step 4: Run lint, type-check, build, and scope inspection**

Run: focused lint, `npx tsc --noEmit`, `npm run build`, `git diff --name-only`.

Expected: all pass and no ad/film files appear.
