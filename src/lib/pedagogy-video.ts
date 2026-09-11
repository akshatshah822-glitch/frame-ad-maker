import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { assertNarrationFits, pedagogyWarnings, type PedagogyRow } from "@/lib/pedagogy-brief";
import { createPedagogySlide } from "@/lib/pedagogy-slide";
import { probeFinalVideo } from "@/lib/video-qa";
import { generateNarrationTrack } from "@/lib/voice";

const exec = promisify(execFile);

async function runFfmpeg(args: string[]) {
  const executable = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  await exec(executable, ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 4_000_000, timeout: 280_000 });
}

async function probeDuration(path: string) {
  const executable = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  const { stderr } = await exec(executable, ["-hide_banner", "-i", path, "-f", "null", "-"], { maxBuffer: 1_000_000 });
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Pedagogy narration has no readable duration.");
  return duration;
}

export async function renderPedagogyVideo(rows: PedagogyRow[]) {
  const directory = await mkdtemp(join(tmpdir(), "frame-pedagogy-"));
  const outputPath = join(directory, "pedagogy-explainer.mp4");
  const warningMessages = pedagogyWarnings(rows);
  warningMessages.forEach((warning) => console.warn("Pedagogy renderer warning", warning));

  const narrationPaths: string[] = [];
  const narrationDurations: number[] = [];
  for (const [index, row] of rows.entries()) {
    const narrationPath = join(directory, `narration-${String(index).padStart(4, "0")}.mp3`);
    await writeFile(narrationPath, await generateNarrationTrack(row.narration));
    narrationPaths.push(narrationPath);
    narrationDurations.push(await probeDuration(narrationPath));
  }

  for (let index = 0; index < rows.length - 1; index += 1) {
    const availableDuration = rows[index + 1].generatedTime - rows[index].generatedTime;
    assertNarrationFits(rows[index].sourceRow, availableDuration, narrationDurations[index]);
    if (rows[index].pauseAfter === "haan") console.info(`Pedagogy pause preserved after row ${rows[index].sourceRow}: ${Math.max(0, availableDuration - narrationDurations[index]).toFixed(3)} seconds of source-timestamp silence.`);
  }

  const videoDurations = rows.map((row, index) => index === rows.length - 1
    ? narrationDurations[index]
    : rows[index + 1].generatedTime - row.generatedTime);
  const totalDuration = rows.at(-1)!.generatedTime + narrationDurations.at(-1)!;
  const concatLines: string[] = [];
  for (const [index, row] of rows.entries()) {
    const framePath = join(directory, `frame-${String(index).padStart(4, "0")}.png`);
    await writeFile(framePath, await createPedagogySlide({ questionId: row.questionId, board: row.effectiveBoard, emphasis: row.emphasis, generatedTimeLabel: row.generatedTimeLabel }));
    concatLines.push(`file '${framePath}'`, `duration ${videoDurations[index].toFixed(6)}`);
  }
  const lastFrame = join(directory, `frame-${String(rows.length - 1).padStart(4, "0")}.png`);
  concatLines.push(`file '${lastFrame}'`);
  const concatPath = join(directory, "timeline.txt");
  await writeFile(concatPath, concatLines.join("\n"));

  const inputs = ["-f", "concat", "-safe", "0", "-i", concatPath];
  narrationPaths.forEach((path) => inputs.push("-i", path));
  const audioFilters = rows.map((row, index) => {
    const delay = Math.round(row.generatedTime * 1000);
    return `[${index + 1}:a]adelay=${delay}|${delay},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${index}]`;
  });
  const audioInputs = rows.map((_, index) => `[a${index}]`).join("");
  await runFfmpeg([
    ...inputs,
    "-filter_complex", `[0:v]fps=24,format=yuv420p,setsar=1[outv];${audioFilters.join(";")};${audioInputs}amix=inputs=${rows.length}:duration=longest:normalize=0,atrim=duration=${totalDuration.toFixed(6)}[outa]`,
    "-map", "[outv]", "-map", "[outa]", "-t", totalDuration.toFixed(6), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "24", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", outputPath,
  ]);
  const qa = await probeFinalVideo(outputPath, { width: 1920, height: 1080, duration: totalDuration });
  if (!qa.passed) throw new Error(`Pedagogy video technical QA failed: ${JSON.stringify(qa)}`);
  return { bytes: new Uint8Array(await readFile(outputPath)), qa: { ...qa, renderSource: "code", narrationDurations, warningMessages } };
}
