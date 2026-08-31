import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const get = async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return NextResponse.json({ error: "Run tracking is not configured." }, { status: 503 });
  try {
    const client = new ConvexHttpClient(convexUrl);
    const run = await client.query(anyApi.runs.getById, { id });
    if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
    return NextResponse.json({ run }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }
};

export const GET = withJsonErrors(get);
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const OPTIONS = methodNotAllowed(["GET"]);
