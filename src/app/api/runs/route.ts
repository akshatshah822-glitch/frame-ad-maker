import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";

const post = async (request: Request) => {
  const body = await request.json().catch(() => null) as { clientId?: unknown; brief?: unknown } | null;
  const clientId = String(body?.clientId ?? "").trim();
  if (!clientId || !body?.brief) return NextResponse.json({ error: "The brief could not be started." }, { status: 400 });
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return NextResponse.json({ error: "Run tracking is not configured." }, { status: 503 });
  const client = new ConvexHttpClient(convexUrl);
  const runId = await client.mutation(anyApi.runs.create, { clientId, brief: JSON.stringify(body.brief) });
  return NextResponse.json({ runId });
};

export const POST = withJsonErrors(post);
export const GET = methodNotAllowed(["POST"]);
export const HEAD = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const OPTIONS = methodNotAllowed(["POST"]);
