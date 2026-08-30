# FRAME V1 Six-Blocker Implementation Plan

> **For agentic workers:** Execute these steps inline and verify every paid path in production.

**Goal:** Remove the six remaining V1 blockers without changing FRAME's architecture or adding features.

**Architecture:** Keep the existing Next.js, OpenAI, Convex, image queue, and treatment systems. Add small shared validation and reconciliation boundaries, strengthen the existing prompt builder, hide the unfinished video gate, and exercise the existing variable-length arrays with real saved treatments.

**Tech Stack:** Next.js, TypeScript, OpenAI Responses/Image APIs, Convex, Playwright, pdf-lib.

**Spec:** User-provided six-blocker production patch request dated 2026-08-30.

## Global Constraints

- Do not rebuild or add product scope.
- Never display or render unsupported proof.
- Persisted image success wins over a lost browser response.
- Every generated image is one frame, never a grid or collage.
- Loading copy must say treatment generation can take several minutes.
- Do not expose unfinished video generation in V1.
- Do not mark done without two real non-six-shot production treatments.

---

### Task 1: Proof Safety

**Files:** `src/lib/proof-safety.ts`, `src/app/api/concepts/route.ts`, `src/app/api/generate/route.ts`

- [ ] Add deterministic detection for unsupported clinical, certification, testimonial, endorsement, numeric, and social-proof claims.
- [ ] Add supplied-proof extraction from the user brief.
- [ ] Reject unsafe concept/storyboard model output and perform one bounded repair call before returning it.
- [ ] Test known unsafe and safe examples without spending image credits.

### Task 2: Persisted Image Reconciliation

**Files:** `convex/generations.ts`, `src/app/api/treatments/[id]/route.ts`, `src/app/page.tsx`

- [ ] Add the smallest read endpoint for the current saved treatment.
- [ ] On image-fetch failure, check the saved shot once before showing failure.
- [ ] Hydrate completed stored image data when persistence succeeded.
- [ ] Verify a simulated lost response resolves to the stored image.

### Task 3: Single-Frame Prompt Lock

**Files:** `src/lib/image-prompt.ts`

- [ ] Add the exact global one-frame/no-grid/no-collage instruction.
- [ ] Assert every generated shot prompt contains the lock.

### Task 4: Truthful Loading and Treatment UI

**Files:** `src/app/page.tsx`, `src/components/treatment-view.tsx`, `src/app/treatment/[id]/page.tsx`

- [ ] Replace the 45-second claim with a several-minute treatment expectation.
- [ ] Keep real per-shot progress visible.
- [ ] Remove the video-generation gate while preserving finished films already attached to old treatments.
- [ ] Verify desktop and mobile screenshots.

### Task 5: Variable-Length Production Proof

**Files:** `scripts/capture-variable-shot-evidence.mjs`, `artifacts/evidence/frame-v1-variable/`

- [ ] Add an internal optional target-shot-count instruction accepted only for production QA.
- [ ] Generate one real 5-shot and one real 7-shot treatment.
- [ ] Verify all images, persistence, copy, PDF, share, retry state, and mobile rendering.
- [ ] Save treatment links and desktop/mobile screenshots.

### Task 6: Final Validation and Deployment

**Files:** all touched files

- [ ] Run lint, TypeScript, and production build.
- [ ] Deploy Convex before Vercel where the query surface changed.
- [ ] Re-run all six production checks and report PASS/FAIL with evidence.
