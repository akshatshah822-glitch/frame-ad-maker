import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { RunwayVideoProvider, normalizeVideoError } from "@/lib/runway-provider";
import { getVideoProduction, uploadMedia } from "@/lib/video-production";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";

export const maxDuration = 60;

const post = async (request: Request) => {
  const { generationId } = await request.json().catch(() => ({})) as { generationId?: string };
  if (!generationId) return NextResponse.json({ error: "A production ID is required." }, { status: 400 });
  const production = await getVideoProduction(generationId);
  if (!production) return NextResponse.json({ production: null });
  if (["ready", "clips_ready", "assembling", "cancelled"].includes(production.status)) return NextResponse.json({ production });
  const clip = production.clips.find((item) => (item.status === "submitted" || item.status === "running") && item.providerTaskId);
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  if (!clip) {
    if (!production.clips.some((item) => ["waiting", "submitted", "running"].includes(item.status)) && production.clips.some((item) => item.status === "failed")) {
      await convex.mutation(anyApi.videoProductions.setStatus, { id: production.id, status: "partial_failure", error: "One or more shots could not be animated." });
      return NextResponse.json({ production: await getVideoProduction(generationId) });
    }
    return NextResponse.json({ production });
  }
  try {
    const job = await new RunwayVideoProvider().getVideoJobStatus(clip.providerTaskId!);
    if (job.state === "succeeded" && job.outputUrl) {
      const bytes = await new RunwayVideoProvider().downloadVideoResult(job.outputUrl);
      const asset = await uploadMedia(bytes, "video/mp4");
      Object.assign(clip, { status: "complete", progress: 1, videoUrl: asset.mediaUrl, videoStorageId: asset.storageId, finalCredits: job.finalCredits, completedAt: Date.now(), error: undefined });
    } else if (job.state === "failed" || job.state === "cancelled") Object.assign(clip, { status: job.state === "failed" ? "failed" : "cancelled", error: job.failure || "This shot could not be animated.", failureCode: job.failureCode, finalCredits: job.finalCredits });
    else Object.assign(clip, { status: job.state === "running" ? "running" : "submitted", progress: job.progress, estimatedCredits: job.estimatedCredits });
  } catch (error) { const normalized = normalizeVideoError(error); Object.assign(clip, { error: normalized.message }); }
  await convex.mutation(anyApi.videoProductions.updateClip, { id: production.id, shotNumber: clip.shotNumber, clip: JSON.stringify(clip) });
  const updated = await getVideoProduction(generationId);
  if (updated?.clips.every((item) => item.status === "complete")) await convex.mutation(anyApi.videoProductions.markClipsReady, { id: production.id, totalFinalCredits: updated.clips.reduce((sum, item) => sum + (item.finalCredits ?? 0), 0) });
  else if (updated && !updated.clips.some((item) => ["waiting", "submitted", "running"].includes(item.status)) && updated.clips.some((item) => item.status === "failed")) await convex.mutation(anyApi.videoProductions.setStatus, { id: production.id, status: "partial_failure", error: "One or more shots could not be animated." });
  return NextResponse.json({ production: await getVideoProduction(generationId) });
};

export const POST = withJsonErrors(post);
export const GET = methodNotAllowed(["POST"]);
export const HEAD = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const OPTIONS = methodNotAllowed(["POST"]);
