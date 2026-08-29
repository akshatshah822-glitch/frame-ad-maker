import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { getVideoProduction } from "@/lib/video-production";
import { RunwayVideoProvider } from "@/lib/runway-provider";

export async function POST(request: Request) {
  const { generationId } = await request.json().catch(() => ({})) as { generationId?: string };
  if (!generationId) return NextResponse.json({ error: "A production ID is required." }, { status: 400 });
  const production = await getVideoProduction(generationId);
  if (!production) return NextResponse.json({ error: "This production is unavailable." }, { status: 404 });
  const provider = new RunwayVideoProvider();
  for (const clip of production.clips) {
    if (clip.providerTaskId && ["submitted", "running"].includes(clip.status)) await provider.cancelVideoJob(clip.providerTaskId).catch(() => undefined);
    if (["waiting", "submitted", "running"].includes(clip.status)) {
      clip.status = "cancelled";
      await new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!).mutation(anyApi.videoProductions.updateClip, { id: production.id, shotNumber: clip.shotNumber, clip: JSON.stringify(clip) });
    }
  }
  await new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!).mutation(anyApi.videoProductions.setStatus, { id: production.id, status: "cancelled" });
  return NextResponse.json({ production: await getVideoProduction(generationId) });
}
