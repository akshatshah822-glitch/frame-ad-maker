# Pedagogy Upload Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a truthful narration-review percentage while a pedagogy brief uploads.

**Architecture:** The preview route streams newline-delimited JSON progress events before its result. The existing narration-measurement loop emits one event after each real MP3 duration is measured; the client reads the stream and displays that percentage in the existing upload status line.

**Tech Stack:** Next.js Route Handlers, Web Streams API, React client component, TypeScript, Node test runner, Playwright.

**Spec:** User request in this conversation, 2026-09-11.

## Global Constraints

- Change only the exam-question pedagogy preview path.
- The percentage must reflect measured narration lines, not elapsed time.
- Do not alter narration, grammar checking, spreadsheet parsing, timing rules, database schemas, validators, environment variables, ad/film files, merge state, or deployment state.
- Preserve old JSON error responses for invalid files before streaming starts; mid-stream errors are sent as a safe error event because HTTP status cannot change after streaming begins.

---

### Task 1: Emit progress from the existing narration measurement loop

**Files:**
- Modify: `src/lib/pedagogy-narration-duration.ts`
- Test: `tests/pedagogy-brief.test.ts`

**Interfaces:**
- Produces: `createPedagogyNarrationTracks(rows, directory, onProgress?)`, where `onProgress({ completed, total })` runs after each measured MP3.

- [ ] **Step 1: Add the optional callback**

```ts
type NarrationProgress = { completed: number; total: number };
```

- [ ] **Step 2: Call it after duration probing**

```ts
narrationDurations.push(await probeDuration(narrationPath));
onProgress?.({ completed: index + 1, total: rows.length });
```

- [ ] **Step 3: Run focused unit tests**

Run: `npx tsx --test tests/pedagogy-brief.test.ts`

Expected: PASS.

### Task 2: Stream preview progress and result safely

**Files:**
- Modify: `src/app/api/question/pedagogy/preview/route.ts`
- Create: `src/lib/pedagogy-preview-stream.ts`
- Test: `tests/pedagogy-brief.test.ts`

**Interfaces:**
- Produces stream events `{ type: "progress", percent }`, `{ type: "result", result }`, and `{ type: "error", error }`.

- [ ] **Step 1: Add a browser-safe stream reader test**

```ts
const progress: number[] = [];
await readPedagogyPreviewStream(response, (percent) => progress.push(percent));
assert.deepEqual(progress, [0, 50, 100]);
```

- [ ] **Step 2: Send events from the route handler**

```ts
send({ type: "progress", percent: Math.round((completed / total) * 100) });
```

- [ ] **Step 3: Send a final result or safe error event**

```ts
send({ type: "result", result: { rows, warnings, grammarWarnings } });
```

- [ ] **Step 4: Run focused unit tests**

Run: `npx tsx --test tests/pedagogy-brief.test.ts`

Expected: PASS.

### Task 3: Render the true percentage in the upload status line

**Files:**
- Modify: `src/components/pedagogy-brief-upload.tsx`
- Modify: `tests/pedagogy-upload.spec.ts`

**Interfaces:**
- Consumes: `readPedagogyPreviewStream(response, setReviewProgress)`.
- Produces: `Reviewing grammar and narration timing… 0%` through `100%`.

- [ ] **Step 1: Add the review-progress state**

```ts
const [reviewProgress, setReviewProgress] = useState(0);
```

- [ ] **Step 2: Read the streamed preview rather than treating it as one JSON response**

```ts
const result = await readPedagogyPreviewStream(response, setReviewProgress);
```

- [ ] **Step 3: Display the percentage during upload**

```tsx
{isReviewing ? `Reviewing grammar and narration timing… ${reviewProgress}%` : fileName}
```

- [ ] **Step 4: Verify the visible 0% state in Playwright**

Run: `npx playwright test tests/pedagogy-upload.spec.ts`

Expected: PASS.

### Task 4: Verify the isolated change

**Files:**
- Verify only: pedagogy preview route, narration measurement helper, stream reader, upload component, focused tests.

- [ ] **Step 1: Run lint and type-check**

Run: `npx eslint src/lib/pedagogy-narration-duration.ts src/lib/pedagogy-preview-stream.ts src/app/api/question/pedagogy/preview/route.ts src/components/pedagogy-brief-upload.tsx tests/pedagogy-brief.test.ts tests/pedagogy-upload.spec.ts && npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: exit 0.
