import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { email?: unknown; brandName?: unknown; storyboardId?: unknown } | null;
    const email = String(body?.email ?? "").trim().toLowerCase();
    const brandName = String(body?.brandName ?? "").trim();
    const storyboardId = String(body?.storyboardId ?? "").trim();
    if (!email || !email.includes("@") || !brandName || !storyboardId) return NextResponse.json({ error: "Enter your email and brand name." }, { status: 400 });
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) return NextResponse.json({ error: "Request storage is not configured." }, { status: 503 });
    const requestId = await new ConvexHttpClient(convexUrl).mutation(anyApi.videoRequests.create, { email, brandName, storyboardId });
    return NextResponse.json({ requestId });
  } catch (error) {
    console.error("Real video request could not be saved", error);
    return NextResponse.json({ error: "Your request could not be saved. Try again." }, { status: 500 });
  }
}
