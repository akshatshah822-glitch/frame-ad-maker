export type OpenAIErrorKind = "moderation_blocked" | "rate_limit" | "quota" | "configuration" | "upstream";

type OpenAIErrorShape = { status?: number; code?: string | null; requestID?: string | null; error?: { code?: string | null } };

export function classifyOpenAIError(error: unknown): OpenAIErrorKind {
  const upstream = error as OpenAIErrorShape;
  const code = upstream.code ?? upstream.error?.code ?? "";
  if (code === "moderation_blocked") return "moderation_blocked";
  if (upstream.status === 429 && /quota|billing|credit/i.test(code)) return "quota";
  if (upstream.status === 429) return "rate_limit";
  if (upstream.status === 401 || upstream.status === 403) return "configuration";
  return "upstream";
}

export function getOpenAIRequestId(error: unknown) {
  return (error as OpenAIErrorShape).requestID ?? "unknown";
}
