# Working MVP Image Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete FRAME's existing concept-to-treatment flow with six real, durable storyboard images and isolated failure handling.

**Architecture:** Keep concept and storyboard text generation in their existing routes. After the storyboard returns, the client explicitly requests one image per shot from a new server route; that route calls OpenAI's Image API and stores successful bytes in existing Convex file storage. The client processes shots sequentially to avoid burst rate limits and updates only the affected shot, while the storyboard remains usable through image or persistence failures.

**Tech Stack:** Next.js 16, React 19, TypeScript, OpenAI JavaScript SDK, GPT-5 Mini, GPT Image 2, Convex database and file storage

**Spec:** User request in the 2026-08-29 conversation.

## Global Constraints

- Preserve Brief → 3 concepts → selection → Visual Bible → 6 shots → prompts → images → treatment.
- Generate images only after explicit concept selection.
- Make exactly one image request per shot and do not add automatic retries.
- Keep `OPENAI_API_KEY` server-side.
- Do not add authentication, editing, video, audio generation, or Direct this shot.
- A failed image or Convex save must not erase a successful storyboard.

---

### Task 1: Shared image configuration and types

**Files:**
- Create: `src/lib/types.ts`
- Modify: `src/lib/image-prompt.ts`
- Modify: `src/app/api/generate/route.ts`
- Modify: `src/app/api/concepts/route.ts`

**Interfaces:**
- Produces: shared `Brief`, `Concept`, `VisualBible`, `Shot`, `Generation`, `ImageStatus` types.
- Produces: `getImageSize(platform): string` beside the existing aspect-ratio prompt mapping.

- [ ] Extract only domain types used across client and server.
- [ ] Add `imageStatus`, optional `imageUrl`, optional `imageStorageId`, and optional `imageError` to shots.
- [ ] Initialize all six generated shots with `imageStatus: "pending"`.
- [ ] Keep platform prompt intent and API pixel dimensions in one module.

### Task 2: Durable single-frame image route

**Files:**
- Create: `src/app/api/images/route.ts`
- Modify: `convex/generations.ts`

**Interfaces:**
- Consumes: `{ imagePrompt, platform, shotNumber, generationId? }`.
- Produces: `{ imageUrl, imageStorageId, imageStatus: "complete" }` or a normal-user error.

- [ ] Validate the shot number, platform, prompt length, API key and Convex URL.
- [ ] Call `openai.images.generate` with `gpt-image-2`, medium quality, PNG output, and the platform size.
- [ ] Decode returned base64 and upload it through a Convex-generated upload URL.
- [ ] Resolve the durable Convex file URL.
- [ ] If a saved generation ID exists, atomically update that shot's persisted image fields.
- [ ] Distinguish rate limiting from configuration and general rendering failures without exposing secrets.

### Task 3: Persistence failure boundary

**Files:**
- Modify: `src/app/api/generate/route.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/generations.ts`

**Interfaces:**
- Produces: `{ generation, saved, generationId? }` for every successful storyboard.

- [ ] Return the storyboard even when Convex is missing or save fails.
- [ ] Log storage failures server-side and return `saved: false`.
- [ ] Return the Convex generation ID only when saving succeeds.
- [ ] Preserve historical optional schema fields.

### Task 4: Explicit staged image generation UI

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: the existing storyboard response plus `generationId`.
- Produces: sequential image requests and per-shot pending, generating, complete, and failed states.

- [ ] Start image generation once, directly inside the concept-selection event flow after storyboard success.
- [ ] Update one shot with `generating` before its request and `complete` or `failed` afterward.
- [ ] Show staged studio copy tied to the current shot rather than fake percentages.
- [ ] Keep completed images dominant and show an intentional per-frame failure state.
- [ ] Change the brief CTA to `Develop concepts`.
- [ ] Keep generation details collapsed and preserve mobile stacking.

### Task 5: Verification and deployment readiness

**Files:**
- Modify: `.env.local.example`
- Modify: `README.md`

**Interfaces:**
- Produces: documented environment, storage lifetime, model choices and test evidence.

- [ ] Document `OPENAI_API_KEY` and `NEXT_PUBLIC_CONVEX_URL` without secrets.
- [ ] Run lint, TypeScript checking and production build.
- [ ] Deploy Convex functions so file-storage mutations exist.
- [ ] Run three different concept-to-image tests: luxury product, mass-market product and digital service.
- [ ] Verify six prompts, six attempted image calls, isolated frame failure, platform sizes and responsive treatment behavior.
- [ ] Push the working incremental commit after verification.
