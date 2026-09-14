import type { PedagogyRow } from "@/lib/pedagogy-brief";
import { validateQuestionNarrationGrammar } from "@/lib/question-narration";

type GrammarReview = { passes: boolean; issues: string[] };
export type PedagogyGrammarReviewer = (narration: string) => Promise<GrammarReview>;
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
  reviewer: PedagogyGrammarReviewer = validateQuestionNarrationGrammar,
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
