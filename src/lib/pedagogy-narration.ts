import type { PedagogyRow } from "@/lib/pedagogy-brief";
import { validateQuestionNarrationGrammar } from "@/lib/question-narration";

type GrammarReview = { passes: boolean; issues: string[] };
export type PedagogyGrammarReviewer = (narration: string) => Promise<GrammarReview>;

export class PedagogyGrammarReviewError extends Error {
  constructor() {
    super("Pedagogy grammar review failed. FRAME's existing question narration reviewer is unavailable.");
    this.name = "PedagogyGrammarReviewError";
  }
}

export async function reviewPedagogyNarration(rows: PedagogyRow[], reviewer: PedagogyGrammarReviewer = validateQuestionNarrationGrammar) {
  try {
    return (await Promise.all(rows.map(async (row) => {
      const review = await reviewer(row.narration);
      return review.passes ? [] : review.issues.map((issue) => `Row ${row.sourceRow}: grammar warning: ${issue}`);
    }))).flat();
  } catch {
    console.error("Pedagogy grammar review service failed", { path: "question-narration" });
    throw new PedagogyGrammarReviewError();
  }
}
