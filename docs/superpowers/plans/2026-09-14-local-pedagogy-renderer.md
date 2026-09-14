# Local Pedagogy Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a local-only command that turns a pedagogy `.xlsx` brief into an MP4 and a timing-audit CSV without calling the FRAME render endpoint.

**Architecture:** A TypeScript CLI will parse explicit absolute paths, load the existing local environment without printing it, and compose the existing parser, grammar reviewer, narration generator, adjusted-timeline builder, slide renderer, and FFmpeg renderer. The shared renderer will gain a file-output entry point with progress callbacks; the existing web wrapper will retain its current byte-response behavior.

**Tech Stack:** TypeScript, tsx, Next environment loader, XLSX, Sharp, existing OpenAI narration/grammar client, FFmpeg and FFprobe static binaries.

**Spec:** User request in this conversation: “Create a local-only pedagogy video renderer for FRAME.”

## Global Constraints

- Input and output CLI arguments must be explicit absolute paths.
- Use existing pedagogy parser, grammar reviewer, narration generator, timeline builder, slide renderer, and FFmpeg settings.
- Grammar review is validation-only; narration and board values must never be changed.
- Narration and slide work must stay file-backed and sequential or bounded.
- No Vercel endpoint calls, deployments, merges, schemas, validators, environment-variable changes, or ad/film changes.
- Keep command-created temporary files on failure and remove only that directory after a successful assembly.

---

### Task 1: Add shared renderer progress and file output

**Files:**
- Modify: `src/lib/pedagogy-narration.ts`
- Modify: `src/lib/pedagogy-video.ts`
- Test: `tests/pedagogy-brief.test.ts`

**Interfaces:**
- Consumes: `PedagogyRow[]`, `createPedagogyNarrationTracks`, `buildAdjustedPedagogyTimeline`, and `createPedagogySlide`.
- Produces: `reviewPedagogyNarration(rows, reviewer, onProgress)` and `renderPedagogyVideoToFile(rows, options)` with timing audit and sequential narration/slide progress.

- [ ] Add an optional grammar progress callback that reports after each reviewer call and wraps failures with the current source row.
- [ ] Add a file-output renderer accepting a caller-owned temporary directory, output path, and progress callbacks.
- [ ] Keep `renderPedagogyVideo(rows)` as the existing web-compatible wrapper that creates its own temporary directory and returns bytes.
- [ ] Add focused tests for the grammar progress callback and adjusted renderer audit metadata.

### Task 2: Add the local command and audit CSV

**Files:**
- Create: `scripts/render-pedagogy-local.ts`
- Modify: `package.json`
- Test: `tests/pedagogy-local-renderer.test.ts`

**Interfaces:**
- Consumes: `extractPedagogyRowsFromWorkbook`, `validatePedagogyRows`, `reviewPedagogyNarration`, and `renderPedagogyVideoToFile`.
- Produces: `npm run pedagogy:render-local -- --input <absolute.xlsx> --output <absolute.mp4>` and `<output>.timing-audit.csv`.

- [ ] Parse only one explicit absolute input and output pair; reject relative paths, invalid extensions, absent input, and existing output/audit paths.
- [ ] Load existing local environment configuration without printing values, parse first worksheet, and print the required progress phases.
- [ ] Deduplicate grammar warnings, write a quoted audit CSV with every required timing field and board-change status, and return row-specific non-zero failures.
- [ ] Preserve the temporary directory on failure and remove only the command-created directory after both final files are placed.
- [ ] Add CLI unit tests for argument validation and CSV formatting without invoking narration services.

### Task 3: Verify the full local render

**Files:**
- Test: `tests/pedagogy-brief.test.ts`
- Test: `tests/pedagogy-local-renderer.test.ts`

**Interfaces:**
- Consumes: `/Users/admin/Downloads/Anubhav_Sir_Pedagogy_Transcript_Timing_Fixed.xlsx`.
- Produces: a complete H.264/AAC MP4 plus a CSV timing audit beside it.

- [ ] Run focused unit tests and TypeScript checking.
- [ ] Run the command against all 151 rows, capture terminal progress and timing/equality summary, and preserve raw output.
- [ ] Run FFprobe on the MP4 and compare its duration with the calculated timeline end.
- [ ] Confirm no changed path belongs to the ad/film flow.
