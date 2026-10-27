import { NextResponse } from "next/server";
import { ClassRoomError } from "@/lib/class-room";
import { parsePublishFields, publishClass } from "@/lib/class-publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Multipart: video (the MP4 just generated), title, subtitle, rows and audit (JSON from that render), duration. */
export async function POST(request: Request) {
  try {
    const form = await request.formData().catch(() => null);
    const video = form?.get("video");
    if (!form || !(video instanceof Blob)) return NextResponse.json({ error: "Generate the video first, then publish it." }, { status: 400 });
    const fields = parsePublishFields({ title: form.get("title"), subtitle: form.get("subtitle"), rows: form.get("rows"), audit: form.get("audit"), duration: form.get("duration") });
    const published = await publishClass({ ...fields, video: new Uint8Array(await video.arrayBuffer()) });
    return NextResponse.json(published, { status: 201 });
  } catch (error) {
    if (error instanceof ClassRoomError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Class publish failed", { reason: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "The class could not be published. Please try again." }, { status: 500 });
  }
}
