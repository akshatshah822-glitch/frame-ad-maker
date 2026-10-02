import type { PedagogyRow } from "@/lib/pedagogy-brief";
import { grammarCacheKey, readCachedJson, storeCachedJson } from "@/lib/pedagogy-narration-cache";
import { validateQuestionNarrationGrammar } from "@/lib/question-narration";

type GrammarReview = { passes: boolean; issues: string[] };
export type PedagogyGrammarReviewer = (narration: string) => Promise<GrammarReview>;

const GRAMMAR_REVIEWER_ID = "question-narration:gpt-4.1-mini:v1";

/**
 * The real grammar reviewer, remembered per exact narration text. The same line is
 * reviewed once on upload; Generate reuses that review instead of paying for it again.
 */
export function createCachedGrammarReviewer(reviewer: PedagogyGrammarReviewer = validateQuestionNarrationGrammar, cacheDirectory?: string): PedagogyGrammarReviewer {
  return async (narration) => {
    const key = grammarCacheKey(narration, GRAMMAR_REVIEWER_ID);
    const cached = await readCachedJson<GrammarReview>(key, cacheDirectory);
    if (cached && typeof cached.passes === "boolean" && Array.isArray(cached.issues)) {
      console.info("Pedagogy grammar review", { path: "cache-hit" });
      return cached;
    }
    const review = await reviewer(narration);
    await storeCachedJson(key, review, cacheDirectory);
    console.info("Pedagogy grammar review", { path: "reviewed" });
    return review;
  };
}

export const cachedPedagogyGrammarReview = createCachedGrammarReviewer();
export type PedagogyGrammarReviewProgress = { completed: number; total: number; sourceRow: number };

export class PedagogyGrammarReviewError extends Error {
  readonly code = "PEDAGOGY_GRAMMAR_REVIEW_FAILED" as const;
  readonly sourceRow: number | null;

  constructor(sourceRow: number | null = null) {
    super("Pedagogy grammar review failed. FRAME's existing question narration reviewer is unavailable.");
    this.name = "PedagogyGrammarReviewError";
    this.sourceRow = sourceRow;
  }
}

export async function reviewPedagogyNarration(
  rows: PedagogyRow[],
  reviewer: PedagogyGrammarReviewer = cachedPedagogyGrammarReview,
  onProgress?: (progress: PedagogyGrammarReviewProgress) => void,
) {
  const warnings: string[] = [];
  for (const [index, row] of rows.entries()) {
    try {
      const review = await reviewer(row.narration);
      if (!review.passes) warnings.push(...review.issues.map((issue) => `Row ${row.sourceRow}: grammar warning: ${issue}`));
    } catch {
      console.error("Pedagogy grammar review service failed", { path: "question-narration", sourceRow: row.sourceRow });
      throw new PedagogyGrammarReviewError(row.sourceRow);
    }
    onProgress?.({ completed: index + 1, total: rows.length, sourceRow: row.sourceRow });
  }
  return warnings;
}
