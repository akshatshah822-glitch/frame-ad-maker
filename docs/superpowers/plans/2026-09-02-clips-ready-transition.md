# Clips Ready Transition Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure a production with every clip complete transitions to `clips_ready` even when no provider jobs remain active.

**Architecture:** Compute the all-complete state immediately after loading the production. Persist `clips_ready` before the empty-active-jobs early return, while preserving incremental assembly resume behavior for productions that have already completed at least one assembly step.

**Tech Stack:** Next.js Route Handler, TypeScript, Convex

**Spec:** User request in the active conversation.

## Global Constraints

- Do not regenerate clips or call Runway.
- Do not change storyboard or brief code.
- Change only the status transition needed to mark completed clips ready for assembly.

---

### Task 1: Correct the status transition

**Files:**
- Modify: `src/app/api/video/status/route.ts`

**Interfaces:**
- Consumes: `VideoProduction.clips`, `VideoProduction.status`, and `VideoProduction.assemblyPosition`
- Produces: persisted `clips_ready` status through `videoProductions.markClipsReady`

- [ ] Move the all-clips-complete transition before the empty-active-clips return.
- [ ] Return the freshly loaded production after persisting `clips_ready`.
- [ ] Preserve direct incremental assembly calls when `assemblyPosition` is greater than zero.

### Task 2: Verify locally and against production

**Files:**
- Test: `src/app/api/video/status/route.ts`

**Interfaces:**
- Consumes: local project checks and the existing production record
- Produces: passing typecheck, changed-file lint, build, and live status evidence

- [ ] Run typecheck and changed-file lint.
- [ ] Run the local production build.
- [ ] Deploy the route through the normal repository workflow.
- [ ] Poll the existing production without calling Runway directly and report its new status or exact remaining blocker.
