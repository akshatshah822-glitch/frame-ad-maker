import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import OpenAI, { toFile } from "openai";
import type { TranscriptLine } from "@/lib/youtube-transcript";

// Third transcript path, for when YouTube will not hand over its captions: the educator uploads the class
// video (or audio) file and FRAME transcribes only the chosen section with OpenAI whisper-1 (time-stamped).
// Cost: about US$0.006 per minute of class transcribed. The log says path class-file and the minutes sent.

const exec = promisify(execFile);
const CHUNK_SECONDS = 600; // 10-minute pieces: about 2.4 MB each at 32 kb/s, well under OpenAI's 25 MB limit

export class ClassFileTranscriptError extends Error {
  constructor(message: string, readonly code = "CLASS_FILE_TRANSCRIPT_FAILED") { super(message); }
}

export async function transcribeClassFile(file: Blob, fromSeconds: number, toSeconds: number): Promise<TranscriptLine[]> {
  if (!process.env.OPENAI_API_KEY) throw new ClassFileTranscriptError("Transcribing a class file needs OPENAI_API_KEY.", "CLASS_FILE_NOT_CONFIGURED");
  if (toSeconds <= fromSeconds) throw new ClassFileTranscriptError("The section's end must be after its start.");
  const directory = await mkdtemp(join(tmpdir(), "frame-class-file-"));
  const ffmpeg = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  try {
    const source = join(directory, "class-source");
    await writeFile(source, Buffer.from(await file.arrayBuffer()));
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 300_000, maxRetries: 1 });
    const lines: TranscriptLine[] = [];
    for (let start = fromSeconds; start < toSeconds; start += CHUNK_SECONDS) {
      const length = Math.min(CHUNK_SECONDS, toSeconds - start);
      const piece = join(directory, `piece-${start}.mp3`);
      try {
        await exec(ffmpeg, ["-y", "-v", "error", "-ss", String(start), "-t", String(length), "-i", source, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", piece], { maxBuffer: 1024 * 1024 });
      } catch {
        throw new ClassFileTranscriptError("FRAME could not read the audio in that file. Upload the class as .mp4, .mov, .mp3 or .m4a.", "CLASS_FILE_UNREADABLE");
      }
      const audio = await readFile(piece);
      if (audio.length < 2000) break; // past the end of the recording
      const result = await client.audio.transcriptions.create({
        file: await toFile(audio, `class-${start}.mp3`), model: "whisper-1", response_format: "verbose_json", timestamp_granularities: ["segment"],
        prompt: "An Indian teacher's class in Hinglish: Hindi in Devanagari with English words in English.",
      }) as unknown as { segments?: { start: number; text: string }[] };
      for (const segment of result.segments ?? []) {
        const text = segment.text.replace(/\s+/g, " ").trim();
        if (text) lines.push({ start: start + segment.start, text });
      }
    }
    console.info(`Youtube transcript: path class-file, ${Math.round((toSeconds - fromSeconds) / 60)} min sent to whisper-1, ${lines.length} lines`);
    if (lines.length < 5) throw new ClassFileTranscriptError("FRAME heard almost no speech in that section of the file.", "CLASS_FILE_EMPTY");
    return lines;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
