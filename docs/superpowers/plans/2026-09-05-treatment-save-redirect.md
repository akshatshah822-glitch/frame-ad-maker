# Saved Treatment URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Never show or render a newly generated storyboard until it has a saved treatment ID, and put that saved treatment URL in the browser address bar before frames begin rendering.

**Architecture:** Keep `src/app/treatment/[id]/page.tsx` and its server-side loading behavior unchanged. In the landing-page client component, validate the API response's `generationId` before setting any generation state, then use the browser history replacement API to change only the current address to `/treatment/{generationId}` while the existing client component continues the six-frame render loop. A missing ID stays on the concept screen as an unsaved error, where the existing selected-concept retry action repeats the storyboard request.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Playwright.

**Spec:** User request from 2026-09-05, recorded in the Global Constraints below.

## Global Constraints

- Require a non-empty saved generation ID before the UI enters `images_generating`, exposes a treatment result, or starts any image request.
- Replace the current client-side URL with `/treatment/{generationId}` immediately after a valid saved ID is received.
- If an ID is absent, show exactly `We could not save this treatment. Retry.`, provide a working retry action, and do not request `/api/images`.
- Do not change `src/app/treatment/[id]/page.tsx` or its existing laptop and phone behavior.
- Existing records are neither migrated nor deleted; a missing ID remains an unsaved landing-page state.
- Do not change billing and do not call any video-render endpoint during the test.

---

### Task 1: Cover the saved-ID and missing-ID landing-page paths

**Files:**
- Modify: `tests/frame-production.spec.ts`

**Interfaces:**
- Consumes: `POST /api/concepts`, `POST /api/generate`, and `POST /api/images` mocked with Playwright routes.
- Produces: browser assertions for a saved-ID URL replacement and the missing-ID retry path.

- [ ] **Step 1: Add a reusable six-shot fixture and completed-image route in `tests/frame-production.spec.ts`**

```ts
const shots = Array.from({ length: 6 }, (_, index) => ({
  shotNumber: index + 1,
  imagePrompt: `Prompt ${index + 1}`,
  imageStatus: "pending",
  // Include the existing display and timing fields used by TreatmentView.
}));

await page.route("**/api/images", async (route) => {
  await route.fulfill({ json: { imageStatus: "complete", imageUrl: "/window.svg", imageStorageId: `storage-${route.request().postDataJSON().shotNumber}` } });
});
```

- [ ] **Step 2: Add a failing test for a valid saved ID**

```ts
await page.route("**/api/generate", (route) => route.fulfill({
  json: { saved: true, generationId: treatmentId, generation: fixtureGeneration },
}));

await chooseFirstConcept(page);
await expect(page).toHaveURL(new RegExp(`/treatment/${treatmentId}$`));
await expect.poll(() => imageRequests).toBe(6);
await expect(page.getByText("All six frames are ready. Start AI animatic preview production when you’re ready.")).toBeVisible();
```

- [ ] **Step 3: Run the saved-ID test and verify it fails before the implementation**

Run: `npx playwright test tests/frame-production.spec.ts --grep "saved ID replaces the landing URL"`

Expected: FAIL because the address remains `/#brief`.

- [ ] **Step 4: Add a failing test for an API response without `generationId`**

```ts
await page.route("**/api/generate", (route) => route.fulfill({
  json: { saved: true, generation: fixtureGeneration },
}));

await chooseFirstConcept(page);
await expect(page.getByRole("alert")).toContainText("We could not save this treatment. Retry.");
await expect.poll(() => imageRequests).toBe(0);
await expect(page).toHaveURL(/\/#brief$/);
await page.getByRole("button", { name: "Retry failed step" }).click();
await expect(generateRequests).toBe(2);
```

- [ ] **Step 5: Run the missing-ID test and verify it fails before the implementation**

Run: `npx playwright test tests/frame-production.spec.ts --grep "missing saved ID"`

Expected: FAIL because the current implementation enters the image-render loop without an ID.

### Task 2: Gate storyboard rendering on a saved ID and replace the client URL

**Files:**
- Modify: `src/app/page.tsx:390-429`

**Interfaces:**
- Consumes: `/api/generate` JSON with optional `generation`, `generationId`, `saved`, and `error` fields.
- Produces: a saved landing-page treatment with `generationId` set before `renderAllShots`, or an `error` phase with no image request when the ID is absent.

- [ ] **Step 1: Normalize and validate the response ID before any generation state change**

```ts
const savedGenerationId = String(result.generationId ?? "").trim();
if (!response.ok || !result.generation || !savedGenerationId) {
  throw new Error(!response.ok ? result.error || "The storyboard response was incomplete. Try again." : "We could not save this treatment. Retry.");
}
```

- [ ] **Step 2: Store the validated ID and replace the browser URL before frames render**

```ts
setGeneration(result.generation);
setGenerationId(savedGenerationId);
setSaved(true);
window.history.replaceState(window.history.state, "", `/treatment/${encodeURIComponent(savedGenerationId)}`);
setPhase("images_generating");
await renderAllShots(result.generation, generationRun, savedGenerationId);
```

- [ ] **Step 3: Keep the missing-ID path visibly unsaved**

```ts
setGeneration(null);
setGenerationId(null);
setSaved(false);
setPhase("error");
```

The existing `Retry failed step` handler calls `generateStoryboard(selectedConcept)`, so it retries the save request without drawing frames from the rejected response.

- [ ] **Step 4: Run both new Playwright tests and verify they pass**

Run: `npx playwright test tests/frame-production.spec.ts --grep "saved ID replaces the landing URL|missing saved ID"`

Expected: PASS; the saved path issues six image requests, and the missing-ID path issues none before or after its retry.

### Task 3: Verify the unchanged saved-treatment route and project checks

**Files:**
- Modify: none
- Test: `tests/frame-production.spec.ts`

**Interfaces:**
- Consumes: the existing saved treatment fixture ID and mobile route checks.
- Produces: evidence that `/treatment/[id]` behavior and the no-paid-render constraint remain intact.

- [ ] **Step 1: Run the existing saved-treatment and mobile tests**

Run: `npx playwright test tests/frame-production.spec.ts --grep "treatment fits|shared treatment exposes"`

Expected: PASS without changes to `src/app/treatment/[id]/page.tsx`.

- [ ] **Step 2: Run static checks**

Run: `npx eslint src/app/page.tsx tests/frame-production.spec.ts && npx tsc --noEmit && git diff --check`

Expected: all commands exit with status 0.

- [ ] **Step 3: Start the app and perform a no-cost browser proof**

Run: `npm run dev -- --hostname 127.0.0.1 --port 3012`

Use Playwright route mocks for `/api/concepts`, `/api/generate`, and `/api/images`; do not call `/api/video/start`, `/api/video/assemble`, or any paid provider. Capture the terminal output and address bar at the saved URL, then reload and capture the address bar again.

- [ ] **Step 4: Commit the focused change**

```bash
git add src/app/page.tsx tests/frame-production.spec.ts docs/superpowers/plans/2026-09-05-treatment-save-redirect.md
git commit -m "fix: require saved treatment before rendering frames"
```

## Self-Review

- Spec coverage: Task 2 gates every success state and image request on a saved ID, changes the address immediately, and leaves missing IDs in a retryable unsaved state. Task 3 preserves and tests the existing saved route, avoids migrations, avoids billing endpoints, and captures browser evidence.
- Placeholder scan: no implementation or test step uses a deferred instruction; fixtures, assertions, commands, and exact missing-ID copy are specified.
- Type consistency: `savedGenerationId` is a non-empty string passed to both `setGenerationId` and `renderAllShots`; `renderAllShots` already accepts an optional string ID.
