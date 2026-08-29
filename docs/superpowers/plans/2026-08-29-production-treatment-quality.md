# FRAME Production Treatment Quality Implementation Plan

> **For agentic workers:** Execute this plan task-by-task in the current repository. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the working FRAME storyboard into a clear, shareable, production-useful treatment on desktop and mobile.

**Architecture:** Keep the existing brief, concept, storyboard, Visual Bible, image generation, and Convex save flow. Add concise shot display fields to the existing storyboard response, normalize the client to one generation phase, extract one reusable treatment view, add Convex retrieval by treatment ID, and generate a purpose-built PDF on the server.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, OpenAI Responses API, Convex, CSS, pdf-lib, Playwright browser checks.

**Spec:** User request in the active FRAME product-quality milestone.

## Global Constraints

- Do not add video generation, Direct this shot, accounts, or project history.
- Preserve six-shot generation and image-generation behavior.
- Keep API keys server-side.
- Default shot cards show only Visual, Camera, and Action; full production data remains expandable.
- Tap targets must be at least 44 CSS pixels where appropriate and work at 320, 375, 390, and 430 pixels.
- Copy, PDF, and share must remain useful when one image fails.
- Do not use fake progress percentages or fake backend telemetry.

---

### Task 1: Shared treatment data and concise shot directions

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/app/api/generate/route.ts`
- Create: `src/lib/treatment.ts`

**Interfaces:**
- Produce `AppPhase`, `TreatmentData`, shot summary fallbacks, and `formatTreatmentText()`.
- Extend `Shot` with `displayVisual`, `displayCamera`, and `displayAction` while supporting older saved records.

- [ ] Add strict display fields to the current storyboard JSON schema and prompt, with one-sentence length guidance and no new AI request.
- [ ] Validate the new fields and keep fixed shot numbers, timing, and purposes canonical.
- [ ] Add safe helpers that fall back to existing detailed fields for old treatments.
- [ ] Add a clean client-facing clipboard formatter for the concept, Visual Bible summary, and all six shots.
- [ ] Run TypeScript checking.

### Task 2: Durable treatment retrieval

**Files:**
- Modify: `convex/generations.ts`
- Create: `src/lib/treatment-data.ts`
- Create: `src/app/treatment/[id]/page.tsx`
- Create: `src/app/not-found.tsx`

**Interfaces:**
- Produce `generations.getById({ id })` and `getTreatmentById(id)`.
- The route returns a read-only treatment from persisted brief, concept, Visual Bible, shots, and image URLs.

- [ ] Add a read-only Convex query that returns one generation by its document ID.
- [ ] Parse stored JSON with runtime checks; reject missing or malformed records without exposing internal details.
- [ ] Add `/treatment/[id]` using the existing Convex URL and the shared treatment view.
- [ ] Return a clear not-found screen for invalid or missing IDs.
- [ ] Deploy the Convex function and verify retrieval with a real production ID.

### Task 3: Treatment view and completion actions

**Files:**
- Create: `src/components/treatment-view.tsx`
- Create: `src/components/completion-actions.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- `TreatmentView` consumes `TreatmentData`, optional live image retry, phase, save state, and restart action.
- `CompletionActions` provides copy, PDF download, share-link copy, and restart.

- [ ] Extract the final treatment without duplicating generation state or image calls.
- [ ] Make every default shot read image → number/purpose/time → Visual → Camera → Action → details.
- [ ] Move audio, dialogue, purpose, lighting, set, continuity, and raw prompt into native expandable details.
- [ ] Remove generated text from fixed-height image placeholders and remove clipping assumptions.
- [ ] Implement Clipboard API copy with a hidden-textarea fallback and accessible temporary success feedback.
- [ ] Copy the durable route for Share Link; show an honest unavailable state when persistence failed.
- [ ] Keep Make another film tertiary.

### Task 4: Purpose-built PDF

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/treatment-pdf.ts`
- Create: `src/app/api/treatments/[id]/pdf/route.ts`

**Interfaces:**
- `buildTreatmentPdf(treatment)` returns PDF bytes.
- `GET /api/treatments/[id]/pdf` downloads a FRAME treatment.

- [ ] Add only `pdf-lib`; keep it server-side so the client bundle stays small.
- [ ] Build a cover, creative idea, visual direction, and one reliable storyboard page per shot.
- [ ] Fetch and embed available JPEG/PNG frames while preserving image aspect ratio.
- [ ] Wrap text and use fixed content bounds so no production text clips.
- [ ] Represent failed or missing frames intentionally without failing the document.
- [ ] Generate a real PDF, reload it with pdf-lib, and verify page count and dimensions.

### Task 5: One generation phase and honest loading UX

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- One `AppPhase` drives top status, bottom status, disabled controls, and completion actions.
- An `AbortController` cancels concept generation safely.

- [ ] Replace `loading`, `storyboardLoading`, and `studioStatus` with the phase plus current shot number.
- [ ] Add timed concept-loading messages at 0, 4, 9, and 10 seconds, labelled as status copy rather than measured progress.
- [ ] Add Cancel / Back to brief with request cancellation and stale-response protection.
- [ ] Drive image copy from actual per-shot status and set ready only after all six requests settle.
- [ ] Show `STORYBOARD READY` for 6/6, or `STORYBOARD READY · n/6 FRAMES` with the failed-frame count.
- [ ] Confirm no completed screen can show developing copy.

### Task 6: Art direction, mobile controls, and accessibility

**Files:**
- Modify: `.interface-design/system.md`
- Modify: `src/app/globals.css`
- Modify: `src/app/page.tsx`
- Modify: `src/components/treatment-view.tsx`
- Modify: `src/components/completion-actions.tsx`

**Interfaces:**
- Apply the existing ink/paper/coral treatment system across three distinct acts.

- [ ] Make the proposition the strongest brief field and keep platform/tone tactile.
- [ ] Make concept territories feel editorial through hierarchy and whitespace, not nested cards.
- [ ] Make generated frames dominant and completion actions immediately visible.
- [ ] Set 44-pixel minimum hit areas for hero CTA, carousel arrows/tabs, chips, concept actions, details, exports, retries, and navigation.
- [ ] Add visible focus, `aria-pressed`, `aria-expanded` through native details, `aria-live` loading/copy feedback, and clear disabled states.
- [ ] Prevent page overflow and reflow actions/metadata at 320, 375, 390, and 430 pixels.

### Task 7: Browser, PDF, build, and production validation

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/frame-production.spec.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

**Interfaces:**
- Browser tests verify layout, tap areas, loading cancellation, details, completion actions, and shared treatment.

- [ ] Add the smallest Playwright setup and use request interception for concept-loading tests to avoid paid calls.
- [ ] Test desktop plus 320, 375, 390, and 430 pixel widths for overflow and tap areas.
- [ ] Test shared treatment rendering, expandable details, copy/share feedback, and PDF download with a real saved treatment.
- [ ] Run `npm run lint`, `npx tsc --noEmit`, `npm run build`, browser tests, and PDF validation.
- [ ] Deploy Convex and Vercel, then repeat key route, PDF, and responsive checks against production.
- [ ] Update README with share/PDF behavior and the unlisted-link privacy/storage limits.

## Self-review

- Every blocking feedback item maps to Tasks 1–7.
- No parallel generation, video, authentication, or editing system is introduced.
- Older persisted treatments remain readable through summary fallbacks.
- Share and PDF depend on saved Convex records; copy remains available even when persistence fails.
- PDF and browser checks validate output beyond compilation.
