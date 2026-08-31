import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";

const post = async (request: Request) => {
  const body = await request.json().catch(() => null) as { email?: unknown; source?: unknown } | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  const source = String(body?.source ?? "").trim();
  if (!email || !source) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return NextResponse.json({ error: "Signup storage is not configured." }, { status: 503 });
  const client = new ConvexHttpClient(convexUrl);
  const signupId = await client.mutation(anyApi.signups.create, { email, source });
  return NextResponse.json({ signupId });
};

export const POST = withJsonErrors(post);
export const GET = methodNotAllowed(["POST"]);
export const HEAD = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const OPTIONS = methodNotAllowed(["POST"]);
