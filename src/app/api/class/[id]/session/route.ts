import { NextResponse } from "next/server";
import { ClassRoomError } from "@/lib/class-room";
import { readSession, startSession } from "@/lib/class-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json({ session: await readSession((await params).id) });
  } catch (error) {
    if (error instanceof ClassRoomError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

/** Starts (or restarts) the doubt-clearing video from every approved answer that has a board plan. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "The doubt video needs OPENAI_API_KEY for narration." }, { status: 503 });
  try {
    return NextResponse.json({ session: await startSession((await params).id) }, { status: 202 });
  } catch (error) {
    if (error instanceof ClassRoomError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Class session route failed", { reason: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Could not start the doubt video." }, { status: 500 });
  }
}
