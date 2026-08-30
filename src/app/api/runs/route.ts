import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { clientId?: string; brief?: unknown } | null;
  if (!body?.clientId?.trim() || !body.brief) return NextResponse.json({ error: "The brief could not be started." }, { status: 400 });
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return NextResponse.json({ error: "Run tracking is not configured." }, { status: 503 });
  const client = new ConvexHttpClient(convexUrl);
  const runId = await client.mutation(anyApi.runs.create, { clientId: body.clientId.trim(), brief: JSON.stringify(body.brief) });
  return NextResponse.json({ runId });
}
