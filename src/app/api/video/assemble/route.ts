import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { getTreatmentById } from "@/lib/treatment-data";
import { assembleVideo } from "@/lib/video-assembly";
import { getVideoProduction, uploadMedia } from "@/lib/video-production";

export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(request: Request) {
  const { generationId } = await request.json().catch(() => ({})) as { generationId?: string };
  if (!generationId) return NextResponse.json({ error: "A production ID is required." }, { status: 400 });
  const [production, treatment] = await Promise.all([getVideoProduction(generationId), getTreatmentById(generationId)]);
  if (!production || !treatment) return NextResponse.json({ error: "This production is unavailable." }, { status: 404 });
  if (production.status === "ready") return NextResponse.json({ production });
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  if (!await convex.mutation(anyApi.videoProductions.beginAssembly, { id: production.id })) return NextResponse.json({ error: "The clips are not ready for assembly." }, { status: 409 });
  try {
    const result = await assembleVideo(treatment, production);
    const asset = await uploadMedia(result.bytes, "video/mp4");
    await convex.mutation(anyApi.videoProductions.finish, { id: production.id, finalVideoStorageId: asset.storageId, finalVideoUrl: asset.mediaUrl, technicalQa: JSON.stringify(result.qa) });
    return NextResponse.json({ production: await getVideoProduction(generationId) });
  } catch (error) {
    console.error("Final video assembly failed", error);
    await convex.mutation(anyApi.videoProductions.setStatus, { id: production.id, status: "clips_ready", error: "Final assembly needs another attempt." });
    return NextResponse.json({ error: "The final edit could not be assembled. Your six clips are safe; try assembly again." }, { status: 502 });
  }
}
