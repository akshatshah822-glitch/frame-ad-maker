export type OpenAIErrorKind = "rate_limit" | "quota" | "configuration" | "upstream";

export function classifyOpenAIError(error: unknown): OpenAIErrorKind {
  const upstream = error as { status?: number; code?: string; error?: { code?: string } };
  const code = upstream.code ?? upstream.error?.code ?? "";
  if (upstream.status === 429 && /quota|billing|credit/i.test(code)) return "quota";
  if (upstream.status === 429) return "rate_limit";
  if (upstream.status === 401 || upstream.status === 403) return "configuration";
  return "upstream";
}
