import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { PedagogyRow } from "@/lib/pedagogy-brief";
import { generatePedagogyNarrationTrack } from "@/lib/pedagogy-voice";

const exec = promisify(execFile);

export class PedagogyNarrationMeasurementError extends Error {
  readonly code = "NARRATION_MEASUREMENT_FAILED" as const;
  readonly sourceRow: number;
  readonly safeReason: string;

  constructor(sourceRow: number, stage: "speech-generation" | "audio-write" | "duration-probe") {
    super(`Row ${sourceRow}: FRAME could not complete narration ${stage.replace("-", " ")}.`);
    this.name = "PedagogyNarrationMeasurementError";
    this.sourceRow = sourceRow;
    this.safeReason = `Narration ${stage} failed.`;
  }
}

export const NARRATION_SILENCE_THRESHOLD_DB = -45;

async function probeDuration(path: string) {
  const executable = join(process.cwd(), "node_modules", "ffprobe-static", "bin", process.platform, process.arch, process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  const { stdout } = await exec(executable, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path], { maxBuffer: 1_000_000 });
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Pedagogy narration has no readable duration.");
  return duration;
}

export type NarrationTrimResult = { path: string; trimmed: boolean; durationBefore: number; durationAfter: number };

/**
 * Removes silence at the very start and very end of one narration clip.
 * Silence inside the clip (pauses between sentences) is left untouched.
 * If anything fails, the untrimmed clip is used and the fallback is logged.
 */
export async function trimNarrationSilence(inputPath: string, outputPath: string, sourceRow: number): Promise<NarrationTrimResult> {
  let durationBefore = Number.NaN;
  try {
    durationBefore = await probeDuration(inputPath);
    const edge = `silenceremove=start_periods=1:start_threshold=${NARRATION_SILENCE_THRESHOLD_DB}dB:start_silence=0.04`;
    const ffmpeg = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
    await exec(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, "-af", `${edge},areverse,${edge},areverse`, "-c:a", "pcm_s16le", outputPath], { maxBuffer: 4_000_000, timeout: 120_000 });
    const durationAfter = await probeDuration(outputPath);
    if (durationAfter < 0.2 || durationAfter > durationBefore + 0.05) throw new Error(`implausible trimmed duration ${durationAfter}`);
    return { path: outputPath, trimmed: true, durationBefore, durationAfter };
  } catch (error) {
    console.warn("Pedagogy narration trim fell back to untrimmed clip", { path: "untrimmed", sourceRow, reason: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
    return { path: inputPath, trimmed: false, durationBefore, durationAfter: durationBefore };
  }
}

export type PedagogyNarrationTrackOptions = { trimSilence?: boolean };

export async function createPedagogyNarrationTracks(rows: PedagogyRow[], directory: string, onProgress?: (progress: { completed: number; total: number }) => void, options: PedagogyNarrationTrackOptions = {}) {
  const narrationPaths: string[] = [];
  const narrationDurations: number[] = [];
  for (const [index, row] of rows.entries()) {
    const narrationPath = join(directory, `narration-${String(index).padStart(4, "0")}.mp3`);
    try {
      const audio = await generatePedagogyNarrationTrack(row.narration);
      try { await writeFile(narrationPath, audio); } catch { throw new PedagogyNarrationMeasurementError(row.sourceRow, "audio-write"); }
    } catch (error) {
      if (error instanceof PedagogyNarrationMeasurementError) throw error;
      throw new PedagogyNarrationMeasurementError(row.sourceRow, "speech-generation");
    }
    if (options.trimSilence) {
      const trim = await trimNarrationSilence(narrationPath, join(directory, `narration-${String(index).padStart(4, "0")}-trimmed.wav`), row.sourceRow);
      if (!Number.isFinite(trim.durationAfter)) throw new PedagogyNarrationMeasurementError(row.sourceRow, "duration-probe");
      narrationPaths.push(trim.path);
      narrationDurations.push(trim.durationAfter);
    } else {
      narrationPaths.push(narrationPath);
      try { narrationDurations.push(await probeDuration(narrationPath)); } catch { throw new PedagogyNarrationMeasurementError(row.sourceRow, "duration-probe"); }
    }
    onProgress?.({ completed: index + 1, total: rows.length });
  }
  return { narrationPaths, narrationDurations };
}
