import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { getTreatmentById } from "@/lib/treatment-data";
import { getVideoProduction } from "@/lib/video-production";
import { getVideoConfig } from "@/lib/video-config";
import { RunwayVideoProvider, normalizeVideoError } from "@/lib/runway-provider";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";

export const maxDuration = 60;

const post = async (request: Request) => {
  const { generationId, shotNumber } = await request.json().catch(() => ({})) as { generationId?: string; shotNumber?: number };
  if (!generationId || !Number.isInteger(shotNumber) || !shotNumber || shotNumber < 1 || shotNumber > 6) return NextResponse.json({ error: "Choose a failed shot to retry." }, { status: 400 });
  const [production, treatment] = await Promise.all([getVideoProduction(generationId), getTreatmentById(generationId)]);
  if (!production || !treatment) return NextResponse.json({ error: "This production is unavailable." }, { status: 404 });
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const claimed = await convex.mutation(anyApi.videoProductions.claimRetry, { id: production.id, shotNumber });
  if (!claimed) return NextResponse.json({ production: await getVideoProduction(generationId), duplicate: true });
  const updatedProduction = await getVideoProduction(generationId);
  const clip = updatedProduction?.clips.find((item) => item.shotNumber === shotNumber);
  const shot = treatment.generation.shots.find((item) => item.shotNumber === shotNumber);
  if (!clip || !shot?.imageUrl) return NextResponse.json({ error: `Shot ${shotNumber} is unavailable.` }, { status: 409 });
  try {
    const job = await new RunwayVideoProvider().createVideoJob({ referenceImageUrl: shot.imageUrl, motionPrompt: clip.motionPrompt, duration: clip.duration, ratio: getVideoConfig(treatment.brief.platform).runwayRatio, context: { shotNumber, requestId: `${clip.jobKey}:retry:${clip.retries}` } });
    Object.assign(clip, { status: "submitted", providerTaskId: job.id, estimatedCredits: job.estimatedCredits, submittedAt: Date.now() });
  } catch (error) { const normalized = normalizeVideoError(error); Object.assign(clip, { status: "failed", error: normalized.message, failureCode: normalized.kind }); }
  await convex.mutation(anyApi.videoProductions.updateClip, { id: production.id, shotNumber, clip: JSON.stringify(clip), productionStatus: "generating" });
  const updated = await getVideoProduction(generationId);
  if (updated?.clips.every((item) => item.status === "complete")) await convex.mutation(anyApi.videoProductions.markClipsReady, { id: production.id, totalFinalCredits: updated.clips.reduce((sum, item) => sum + (item.finalCredits ?? 0), 0) });
  return NextResponse.json({ production: await getVideoProduction(generationId) });
};

export const POST = withJsonErrors(post);
export const GET = methodNotAllowed(["POST"]);
export const HEAD = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const OPTIONS = methodNotAllowed(["POST"]);
