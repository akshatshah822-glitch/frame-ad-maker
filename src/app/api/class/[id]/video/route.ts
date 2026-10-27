import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { ClassRoomError, classVideoPath, readClass } from "@/lib/class-room";
import { sessionVideoPath } from "@/lib/class-session";

export const runtime = "nodejs";

/** Streams the lecture (or doubt) video with byte ranges, so students can seek to any moment. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const info = await readClass((await params).id);
    // ?part=doubts serves the doubt-clearing video; otherwise the lecture.
    const path = new URL(request.url).searchParams.get("part") === "doubts" ? sessionVideoPath(info.id) : classVideoPath(info);
    const size = (await stat(path)).size;
    const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") ?? "");
    if (!range) return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { headers: { "Content-Type": "video/mp4", "Content-Length": String(size), "Accept-Ranges": "bytes" } });
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream, {
      status: 206,
      headers: { "Content-Type": "video/mp4", "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes" },
    });
  } catch (error) {
    const status = error instanceof ClassRoomError ? error.status : 404;
    return new Response("Video not found", { status });
  }
}
