# Pedagogy Brief Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an educator upload a pedagogy `.xlsx` brief, review its normalized teaching timeline, and render a code-drawn 16:9 exam explainer without changing the manual question flow or database schema.

**Architecture:** A server-only import route reads the first worksheet and returns immutable, normalized row data plus grammar and emphasis warnings. A separate render route re-validates that data, makes one narration track per source row, rejects timing that cannot fit, then assembles timestamped board slides and audio in ffmpeg. The new `/question` client page selects Manual or Pedagogy Brief Upload and retains the rendered video in browser memory rather than adding database fields.

**Tech Stack:** Next.js App Router route handlers and client component, TypeScript, SheetJS (`xlsx`), Sharp SVG slides, OpenAI grammar/TTS services, ffmpeg, Node test runner, Playwright.

**Spec:** User request in this conversation, 2026-09-11.

## Global Constraints

- Work only on the exam-question video path; do not edit ad/film files.
- Do not change Convex schema, validators, environment variables, or existing manual API contracts.
- Required worksheet columns are `question_id`, `line_no`, `time`, `sir_ka_vaakya`, and `board`; `emphasis` and `pause_after` are optional.
- Preserve educator narration verbatim. Grammar review only reports warnings and never supplies replacement text.
- Existing records require no migration because the pedagogy upload uses no persisted fields.
- Do not merge or deploy.

---

### Task 1: Add pure pedagogy brief validation

**Files:**
- Create: `src/lib/pedagogy-brief.ts`
- Test: `tests/pedagogy-brief.test.ts`

**Interfaces:**
- Produces: `parsePedagogyTime(value)`, `validatePedagogyRows(rows)`, `formatPedagogyTime(seconds)`, `PedagogyRow`, and `PedagogyBriefValidationError`.
- Consumes: spreadsheet row objects whose source-row positions are retained for user-facing errors.

- [ ] **Step 1: Write failing normalization tests**

```ts
assert.deepEqual(validatePedagogyRows(rows).map((row) => row.generatedTime), [0, 6, 19]);
assert.throws(() => validatePedagogyRows(duplicateLineRows), /duplicate line_no/);
assert.throws(() => validatePedagogyRows(backwardsTimeRows), /moves backwards/);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx tsx --test tests/pedagogy-brief.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement row validation**

```ts
const sorted = [...rows].sort((left, right) => left.lineNo - right.lineNo);
const offset = sorted[0].sourceSeconds;
return sorted.map((row) => ({ ...row, generatedTime: row.sourceSeconds - offset }));
```

Reject duplicate `line_no`, source times that decrease after line ordering, malformed timestamps, unknown pause values, and empty narration. Copy board and narration strings without trimming them. Carry the most recent non-empty board into `effectiveBoard`; leave it empty before the first board rather than inventing text. Emit a `Row N:` warning when a non-empty emphasis phrase is absent from that effective board.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npx tsx --test tests/pedagogy-brief.test.ts`

Expected: PASS for timestamp normalization, retained board, emphasis warning, and invalid timing cases.

### Task 2: Import the first spreadsheet sheet and grammar-review it

**Files:**
- Create: `src/app/api/question/pedagogy/preview/route.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/pedagogy-brief.test.ts`

**Interfaces:**
- Consumes: a `multipart/form-data` field named `brief` containing an `.xlsx` file.
- Produces: `{ rows, warnings, grammarWarnings }` with source time, generated time, exact narration, effective board, emphasis, pause, and source row number.

- [ ] **Step 1: Add SheetJS and test runner dependencies**

Run: `npm install xlsx && npm install --save-dev tsx`

- [ ] **Step 2: Add a failing worksheet import test**

```ts
assert.throws(() => requiredHeaders(["line_no"]), /question_id/);
```

- [ ] **Step 3: Implement the preview route**

Use `await request.formData()`, `file.arrayBuffer()`, and `XLSX.read(buffer)`. Read only `workbook.SheetNames[0]`, use header row objects with `defval: ""`, validate the required exact headers before row parsing, then call `validatePedagogyRows`.

For each exact `sir_ka_vaakya`, call `validateQuestionNarrationGrammar` without modifying the text. Return failed checks as `Row N: grammar warning: …`; do not reject solely because grammar fails. Return a 503 if grammar checking is unavailable so unreviewed narration can never be rendered.

- [ ] **Step 4: Run focused tests**

Run: `npx tsx --test tests/pedagogy-brief.test.ts`

Expected: PASS.

### Task 3: Draw and render the time-coded pedagogy video

**Files:**
- Create: `src/lib/pedagogy-slide.ts`
- Create: `src/lib/pedagogy-video.ts`
- Create: `src/app/api/question/pedagogy/render/route.ts`
- Test: `tests/pedagogy-brief.test.ts`

**Interfaces:**
- Consumes: validated `PedagogyRow[]` from the client preview.
- Produces: an MP4 response for the browser, without database storage.

- [ ] **Step 1: Write failing slide and timing tests**

```ts
await createPedagogySlide({ effectiveBoard: "x + y", emphasis: "x" });
assert.throws(() => assertNarrationFits({ rowNumber: 4, availableDuration: 2, narrationDuration: 2.4 }), /Row 4/);
```

- [ ] **Step 2: Implement a readable 16:9 board slide**

Use Sharp to rasterize an SVG at 1920×1080. Fit board text down only to its existing readable minimum. Preserve the exact board value. When a non-empty emphasis exists in the board, render that exact substring in accent color with an underline. Do not render invented emphasis.

- [ ] **Step 3: Implement the renderer**

Generate and probe every narration track before calling ffmpeg. For each non-final row, compare the measured track duration with `next.generatedTime - current.generatedTime`; throw `PedagogyBriefValidationError` containing source row number, available duration, and required narration duration when it will not fit. Build concat video durations from timestamp gaps, delay each audio input to its adjusted start, and include no extra delay beyond those timestamps. Log `pause_after=haan` rows and emphasis-missing rows with row numbers as visible server warnings.

- [ ] **Step 4: Add the render route**

Re-validate JSON rows and repeat grammar review before rendering. Return `video/mp4` with a `Content-Disposition` filename. Do not call Convex or use a schema field.

- [ ] **Step 5: Run focused tests**

Run: `npx tsx --test tests/pedagogy-brief.test.ts`

Expected: PASS.

### Task 4: Provide the selectable educator workflow

**Files:**
- Create: `src/app/question/page.tsx`
- Create: `src/components/pedagogy-brief-upload.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/pedagogy-brief.test.ts`

**Interfaces:**
- Consumes: a local `.xlsx` file and preview API data.
- Produces: an accessible preview table before the render action and a browser video preview URL after success.

- [ ] **Step 1: Create the separate question route**

Keep the landing ad/film page untouched. Put a compact manual-mode panel on `/question` that describes and links to the existing manual generation API contract. Add a second selectable mode named `Pedagogy Brief Upload`.

- [ ] **Step 2: Build the upload client component**

Use a file input restricted to `.xlsx`; on selection, send `FormData` to the preview route. Render source time, generated-video time, exact narration, effective board, emphasis, and pause in a scrollable table. Keep grammar and emphasis notices visibly associated with their worksheet row. The render action sends the preview rows to the new route, creates an object URL from the MP4 blob, and revokes the prior object URL.

- [ ] **Step 3: Add responsive styling**

Use the existing ink/paper/coral board aesthetic. The input mode choice is the focal control; the preview table keeps long educator text readable with horizontal overflow rather than shrinking it into illegibility. Buttons remain at least 44px tall.

- [ ] **Step 4: Run lint, type, build, and E2E checks**

Run: `npx eslint src/lib/pedagogy-brief.ts src/lib/pedagogy-slide.ts src/lib/pedagogy-video.ts src/app/api/question/pedagogy/preview/route.ts src/app/api/question/pedagogy/render/route.ts src/app/question/page.tsx src/components/pedagogy-brief-upload.tsx && npx tsc --noEmit && npm run build`

Expected: all commands exit 0.

### Task 5: Verify the supplied or three-row fixture

**Files:**
- Create only if no supplied workbook exists: `tests/fixtures/pedagogy-three-rows.xlsx`
- Test: `tests/pedagogy-brief.test.ts`

- [ ] **Step 1: Use the supplied workbook if project-accessible**

Search for `Anubhav_Sir_Pedagogy_Transcript_20min.xlsx`. If it cannot be found, generate a three-row fixture with the seven specified columns and rows at `3:54`, `4:00`, and `4:13`.

- [ ] **Step 2: Capture evidence**

Show the raw mapping `3:54 → 0:00`, `4:00 → 0:06`, `4:13 → 0:19`; assert raw educator narration equals returned narration using strict equality; assert retained board, valid emphasis, missing-emphasis warning, and an overlap error.

- [ ] **Step 3: Check scope and report**

Run: `git diff --check && git diff --name-only origin/main...HEAD && git diff --stat origin/main...HEAD`

Expected: no ad/film generation paths or Convex schema files are changed.
