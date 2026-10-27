import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { ClassRoomError, lectureFrame, readTranscript } from "@/lib/class-room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?t=SECONDS → a still from the lecture video at that moment (used as "From the lecture" pictures). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const t = Number(new URL(request.url).searchParams.get("t"));
    const transcript = await readTranscript(id);
    const end = transcript?.at(-1)?.end ?? 6 * 3600;
    if (!Number.isInteger(t) || t < 0 || t > end) return NextResponse.json({ error: "Pick a moment inside the lecture." }, { status: 400 });
    const image = await readFile(await lectureFrame(id, t));
    return new NextResponse(new Uint8Array(image), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch (error) {
    if (error instanceof ClassRoomError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Class lecture frame", { path: "failed", reason: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Could not load that picture." }, { status: 500 });
  }
}
