import { NextResponse } from "next/server";
import { autoReply, ClassRoomError } from "@/lib/class-room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Auto mode: the tutor answers this student's doubt from the lecture, straight away. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; doubtId: string }> }) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "The tutor is not set up yet (OPENAI_API_KEY missing)." }, { status: 503 });
  try {
    const { id, doubtId } = await params;
    const body = await request.json().catch(() => ({})) as { studentId?: unknown };
    const doubt = await autoReply(id, doubtId, String(body.studentId ?? ""));
    return NextResponse.json({ doubt: { ...doubt, draft: undefined } });
  } catch (error) {
    if (error instanceof ClassRoomError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Class doubt reply", { path: "ai-reply-failed", reason: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "The tutor could not answer just now. Please try again." }, { status: 502 });
  }
}
