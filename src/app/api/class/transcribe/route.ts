import { NextResponse } from "next/server";
import { ClassRoomError, transcribeDoubt } from "@/lib/class-room";

export const runtime = "nodejs";
export const maxDuration = 60;

/** A student's spoken doubt (English, Hindi or Hinglish) to text. */
export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Voice doubts need OPENAI_API_KEY. Please type your doubt." }, { status: 503 });
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) throw new ClassRoomError("No recording received.");
    const fileName = audio.type.includes("mp4") ? "doubt.mp4" : audio.type.includes("ogg") ? "doubt.ogg" : "doubt.webm";
    return NextResponse.json({ text: await transcribeDoubt(audio, fileName) });
  } catch (error) {
    if (error instanceof ClassRoomError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Class transcribe route failed", { path: "openai-transcribe", reason: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Could not understand the recording. Please type your doubt." }, { status: 502 });
  }
}
