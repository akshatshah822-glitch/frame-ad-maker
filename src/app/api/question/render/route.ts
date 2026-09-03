import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { NextResponse } from "next/server";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";
import { getQuestionGeneration } from "@/lib/question-generation-data";
import { QuestionValidationError } from "@/lib/question-generation";
import { renderQuestionVideo } from "@/lib/question-video";
import { uploadMedia } from "@/lib/video-production";

export const maxDuration = 300;
export const runtime = "nodejs";

const post = async (request: Request) => {
  const { generationId } = await request.json().catch(() => ({})) as { generationId?: unknown };
  const id = String(generationId ?? "").trim();
  if (!id) return NextResponse.json({ error: "Invalid generationId: a saved question generation is required." }, { status: 400 });
  let generation;
  try {
    generation = await getQuestionGeneration(id);
  } catch (error) {
    if (error instanceof QuestionValidationError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
  if (!generation) return NextResponse.json({ error: "Invalid type: generation is not a saved question generation." }, { status: 404 });
  if (generation.finalVideoUrl) return NextResponse.json({ generationId: id, type: "question", finalVideoUrl: generation.finalVideoUrl, duplicate: true });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Question narration audio is not configured." }, { status: 503 });
  const result = await renderQuestionVideo(generation);
  const asset = await uploadMedia(result.bytes, "video/mp4");
  const attached = await new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!).mutation(anyApi.generations.attachFinalVideo, { generationId: id, finalVideoStorageId: asset.storageId, finalVideoUrl: asset.mediaUrl });
  if (!attached) throw new Error("Question video could not be attached to its generation.");
  return NextResponse.json({ generationId: id, type: "question", finalVideoUrl: asset.mediaUrl, qa: result.qa });
};

export const POST = withJsonErrors(post);
export const GET = methodNotAllowed(["POST"]);
export const HEAD = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const OPTIONS = methodNotAllowed(["POST"]);
