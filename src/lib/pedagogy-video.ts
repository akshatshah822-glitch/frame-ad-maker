import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildAdjustedPedagogyTimeline, pedagogyWarnings, type PedagogyRow } from "@/lib/pedagogy-brief";
import { createPedagogyNarrationTracks } from "@/lib/pedagogy-narration-duration";
import { createPedagogySlide } from "@/lib/pedagogy-slide";
import { parsePedagogyVisual } from "@/lib/pedagogy-visual";
import { createPedagogyVisualFrames, createPedagogyVisualSlide, loadPedagogyBackgrounds, loadPedagogyLogos } from "@/lib/pedagogy-visual-slide";
import { probeFinalVideo } from "@/lib/video-qa";

const exec = promisify(execFile);

async function runFfmpeg(args: string[]) {
  const executable = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  await exec(executable, ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 4_000_000, timeout: 600_000 });
}

export async function renderPedagogyVideo(rows: PedagogyRow[]) {
  const directory = await mkdtemp(join(tmpdir(), "frame-pedagogy-"));
  const outputPath = join(directory, "pedagogy-explainer.mp4");
  const warningMessages = pedagogyWarnings(rows);
  if (warningMessages.length) console.warn("Pedagogy renderer warnings", { count: warningMessages.length });

  const { narrationPaths, narrationDurations } = await createPedagogyNarrationTracks(rows, directory);
  const timeline = buildAdjustedPedagogyTimeline(rows, narrationDurations);
  for (let index = 0; index < rows.length - 1; index += 1) {
    const availableDuration = timeline.audit[index].allocatedDuration;
    if (rows[index].pauseAfter === "haan") console.info("Pedagogy pause preserved", { sourceRow: rows[index].sourceRow, silenceSeconds: Math.max(0, availableDuration - narrationDurations[index]).toFixed(3) });
  }

  const totalDuration = timeline.totalDuration;
  const visuals = timeline.rows.map((row) => parsePedagogyVisual(row.visual ?? "text", row.visualData ?? ""));
  const logos = await loadPedagogyLogos(visuals.flatMap((visual) => visual.kind === "logo" ? visual.names : []));
  const missingLogos = [...logos].filter(([, image]) => !image).map(([name]) => name);
  if (missingLogos.length) console.warn("Pedagogy logo files missing; drawing names instead", { path: "logo-name-fallback", missingLogos });
  const backgrounds = await loadPedagogyBackgrounds(timeline.rows.map((row) => row.effectiveBackground ?? "").filter(Boolean));
  const missingBackgrounds = [...backgrounds].filter(([, image]) => !image).map(([name]) => name);
  if (missingBackgrounds.length) console.warn("Pedagogy background files missing; using the procedural backdrop", { path: "procedural-backdrop-fallback", missingBackgrounds });
  const concatLines: string[] = [];
  let lastFrame = "";
  let visualRowCount = 0;
  for (const [index, row] of timeline.rows.entries()) {
    const visual = visuals[index];
    const backgroundImage = row.effectiveBackground ? backgrounds.get(row.effectiveBackground) : null;
    if (visual.kind === "text") {
      const framePath = join(directory, `frame-${String(index).padStart(4, "0")}.png`);
      await writeFile(framePath, await createPedagogySlide({ questionId: row.questionId, board: row.effectiveBoard, emphasis: row.emphasis, generatedTimeLabel: row.adjustedGeneratedTimeLabel, backgroundImage }));
      concatLines.push(`file '${framePath}'`, `duration ${row.allocatedDuration.toFixed(6)}`);
      lastFrame = framePath;
      continue;
    }
    visualRowCount += 1;
    const previous = timeline.rows[index - 1];
    const continuesPreviousVisual = Boolean(previous) && previous.visual === row.visual && previous.visualData === row.visualData;
    const frames = continuesPreviousVisual
      ? [{ png: await createPedagogyVisualSlide({ questionId: row.questionId, title: row.board, emphasis: row.emphasis, generatedTimeLabel: row.adjustedGeneratedTimeLabel, visual, logos, backgroundImage, progress: 1 }), duration: row.allocatedDuration }]
      : await createPedagogyVisualFrames({ questionId: row.questionId, title: row.board, emphasis: row.emphasis, generatedTimeLabel: row.adjustedGeneratedTimeLabel, visual, logos, backgroundImage }, row.allocatedDuration);
    for (const [frameIndex, frame] of frames.entries()) {
      const framePath = join(directory, `frame-${String(index).padStart(4, "0")}-${String(frameIndex).padStart(3, "0")}.png`);
      await writeFile(framePath, frame.png);
      concatLines.push(`file '${framePath}'`, `duration ${frame.duration.toFixed(6)}`);
      lastFrame = framePath;
    }
  }
  console.info("Pedagogy board render", { textRows: rows.length - visualRowCount, visualRows: visualRowCount });
  concatLines.push(`file '${lastFrame}'`);
  const concatPath = join(directory, "timeline.txt");
  await writeFile(concatPath, concatLines.join("\n"));

  const inputs = ["-f", "concat", "-safe", "0", "-i", concatPath];
  narrationPaths.forEach((path) => inputs.push("-i", path));
  const audioFilters = timeline.rows.map((row, index) => {
    const delay = Math.round(row.adjustedGeneratedTime * 1000);
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
  return { bytes: new Uint8Array(await readFile(outputPath)), qa: { ...qa, renderSource: "code", visualRowCount, missingLogos, missingBackgrounds, narrationDurations, timingAudit: timeline.audit, warningCount: warningMessages.length } };
}
