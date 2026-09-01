import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { VideoClip, VideoProduction } from "@/lib/types";
import { readJsonResponse } from "@/lib/read-json-response";

export function parseVideoProduction(record: Record<string, unknown>): VideoProduction {
  return {
    id: String(record._id), generationId: String(record.generationId), status: record.status as VideoProduction["status"], provider: "runway", model: "gen4.5",
    clips: JSON.parse(String(record.clips)) as VideoClip[], finalVideoUrl: record.finalVideoUrl ? String(record.finalVideoUrl) : undefined,
    finalVideoStorageId: record.finalVideoStorageId ? String(record.finalVideoStorageId) : undefined, technicalQa: record.technicalQa ? String(record.technicalQa) : undefined,
    error: record.error ? String(record.error) : undefined, startedAt: Number(record.startedAt), updatedAt: Number(record.updatedAt),
    clipsReadyAt: record.clipsReadyAt ? Number(record.clipsReadyAt) : undefined, assemblyStartedAt: record.assemblyStartedAt ? Number(record.assemblyStartedAt) : undefined,
    assemblyPosition: typeof record.assemblyPosition === "number" ? record.assemblyPosition : undefined,
    assemblyStorageId: record.assemblyStorageId ? String(record.assemblyStorageId) : undefined,
    assemblyUrl: record.assemblyUrl ? String(record.assemblyUrl) : undefined,
    assemblyStepDurations: record.assemblyStepDurations ? JSON.parse(String(record.assemblyStepDurations)) as number[] : undefined,
    assemblyNarration: record.assemblyNarration ? JSON.parse(String(record.assemblyNarration)) as string[] : undefined,
    assemblyClaimPosition: typeof record.assemblyClaimPosition === "number" ? record.assemblyClaimPosition : undefined,
    assemblyClaimedAt: typeof record.assemblyClaimedAt === "number" ? record.assemblyClaimedAt : undefined,
    finalReadyAt: record.finalReadyAt ? Number(record.finalReadyAt) : undefined, totalFinalCredits: typeof record.totalFinalCredits === "number" ? record.totalFinalCredits : undefined,
  };
}

export async function getVideoProduction(generationId: string) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  const record = await new ConvexHttpClient(url).query(anyApi.videoProductions.getByGeneration, { generationId });
  return record ? parseVideoProduction(record as Record<string, unknown>) : null;
}

export async function uploadMedia(bytes: Uint8Array, contentType: string) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("Media storage is unavailable");
  const convex = new ConvexHttpClient(url);
  const uploadUrl = await convex.mutation(anyApi.generations.generateImageUploadUrl, {});
  const buffer = new ArrayBuffer(bytes.byteLength); new Uint8Array(buffer).set(bytes);
  const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": contentType }, body: new Blob([buffer], { type: contentType }) });
  if (!response.ok) throw new Error(`Media upload failed with ${response.status}`);
  const { storageId } = await readJsonResponse<{ storageId: string }>(response);
  const mediaUrl = await convex.query(anyApi.generations.getImageUrl, { storageId });
  if (!mediaUrl) throw new Error("Media URL was not created");
  return { storageId, mediaUrl };
}
