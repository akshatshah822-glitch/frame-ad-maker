import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { PedagogyRow } from "@/lib/pedagogy-brief";
import { generateNarrationTrack } from "@/lib/voice";

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

async function probeDuration(path: string) {
  const executable = join(process.cwd(), "node_modules", "ffprobe-static", "bin", process.platform, process.arch, process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  const { stdout } = await exec(executable, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path], { maxBuffer: 1_000_000 });
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Pedagogy narration has no readable duration.");
  return duration;
}

export async function createPedagogyNarrationTracks(rows: PedagogyRow[], directory: string, onProgress?: (progress: { completed: number; total: number }) => void) {
  const narrationPaths: string[] = [];
  const narrationDurations: number[] = [];
  for (const [index, row] of rows.entries()) {
    const narrationPath = join(directory, `narration-${String(index).padStart(4, "0")}.mp3`);
    try {
      const audio = await generateNarrationTrack(row.narration);
      try { await writeFile(narrationPath, audio); } catch { throw new PedagogyNarrationMeasurementError(row.sourceRow, "audio-write"); }
    } catch (error) {
      if (error instanceof PedagogyNarrationMeasurementError) throw error;
      throw new PedagogyNarrationMeasurementError(row.sourceRow, "speech-generation");
    }
    narrationPaths.push(narrationPath);
    try { narrationDurations.push(await probeDuration(narrationPath)); } catch { throw new PedagogyNarrationMeasurementError(row.sourceRow, "duration-probe"); }
    onProgress?.({ completed: index + 1, total: rows.length });
  }
  return { narrationPaths, narrationDurations };
}
