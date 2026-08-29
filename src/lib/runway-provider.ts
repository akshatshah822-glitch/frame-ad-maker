import RunwayML, { AuthenticationError, BadRequestError, RateLimitError } from "@runwayml/sdk";
import type { ProviderJob, NormalizedVideoError, VideoProvider } from "@/lib/video-provider";

function client() {
  const apiKey = process.env.RUNWAYML_API_SECRET;
  if (!apiKey) throw new Error("RUNWAYML_API_SECRET is missing");
  return new RunwayML({ apiKey, maxRetries: 0, timeout: 30_000 });
}

async function imageDataUri(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The approved keyframe could not be loaded");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > 5_000_000) throw new Error("The approved keyframe is too large for video generation");
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

function mapTask(task: Awaited<ReturnType<ReturnType<typeof client>["tasks"]["retrieve"]>>): ProviderJob {
  if (task.status === "SUCCEEDED") return { id: task.id, state: "succeeded", outputUrl: task.output[0], finalCredits: task.cost.credits };
  if (task.status === "FAILED") return { id: task.id, state: "failed", failure: task.failure, failureCode: task.failureCode, finalCredits: task.cost.credits };
  if (task.status === "CANCELLED") return { id: task.id, state: "cancelled", finalCredits: task.cost.credits };
  if (task.status === "RUNNING") return { id: task.id, state: "running", progress: task.progress, estimatedCredits: task.estimatedCost.credits };
  return { id: task.id, state: "pending", estimatedCredits: task.estimatedCost.credits };
}

export class RunwayVideoProvider implements VideoProvider {
  async createVideoJob({ referenceImageUrl, motionPrompt, duration, ratio }: Parameters<VideoProvider["createVideoJob"]>[0]) {
    const task = await client().imageToVideo.create({ model: "gen4.5", promptImage: await imageDataUri(referenceImageUrl), promptText: motionPrompt.slice(0, 1000), ratio, duration, outputFormat: "mp4" });
    return { id: task.id, state: "pending" as const, estimatedCredits: task.estimatedCost.credits };
  }
  async getVideoJobStatus(id: string) { return mapTask(await client().tasks.retrieve(id)); }
  async downloadVideoResult(url: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Runway output download failed with ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
  async cancelVideoJob(id: string) { await client().tasks.delete(id); }
}

export function normalizeVideoError(error: unknown): NormalizedVideoError {
  if (error instanceof AuthenticationError || (error instanceof Error && error.message.includes("RUNWAYML_API_SECRET"))) return { kind: "configuration", message: "Video generation is not configured." };
  if (error instanceof RateLimitError) return { kind: "rate_limit", message: "Video generation is busy. Try again shortly." };
  if (error instanceof BadRequestError && /credit|balance|billing/i.test(error.message)) return { kind: "credits", message: "Video generation needs additional provider credits." };
  if (error instanceof BadRequestError && /moder|safety/i.test(error.message)) return { kind: "moderation", message: "This frame could not be animated safely." };
  if (error instanceof Error && /timeout/i.test(error.message)) return { kind: "timeout", message: "The video provider took too long to respond." };
  return { kind: "provider", message: "The video provider could not complete this request." };
}
