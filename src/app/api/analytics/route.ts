import { NextResponse } from "next/server";

const allowedEvents = new Set(["brief_started", "brief_submitted", "directions_shown", "film_shown", "email_submitted"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { event?: string; path?: string; email?: string } | null;
  if (!body?.event || !allowedEvents.has(body.event)) return NextResponse.json({ error: "Unknown analytics event." }, { status: 400 });
  const apiKey = process.env.POSTHOG_PROJECT_KEY;
  if (!apiKey) return NextResponse.json({ error: "Analytics is not configured." }, { status: 503 });
  const distinctId = request.headers.get("x-frame-client-id") || "anonymous";
  const response = await fetch("https://us.i.posthog.com/capture/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, event: body.event, timestamp: new Date().toISOString(), properties: { distinct_id: distinctId, $current_url: body.path || "/", source: "frame_web", ...(body.event === "email_submitted" && body.email ? { email: body.email.slice(0, 254) } : {}) } }),
  });
  if (!response.ok) return NextResponse.json({ error: "Analytics delivery failed." }, { status: 502 });
  return NextResponse.json({ delivered: true, event: body.event });
}
