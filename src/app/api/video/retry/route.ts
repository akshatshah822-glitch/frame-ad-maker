import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { getTreatmentById } from "@/lib/treatment-data";
import { getVideoProduction, uploadMedia } from "@/lib/video-production";
import { getVideoConfig } from "@/lib/video-config";
import { RunwayVideoProvider, normalizeVideoError } from "@/lib/runway-provider";
import { createLockedKeyframeClip } from "@/lib/keyframe-video";

export const maxDuration = 60;

export async function POST(request: Request) {
  const { generationId, shotNumber } = await request.json().catch(() => ({})) as { generationId?: string; shotNumber?: number };
  if (!generationId || !Number.isInteger(shotNumber) || !shotNumber || shotNumber < 1 || shotNumber > 6) return NextResponse.json({ error: "Choose a failed shot to retry." }, { status: 400 });
  const [production, treatment] = await Promise.all([getVideoProduction(generationId), getTreatmentById(generationId)]);
  if (!production || !treatment) return NextResponse.json({ error: "This production is unavailable." }, { status: 404 });
  const failedClip = production.clips[shotNumber - 1];
  const useLockedFrame = failedClip.status === "failed" && (/SAFETY|moderation/i.test(failedClip.failureCode ?? "") || failedClip.retries >= 2);
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const claimed = await convex.mutation(anyApi.videoProductions.claimRetry, { id: production.id, shotNumber });
  if (!claimed) return NextResponse.json({ production: await getVideoProduction(generationId), duplicate: true });
  const clip = (await getVideoProduction(generationId))!.clips[shotNumber - 1];
  try {
    if (useLockedFrame) {
      const config = getVideoConfig(treatment.brief.platform);
      const bytes = await createLockedKeyframeClip({ imageUrl: treatment.generation.shots[shotNumber - 1].imageUrl!, duration: clip.duration, width: config.width, height: config.height });
      const asset = await uploadMedia(bytes, "video/mp4");
      Object.assign(clip, { status: "complete", progress: 1, videoUrl: asset.mediaUrl, videoStorageId: asset.storageId, finalCredits: 0, completedAt: Date.now(), error: undefined, failureCode: undefined, providerTaskId: undefined });
    } else {
      const job = await new RunwayVideoProvider().createVideoJob({ referenceImageUrl: treatment.generation.shots[shotNumber - 1].imageUrl!, motionPrompt: clip.motionPrompt, duration: clip.duration, ratio: getVideoConfig(treatment.brief.platform).runwayRatio });
      Object.assign(clip, { status: "submitted", providerTaskId: job.id, estimatedCredits: job.estimatedCredits, submittedAt: Date.now() });
    }
  } catch (error) { const normalized = normalizeVideoError(error); Object.assign(clip, { status: "failed", error: normalized.message, failureCode: normalized.kind }); }
  await convex.mutation(anyApi.videoProductions.updateClip, { id: production.id, shotNumber, clip: JSON.stringify(clip), productionStatus: "generating" });
  const updated = await getVideoProduction(generationId);
  if (updated?.clips.every((item) => item.status === "complete")) await convex.mutation(anyApi.videoProductions.markClipsReady, { id: production.id, totalFinalCredits: updated.clips.reduce((sum, item) => sum + (item.finalCredits ?? 0), 0) });
  return NextResponse.json({ production: await getVideoProduction(generationId) });
}
