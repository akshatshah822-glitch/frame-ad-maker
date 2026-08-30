import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: string; source?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  const source = body?.source?.trim();
  if (!email || !source) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return NextResponse.json({ error: "Signup storage is not configured." }, { status: 503 });
  const client = new ConvexHttpClient(convexUrl);
  const signupId = await client.mutation(anyApi.signups.create, { email, source });
  return NextResponse.json({ signupId });
}
