import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { fetchYoutubeTranscript, pastedVideo, transcriptWindow, youtubeVideoId, YoutubeTranscriptError, type TranscriptLine } from "@/lib/youtube-transcript";
import { ClassFileTranscriptError, transcribeClassFile } from "@/lib/class-file-transcript";
import { SheetWriterError, sheetWorkbook, writeSheetFromTranscript } from "@/lib/pedagogy-sheet-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

// "From a YouTube class": action "load" reads the class (title, length, transcript source); action "write" writes the
// sheet for one section. The transcript comes from, in this order: the pasted transcript, the uploaded class file
// (whisper-1), or YouTube's captions. The sheet then goes through the normal preview → generate → publish flow.
const exec = promisify(execFile);
const MAX_SECTION_MINUTES = 90;

async function fileDuration(file: Blob) {
  const directory = await mkdtemp(join(tmpdir(), "frame-class-probe-"));
  try {
    const path = join(directory, "class-source");
    await writeFile(path, Buffer.from(await file.arrayBuffer()));
    const ffprobe = join(process.cwd(), "node_modules", "ffprobe-static", "bin", process.platform, process.arch, "ffprobe");
    const { stdout } = await exec(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]);
    const seconds = Number(stdout.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("no duration");
    return seconds;
  } catch {
    throw new ClassFileTranscriptError("FRAME could not read that file. Upload the class as .mp4, .mov, .mp3 or .m4a.", "CLASS_FILE_UNREADABLE");
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Nothing was sent.", code: "SHEET_WRITER_FAILED" }, { status: 400 });
    const field = (name: string) => { const value = form.get(name); return typeof value === "string" ? value : ""; };
    const link = field("link");
    const pasted = field("transcript").trim();
    const classFile = form.get("classFile");
    const file = classFile instanceof Blob && classFile.size > 0 ? classFile : null;
    let id = ""; try { id = youtubeVideoId(link); } catch { id = ""; }

    if (field("action") === "load") {
      if (pasted) { const video = pastedVideo(link, pasted); return NextResponse.json({ id, title: "", durationSeconds: video.durationSeconds, lines: video.lines.length, path: "pasted" }); }
      if (file) return NextResponse.json({ id, title: (file as File).name?.replace(/\.[^.]+$/, "") ?? "", durationSeconds: await fileDuration(file), lines: 0, path: "class-file" });
      const video = await fetchYoutubeTranscript(link);
      return NextResponse.json({ id: video.id, title: video.title, durationSeconds: video.durationSeconds, lines: video.lines.length, path: video.path });
    }

    const from = Math.max(0, Number(field("fromMinute")) || 0);
    const to = Number(field("toMinute")) || from + 60;
    if (to <= from) throw new SheetWriterError("The section's end must be after its start.", "SHEET_SECTION_INVALID");
    if (to - from > MAX_SECTION_MINUTES) throw new SheetWriterError(`Pick a section of at most ${MAX_SECTION_MINUTES} minutes of the class.`, "SHEET_SECTION_TOO_LONG");
    const targetMinutes = Math.min(40, Math.max(3, Number(field("targetMinutes")) || 20));
    let title = field("title");
    let lines: TranscriptLine[];
    let transcriptPath: string;
    if (pasted) { lines = transcriptWindow(pastedVideo(link, pasted).lines, from * 60, to * 60); transcriptPath = "pasted"; }
    else if (file) { lines = await transcribeClassFile(file, from * 60, to * 60); transcriptPath = "class-file"; }
    else { const video = await fetchYoutubeTranscript(link); lines = transcriptWindow(video.lines, from * 60, to * 60); transcriptPath = video.path; title ||= video.title; }
    const written = await writeSheetFromTranscript({ lines, targetMinutes, educator: field("educator").slice(0, 80), title });
    const bytes = sheetWorkbook(written.concepts, { link: link || `uploaded file (${transcriptPath})`, title, writer: written.writer });
    const name = `${(title || "Class").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "Class"}_${from}-${to}min.xlsx`;
    return NextResponse.json({
      fileName: name, sheet: Buffer.from(bytes).toString("base64"), writer: written.writer, transcriptPath,
      concepts: written.concepts.length, lines: written.concepts.reduce((sum, concept) => sum + concept.lines.length, 0), fixes: written.fixes,
    });
  } catch (error) {
    if (error instanceof YoutubeTranscriptError || error instanceof SheetWriterError || error instanceof ClassFileTranscriptError) return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    console.error("Pedagogy from-youtube failed", { reason: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "The sheet could not be written. Please try again.", code: "SHEET_WRITER_FAILED" }, { status: 500 });
  }
}
