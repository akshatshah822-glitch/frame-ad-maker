import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { generationType, validateQuestionSolve } from "@/lib/question-generation";
import type { GenerationType, QuestionSolve } from "@/lib/types";

export type StoredQuestionGeneration = {
  id: string;
  type: "question";
  title: string;
  solve: QuestionSolve;
  script: string;
  sourceFileName: string;
  sourceSlideNumber: number;
  finalVideoUrl?: string;
};

export function storedGenerationType(record: Record<string, unknown>): GenerationType {
  return generationType(record.type);
}

export async function getGenerationRecord(id: string) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl || !id) return null;
  return await new ConvexHttpClient(convexUrl).query(anyApi.generations.getById, { id }) as Record<string, unknown> | null;
}

export async function getQuestionGeneration(id: string): Promise<StoredQuestionGeneration | null> {
  const record = await getGenerationRecord(id);
  if (!record || storedGenerationType(record) !== "question") return null;
  const solve = validateQuestionSolve("question", record.solve);
  if (!solve) return null;
  const script = String(record.script ?? "").trim();
  if (!script) throw new Error("Invalid script: grammar-checked question narration is missing.");
  const sourceFileName = String(record.sourceFileName ?? "").trim();
  const sourceSlideNumber = Number(record.sourceSlideNumber);
  if (!sourceFileName) throw new Error("Invalid sourceFileName: question source filename is missing.");
  if (!Number.isInteger(sourceSlideNumber) || sourceSlideNumber < 1) throw new Error("Invalid sourceSlideNumber: question source slide number is missing.");
  return { id: String(record._id), type: "question", title: String(record.title ?? "Question explainer"), solve, script, sourceFileName, sourceSlideNumber, finalVideoUrl: record.finalVideoUrl ? String(record.finalVideoUrl) : undefined };
}
