export type ProviderJobState = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export type ProviderJob = {
  id: string;
  state: ProviderJobState;
  progress?: number;
  outputUrl?: string;
  estimatedCredits?: number;
  finalCredits?: number;
  failure?: string;
  failureCode?: string;
};

export interface VideoProvider {
  createVideoJob(input: { referenceImageUrl: string; motionPrompt: string; duration: number; ratio: "1280:720" | "720:1280" | "1104:832" | "832:1104" | "960:960" | "1584:672" }): Promise<ProviderJob>;
  getVideoJobStatus(id: string): Promise<ProviderJob>;
  downloadVideoResult(url: string): Promise<Uint8Array>;
  cancelVideoJob(id: string): Promise<void>;
}

export type NormalizedVideoError = { kind: "configuration" | "rate_limit" | "credits" | "moderation" | "timeout" | "provider"; message: string };
