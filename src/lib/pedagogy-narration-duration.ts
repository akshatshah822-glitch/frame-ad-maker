import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { assertNarrationFits, type PedagogyRow } from "@/lib/pedagogy-brief";
import { generateNarrationTrack } from "@/lib/voice";

const exec = promisify(execFile);

async function probeDuration(path: string) {
  const executable = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  const { stderr } = await exec(executable, ["-hide_banner", "-i", path, "-f", "null", "-"], { maxBuffer: 1_000_000 });
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Pedagogy narration has no readable duration.");
  return duration;
}

export async function createPedagogyNarrationTracks(rows: PedagogyRow[], directory: string) {
  const narrationPaths: string[] = [];
  const narrationDurations: number[] = [];
  for (const [index, row] of rows.entries()) {
    const narrationPath = join(directory, `narration-${String(index).padStart(4, "0")}.mp3`);
    await writeFile(narrationPath, await generateNarrationTrack(row.narration));
    narrationPaths.push(narrationPath);
    narrationDurations.push(await probeDuration(narrationPath));
  }
  return { narrationPaths, narrationDurations };
}

export function validatePedagogyNarrationTiming(rows: PedagogyRow[], narrationDurations: number[]) {
  for (let index = 0; index < rows.length - 1; index += 1) {
    const availableDuration = rows[index + 1].generatedTime - rows[index].generatedTime;
    assertNarrationFits(rows[index].sourceRow, availableDuration, narrationDurations[index]);
  }
}
