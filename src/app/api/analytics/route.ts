import { NextResponse } from "next/server";
import { methodNotAllowed, withJsonErrors } from "@/lib/api-response";

const allowedEvents = new Set(["brief_started", "brief_submitted", "directions_shown", "film_shown", "email_submitted"]);
const productionHost = "frame-ad-maker.vercel.app";

const post = async (request: Request) => {
  if (new URL(request.url).hostname !== productionHost) {
    return NextResponse.json({ delivered: false, reason: "non_production" });
  }
  const body = await request.json().catch(() => null) as { event?: string; path?: string; email?: string; treatmentId?: string } | null;
  if (!body?.event || !allowedEvents.has(body.event)) return NextResponse.json({ error: "Unknown analytics event." }, { status: 400 });
  const apiKey = process.env.POSTHOG_PROJECT_KEY;
  if (!apiKey) return NextResponse.json({ error: "Analytics is not configured." }, { status: 503 });
  const distinctId = request.headers.get("x-frame-client-id") || "anonymous";
  const response = await fetch("https://us.i.posthog.com/capture/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, event: body.event, timestamp: new Date().toISOString(), properties: { distinct_id: distinctId, $current_url: body.path || "/", source: "frame_web", env: "production", ...(body.event === "film_shown" && body.treatmentId ? { treatment_id: body.treatmentId.slice(0, 128) } : {}), ...(body.event === "email_submitted" && body.email ? { email: body.email.slice(0, 254) } : {}) } }),
  });
  if (!response.ok) return NextResponse.json({ error: "Analytics delivery failed." }, { status: 502 });
  return NextResponse.json({ delivered: true, event: body.event });
};

export const POST = withJsonErrors(post);
export const GET = methodNotAllowed(["POST"]);
export const HEAD = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const OPTIONS = methodNotAllowed(["POST"]);
