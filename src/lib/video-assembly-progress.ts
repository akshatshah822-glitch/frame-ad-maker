import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { assembleVideoStep } from "@/lib/video-assembly";
import { getTreatmentById } from "@/lib/treatment-data";
import { getVideoProduction, uploadMedia } from "@/lib/video-production";

export class AssemblyProgressError extends Error {
  constructor(message: string, readonly status: number, readonly detail?: string) { super(message); }
}

export async function advanceVideoAssembly(generationId: string, options: { force?: boolean; narration?: string[] } = {}) {
  const [production, treatment] = await Promise.all([getVideoProduction(generationId), getTreatmentById(generationId)]);
  if (!production || !treatment) throw new AssemblyProgressError("This production is unavailable.", 404);
  if (production.status === "ready" && !options.force) return { production, position: production.clips.length, complete: true };
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const claim = await convex.mutation(anyApi.videoProductions.claimAssemblyStep, { id: production.id, force: options.force, narration: options.narration }) as { ok: boolean; reason?: string; position?: number };
  if (!claim.ok || !claim.position) {
    const message = claim.reason === "busy" ? `Assembly step ${claim.position ?? ""} is already running.`
      : claim.reason === "ready" || claim.reason === "complete" ? "This production is already assembled."
      : "The clips are not ready for assembly.";
    throw new AssemblyProgressError(message, claim.reason === "busy" ? 423 : 409);
  }
  const position = claim.position;
  const startedAt = Date.now();
  try {
    const claimedProduction = await getVideoProduction(generationId);
    if (!claimedProduction) throw new Error("The claimed production could not be loaded.");
    const result = await assembleVideoStep(treatment, claimedProduction, position, claimedProduction.assemblyNarration ?? options.narration);
    const asset = await uploadMedia(result.bytes, "video/mp4");
    if (result.qa) {
      const attached = await convex.mutation(anyApi.generations.attachFinalVideo, { generationId, finalVideoStorageId: asset.storageId, finalVideoUrl: asset.mediaUrl });
      if (!attached) throw new Error("The finished video could not be attached to its generation.");
    }
    const saved = await convex.mutation(anyApi.videoProductions.saveAssemblyStep, { id: production.id, position, storageId: asset.storageId, mediaUrl: asset.mediaUrl, durationMs: Date.now() - startedAt, technicalQa: result.qa ? JSON.stringify(result.qa) : undefined });
    if (!saved) throw new Error(`Assembly step ${position} could not be saved.`);
    return { production: await getVideoProduction(generationId), position, complete: Boolean(result.qa) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown assembly error";
    console.error(`Video assembly step ${position} failed`, error);
    await convex.mutation(anyApi.videoProductions.failAssemblyStep, { id: production.id, position, error: `Assembly step ${position} failed: ${detail}` });
    throw new AssemblyProgressError(`Assembly step ${position} failed. Progress through step ${position - 1} is saved; retry to resume.`, 502, detail);
  }
}
