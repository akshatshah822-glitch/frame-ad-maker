import { NextResponse } from "next/server";
import { ClassRoomError, draftAnswer } from "@/lib/class-room";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "AI drafts need OPENAI_API_KEY." }, { status: 503 });
  try {
    const body = await request.json().catch(() => ({})) as { doubtId?: string };
    return NextResponse.json({ draft: await draftAnswer((await params).id, String(body.doubtId ?? "")) });
  } catch (error) {
    if (error instanceof ClassRoomError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Class draft route failed", { path: "openai-draft", reason: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "The AI draft failed. You can still write the answer yourself." }, { status: 502 });
  }
}
