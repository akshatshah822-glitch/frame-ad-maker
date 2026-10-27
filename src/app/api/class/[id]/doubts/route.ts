import { NextResponse } from "next/server";
import { addDoubt, ClassRoomError, listDoubts, readTranscript, transcriptAround } from "@/lib/class-room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown) {
  if (error instanceof ClassRoomError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Class doubts route failed", error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

/** ?studentId=… returns only that student's doubts; ?view=teacher returns every doubt with what was being said. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const doubts = await listDoubts(id);
    if (url.searchParams.get("view") === "teacher") {
      const transcript = await readTranscript(id);
      return NextResponse.json({ doubts: doubts.map((doubt) => ({ ...doubt, saying: transcript ? transcriptAround(transcript, doubt.at, 25, 5) : "" })), transcriptReady: Boolean(transcript) });
    }
    const studentId = url.searchParams.get("studentId") ?? "";
    // Students see answers (AI tutor or educator), never the internal draft copy.
    return NextResponse.json({ doubts: doubts.filter((doubt) => doubt.studentId === studentId).map((doubt) => ({ ...doubt, draft: undefined })) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    return NextResponse.json({ doubt: await addDoubt((await params).id, body) }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
