# Pedagogy Grammar Review Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pedagogy preview delegate grammar checks to FRAME's existing question narration reviewer and report real reviewer failures clearly.

**Architecture:** Keep `validateQuestionNarrationGrammar` as the sole OpenAI-backed grammar implementation. Add a small pedagogy adapter that preserves each row's narration string while converting non-passing reviews into warnings and reviewer failures into a typed route error; the preview route calls that adapter after workbook validation.

**Tech Stack:** Next.js route handlers, TypeScript, existing OpenAI question narration reviewer, Node test runner.

**Spec:** User request in this conversation, 2026-09-11.

## Global Constraints

- Do not add or change environment variables, database schemas, validators, spreadsheet fields, timestamp behavior, ad/film files, deployment, or merge state.
- Use `validateQuestionNarrationGrammar` as the only grammar-review service.
- Pedagogy grammar results are warnings and must never alter `sir_ka_vaakya`.

---

### Task 1: Centralize pedagogy grammar adaptation

**Files:**
- Create: `src/lib/pedagogy-narration.ts`
- Test: `tests/pedagogy-brief.test.ts`

**Interfaces:**
- Consumes: validated `PedagogyRow[]` and `validateQuestionNarrationGrammar`.
- Produces: `reviewPedagogyNarration(rows)` returning warning strings, plus `PedagogyGrammarReviewError` for service failures.

- [ ] **Step 1: Write failing tests**

```ts
const warnings = await reviewPedagogyNarration(rows, async () => ({ passes: false, issues: ["Sentence \\\"Bad.\\\": missing subject."] }));
assert.equal(rows[0].narration, "Exact educator sentence.");
assert.match(warnings[0], /Row 2: grammar warning/);
await assert.rejects(() => reviewPedagogyNarration(rows, async () => { throw new Error("network unavailable"); }), /Pedagogy grammar review failed/);
```

- [ ] **Step 2: Implement the adapter**

```ts
export async function reviewPedagogyNarration(rows, reviewer = validateQuestionNarrationGrammar) {
  try { return (await Promise.all(rows.map(async (row) => { const review = await reviewer(row.narration); return review.passes ? [] : review.issues.map((issue) => `Row ${row.sourceRow}: grammar warning: ${issue}`); }))).flat(); }
  catch (error) { console.error("Pedagogy grammar review service failed", error); throw new PedagogyGrammarReviewError("Pedagogy grammar review failed. FRAME's existing question narration reviewer is unavailable."); }
}
```

- [ ] **Step 3: Run the focused test**

Run: `npx tsx --test tests/pedagogy-brief.test.ts`

Expected: PASS.

### Task 2: Route the preview through the shared adapter

**Files:**
- Modify: `src/app/api/question/pedagogy/preview/route.ts`
- Test: `tests/pedagogy-brief.test.ts`

**Interfaces:**
- Consumes: `reviewPedagogyNarration(rows)` after `validatePedagogyRows`.
- Produces: a successful `{ rows, warnings, grammarWarnings }` preview, a 502 for a genuine grammar service failure, and no old pedagogy-specific `not configured` preflight response.

- [ ] **Step 1: Remove the duplicated environment preflight**

The route must not inspect `OPENAI_API_KEY`; only the existing reviewer owns its configuration.

- [ ] **Step 2: Handle typed reviewer failure**

Return `NextResponse.json({ error: error.message }, { status: 502 })` and rely on the adapter's explicit non-secret failure log.

- [ ] **Step 3: Run checks**

Run: `npx eslint src/lib/pedagogy-narration.ts src/app/api/question/pedagogy/preview/route.ts tests/pedagogy-brief.test.ts && npx tsc --noEmit && npm run build`

Expected: all commands exit 0.
