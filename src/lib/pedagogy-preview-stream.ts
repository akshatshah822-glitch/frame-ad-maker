import { readJsonResponse } from "@/lib/read-json-response";
import type { PedagogyRow, PedagogyTimingAuditRow } from "@/lib/pedagogy-brief";

export type PedagogyPreviewResult = {
  rows: PedagogyRow[];
  warnings: string[];
  grammarWarnings: string[];
  timingAudit: PedagogyTimingAuditRow[];
};

export type PedagogyPreviewFailure = { error?: string; code?: string; sourceRow?: number | null };
export type PedagogyPreviewResponse = Partial<PedagogyPreviewResult> & PedagogyPreviewFailure;

export type PedagogyPreviewProgress = {
  type: "progress";
  phase: "checking-grammar" | "measuring-narration" | "building-timeline";
  completed: number;
  total: number;
};

type PedagogyPreviewEvent = PedagogyPreviewProgress
  | { type: "result"; result: PedagogyPreviewResult }
  | { type: "error"; error: string; code: string; sourceRow: number | null };

export function encodePedagogyPreviewEvent(event: PedagogyPreviewEvent) {
  return `${JSON.stringify(event)}\n`;
}

export async function readPedagogyPreviewStream(response: Response, onProgress: (progress: PedagogyPreviewProgress) => void): Promise<PedagogyPreviewResponse> {
  if (!response.ok || !response.headers.get("content-type")?.includes("application/x-ndjson")) {
    return readJsonResponse<PedagogyPreviewResponse>(response);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Pedagogy preview did not provide a readable progress stream.");
  const decoder = new TextDecoder();
  let buffer = "";
  let result: PedagogyPreviewResult | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as PedagogyPreviewEvent;
    if (event.type === "progress") onProgress(event);
    if (event.type === "error") throw Object.assign(new Error(event.error), { code: event.code, sourceRow: event.sourceRow });
    if (event.type === "result") result = event.result;
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(consume);
    if (done) break;
  }
  consume(buffer);
  if (!result) throw new Error("Pedagogy preview completed without a result.");
  return result;
}
