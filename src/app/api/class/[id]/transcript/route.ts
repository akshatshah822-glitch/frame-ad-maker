import { NextResponse } from "next/server";
import { ClassRoomError, ensureTranscript } from "@/lib/class-room";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Builds the lecture transcript once, so the inbox can show what was being said at each doubt. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "The transcript needs OPENAI_API_KEY." }, { status: 503 });
  try {
    return NextResponse.json({ segments: (await ensureTranscript((await params).id)).length });
  } catch (error) {
    if (error instanceof ClassRoomError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Class transcript route failed", { path: "openai-whisper", reason: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Could not build the lecture transcript." }, { status: 502 });
  }
}
