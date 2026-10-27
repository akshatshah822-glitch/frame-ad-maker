import { NextResponse } from "next/server";
import { ClassRoomError, setFollowUp } from "@/lib/class-room";
import { readSession, scheduleSession } from "@/lib/class-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Got it" or "Still confused". Still confused queues the doubt for the doubts-explained video. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; doubtId: string }> }) {
  try {
    const { id, doubtId } = await params;
    const body = await request.json().catch(() => ({})) as { studentId?: unknown; state?: unknown };
    const doubt = await setFollowUp(id, doubtId, String(body.studentId ?? ""), body.state);
    if (doubt.followUp?.state === "confused") scheduleSession(id);
    return NextResponse.json({ doubt: { ...doubt, draft: undefined }, session: await readSession(id) });
  } catch (error) {
    if (error instanceof ClassRoomError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Class doubt follow-up failed", { reason: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Could not save that. Please try again." }, { status: 500 });
  }
}
