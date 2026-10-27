import { NextResponse } from "next/server";
import { answerDoubt, ClassRoomError } from "@/lib/class-room";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; doubtId: string }> }) {
  try {
    const { id, doubtId } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    return NextResponse.json({ doubt: await answerDoubt(id, doubtId, body) });
  } catch (error) {
    if (error instanceof ClassRoomError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Class answer route failed", error);
    return NextResponse.json({ error: "Could not save the answer." }, { status: 500 });
  }
}
