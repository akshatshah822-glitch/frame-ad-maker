import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { getTreatmentById } from "@/lib/treatment-data";
import { buildMotionPrompt, resolveProductionContext } from "@/lib/motion-prompt";
import { getVideoConfig } from "@/lib/video-config";
import { RunwayVideoProvider, normalizeVideoError } from "@/lib/runway-provider";
import { getVideoProduction } from "@/lib/video-production";
import type { VideoClip } from "@/lib/types";

export const maxDuration = 60;

export async function POST(request: Request) {
  const { generationId } = await request.json().catch(() => ({})) as { generationId?: string };
  if (!generationId) return NextResponse.json({ error: "A saved treatment is required." }, { status: 400 });
  if (!process.env.RUNWAYML_API_SECRET) return NextResponse.json({ error: "Video generation is not configured." }, { status: 503 });
  const treatment = await getTreatmentById(generationId);
  if (!treatment) return NextResponse.json({ error: "Treatment not found." }, { status: 404 });
  if (treatment.generation.shots.length !== 6) return NextResponse.json({ error: "Video production is currently available only for six-frame treatments." }, { status: 409 });
  if (treatment.generation.shots.some((shot) => !shot.imageUrl || shot.imageStatus !== "complete")) return NextResponse.json({ error: "All six storyboard frames must be ready first." }, { status: 409 });
  const context = resolveProductionContext({ ...treatment.brief, conceptName: treatment.concept.conceptName, conceptIdea: treatment.concept.idea, visualBible: treatment.generation.visualBible, brandBible: treatment.generation.brandBible, creativeGrammar: treatment.generation.creativeGrammar });
  const clips: VideoClip[] = treatment.generation.shots.map((shot) => ({ shotNumber: shot.shotNumber, jobKey: `${generationId}:shot:${shot.shotNumber}:v1`, status: "waiting", motionPrompt: buildMotionPrompt({ ...context, visualBible: treatment.generation.visualBible, shot }), duration: shot.endTime - shot.startTime, retries: 0 }));
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  let claim: { id: string; created: boolean };
  try { claim = await convex.mutation(anyApi.videoProductions.begin, { generationId, clips: JSON.stringify(clips) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error && error.message.includes("ACTIVE_PRODUCTION_LIMIT") ? "The studio is at capacity. Try again shortly." : "Video production could not start." }, { status: 429 }); }
  if (!claim.created) return NextResponse.json({ production: await getVideoProduction(generationId), duplicate: true });

  const provider = new RunwayVideoProvider();
  const ratio = getVideoConfig(treatment.brief.platform).runwayRatio;
  for (const clip of clips) {
    const shot = treatment.generation.shots[clip.shotNumber - 1];
    try {
      const job = await provider.createVideoJob({ referenceImageUrl: shot.imageUrl!, motionPrompt: clip.motionPrompt, duration: clip.duration, ratio });
      Object.assign(clip, { status: "submitted", providerTaskId: job.id, estimatedCredits: job.estimatedCredits, submittedAt: Date.now() });
    } catch (error) {
      const normalized = normalizeVideoError(error);
      Object.assign(clip, { status: "failed", error: normalized.message, failureCode: normalized.kind });
    }
    await convex.mutation(anyApi.videoProductions.updateClip, { id: claim.id, shotNumber: clip.shotNumber, clip: JSON.stringify(clip), productionStatus: "generating" });
  }
  if (clips.every((clip) => clip.status === "failed")) {
    await convex.mutation(anyApi.videoProductions.setStatus, { id: claim.id, status: "partial_failure", error: "The video provider could not start these shots." });
  }
  return NextResponse.json({ production: await getVideoProduction(generationId) });
}
