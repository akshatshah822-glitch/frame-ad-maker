# Pedagogy Upload Timing Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject a pedagogy brief during upload when its exact generated narration cannot fit before the following source timestamp.

**Architecture:** Move the existing speech-audio duration measurement into a server-only helper. The preview route will grammar-check the original narration, generate the same narration audio used at render time, measure it, and reuse `assertNarrationFits`; the render route keeps its existing validation as a final safety check.

**Tech Stack:** Next.js Route Handlers, TypeScript, OpenAI text-to-speech, ffmpeg-static, Node test runner, Playwright.

**Spec:** User request in this conversation, 2026-09-11.

## Global Constraints

- Change only FRAME's exam-question pedagogy upload and render path.
- Do not change database schemas, validators, environment variables, spreadsheet columns, grammar behaviour, narration text, timestamp rules, ad/film code, merge state, or deployment state.
- Use actual generated narration audio duration; never estimate by word count or alter narration.
- Keep records created before this change compatible: no record changes are required because the timing check runs only during upload.

---

### Task 1: Extract the existing narration measurement without changing it

**Files:**
- Create: `src/lib/pedagogy-narration-duration.ts`
- Modify: `src/lib/pedagogy-video.ts`
- Test: `tests/pedagogy-brief.test.ts`

**Interfaces:**
- Produces: `measurePedagogyNarration(rows: PedagogyRow[]): Promise<{ narrationPaths: string[]; narrationDurations: number[] }>`.
- Consumes: `generateNarrationTrack`, ffmpeg duration probing, `PedagogyRow`.

- [ ] **Step 1: Write a test proving a supplied measured duration is checked against the next timestamp**

```ts
assert.throws(() => assertNarrationFits(2, 6, 6.5), /Row 2: available duration 6.000 seconds; required narration duration 6.500 seconds/);
```

- [ ] **Step 2: Create the server-only helper**

```ts
export async function measurePedagogyNarration(rows: PedagogyRow[]) {
  // Create the same MP3 used by rendering, probe each duration, and return it.
}
```

- [ ] **Step 3: Make `renderPedagogyVideo` call the helper**

```ts
const { narrationPaths, narrationDurations } = await measurePedagogyNarration(rows);
```

- [ ] **Step 4: Run the focused unit test**

Run: `npx tsx --test tests/pedagogy-brief.test.ts`

Expected: PASS.

### Task 2: Validate actual narration timing during upload

**Files:**
- Modify: `src/app/api/question/pedagogy/preview/route.ts`
- Modify: `tests/pedagogy-brief.test.ts`

**Interfaces:**
- Consumes: `measurePedagogyNarration(rows)` and `assertNarrationFits`.
- Produces: the existing row-specific 400 response before preview rows are returned.

- [ ] **Step 1: Add a preview-route test for a 6.5-second narration in a 6-second gap**

```ts
assert.deepEqual(await response.json(), {
  error: "Row 2: available duration 6.000 seconds; required narration duration 6.500 seconds.",
});
```

- [ ] **Step 2: Measure after grammar review and before returning preview rows**

```ts
const { narrationDurations } = await measurePedagogyNarration(rows);
for (let index = 0; index < rows.length - 1; index += 1) {
  assertNarrationFits(rows[index].sourceRow, rows[index + 1].generatedTime - rows[index].generatedTime, narrationDurations[index]);
}
```

- [ ] **Step 3: Preserve the current route error handling**

```ts
if (error instanceof PedagogyBriefValidationError) {
  return NextResponse.json({ error: error.message }, { status: 400 });
}
```

- [ ] **Step 4: Run the focused preview test**

Run: `npx tsx --test tests/pedagogy-brief.test.ts`

Expected: PASS.

### Task 3: Explain upload-time measurement in the existing UI and verify it

**Files:**
- Modify: `src/components/pedagogy-brief-upload.tsx`
- Modify: `tests/pedagogy-upload.spec.ts`

**Interfaces:**
- Produces: upload status text stating that grammar and narration timing are being checked.

- [ ] **Step 1: Add a browser assertion for the upload status**

```ts
await expect(page.getByText("Reviewing grammar and narration timing…")).toBeVisible();
```

- [ ] **Step 2: Change only the review status label**

```tsx
{isReviewing ? "Reviewing grammar and narration timing…" : fileName || "No file selected"}
```

- [ ] **Step 3: Run the focused browser test**

Run: `npx playwright test tests/pedagogy-upload.spec.ts`

Expected: PASS.

### Task 4: Verify the isolated pedagogy change

**Files:**
- Verify only: pedagogy route, shared narration-duration helper, upload UI, focused tests.

- [ ] **Step 1: Run lint and type-check**

Run: `npx eslint src/lib/pedagogy-narration-duration.ts src/lib/pedagogy-video.ts src/app/api/question/pedagogy/preview/route.ts src/components/pedagogy-brief-upload.tsx tests/pedagogy-brief.test.ts tests/pedagogy-upload.spec.ts && npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 2: Run the build**

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 3: Confirm scope before commit**

Run: `git diff --name-only && git diff --stat`

Expected: no ad/film files and no database, validator, or environment-file changes.
