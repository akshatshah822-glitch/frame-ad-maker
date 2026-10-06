import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildAdjustedPedagogyTimeline, parsePedagogyArcs, PedagogyBriefValidationError, pedagogyWarnings, type PedagogyRow } from "@/lib/pedagogy-brief";
import { createPedagogyNarrationTracks } from "@/lib/pedagogy-narration-duration";
import { createPedagogySlide, pedagogySlideFontSize, type PedagogySlideState } from "@/lib/pedagogy-slide";
import { createPassageSlide, passageSlideFontSize } from "@/lib/pedagogy-passage-slide";
import { createTrickSlide, TRICK_ANIMATION_FRAMES, TRICK_FRAME_SECONDS } from "@/lib/pedagogy-trick-slide";
import { createConceptSlide, conceptSlideFontSize, type ConceptSlideState } from "@/lib/pedagogy-concept-slide";
import { createDiagramSlide, diagramSlideFontSize, DIAGRAM_ANIMATION_FRAMES, DIAGRAM_FRAME_SECONDS, type DiagramSlideState } from "@/lib/pedagogy-diagram-slide";
import { probeFinalVideo } from "@/lib/video-qa";

const exec = promisify(execFile);

export type PedagogyRenderProgress =
  | { phase: "generating-narration"; completed: number; total: number }
  | { phase: "building-timeline" }
  | { phase: "rendering-slides"; completed: number; total: number }
  | { phase: "assembling-mp4" };

export type PedagogyFileRenderOptions = {
  directory: string;
  outputPath: string;
  onProgress?: (progress: PedagogyRenderProgress) => void;
  /** Pack narration: trim clip-edge silence and place lines back to back, ignoring timestamps. */
  pack?: boolean;
};

export class PedagogySlideRenderError extends Error {
  readonly code = "PEDAGOGY_SLIDE_RENDER_FAILED" as const;
  readonly sourceRow: number;

  constructor(sourceRow: number) {
    super(`Row ${sourceRow}: FRAME could not render the code-drawn slide.`);
    this.name = "PedagogySlideRenderError";
    this.sourceRow = sourceRow;
  }
}

async function runFfmpeg(args: string[]) {
  const executable = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  await exec(executable, ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 4_000_000, timeout: 600_000 });
}

export async function renderPedagogyVideoToFile(rows: PedagogyRow[], options: PedagogyFileRenderOptions) {
  const { directory, outputPath, onProgress, pack = false } = options;
  console.info("Pedagogy timing mode", { path: pack ? "packed" : "timestamps" });
  const warningMessages = pedagogyWarnings(rows);
  if (warningMessages.length) console.warn("Pedagogy renderer warnings", { count: warningMessages.length });

  const { narrationPaths, narrationDurations } = await createPedagogyNarrationTracks(rows, directory, ({ completed, total }) => {
    onProgress?.({ phase: "generating-narration", completed, total });
  }, { trimSilence: pack });
  onProgress?.({ phase: "building-timeline" });
  const timeline = buildAdjustedPedagogyTimeline(rows, narrationDurations, { pack });
  for (let index = 0; index < rows.length - 1; index += 1) {
    const availableDuration = timeline.audit[index].allocatedDuration;
    if (rows[index].pauseAfter === "haan") console.info("Pedagogy pause preserved", { sourceRow: rows[index].sourceRow, silenceSeconds: Math.max(0, availableDuration - narrationDurations[index]).toFixed(3) });
  }

  const totalDuration = timeline.totalDuration;
  const concatLines: string[] = [];
  let lastFrame = "";
  const trickRows = timeline.rows.filter((row) => row.layout === "trick").length;
  const passageRows = timeline.rows.filter((row) => row.layout === "passage").length;
  const diagramRows = timeline.rows.filter((row) => row.layout === "diagram").length;
  const conceptRows = timeline.rows.filter((row) => row.layout === "concept").length;
  const layouts = new Set(timeline.rows.map((row) => row.layout));
  console.info("Pedagogy layout", { path: layouts.size === 1 ? [...layouts][0] : "mixed", trickRows, passageRows, diagramRows, conceptRows });
  // One text size per slide type for the whole video: every slide uses the smallest size any slide of that type needs.
  const boardState = (index: number): PedagogySlideState => {
    const row = timeline.rows[index];
    // Every question slide uses the strip view, so question, options and solution share one text size.
    return { questionId: row.questionId, questionText: row.effectiveQuestionText, options: row.effectiveOptions, board: row.effectiveBoard, emphasis: row.emphasis, generatedTimeLabel: row.adjustedGeneratedTimeLabel, questionView: "strip" };
  };
  const passageState = (index: number) => {
    const row = timeline.rows[index];
    const taught = timeline.rows.slice(0, index).filter((earlier) => earlier.questionId === row.questionId && earlier.emphasis.trim()).map((earlier) => earlier.emphasis);
    return { passage: row.effectiveQuestionText, emphasis: row.emphasis, taught, board: row.board, title: "Read with me", timeLabel: row.adjustedGeneratedTimeLabel };
  };
  const diagramState = (index: number): DiagramSlideState => {
    const row = timeline.rows[index];
    return { diagram: row.diagram, step: row.diagramStep, board: row.effectiveBoard, emphasis: row.emphasis, title: row.effectiveQuestionText.trim() || row.questionId, timeLabel: row.adjustedGeneratedTimeLabel, labels: row.diagramLabels, items: row.diagramItems };
  };
  const conceptState = (index: number): ConceptSlideState => {
    const row = timeline.rows[index];
    return { topic: row.effectiveQuestionText.trim() || row.questionId, board: row.effectiveBoard, emphasis: row.emphasis, timeLabel: row.adjustedGeneratedTimeLabel };
  };
  const sizeByLayout = new Map<string, number>();
  for (const [index, row] of timeline.rows.entries()) {
    if (row.layout === "trick") continue;
    const key = row.layout;
    try {
      const size = row.layout === "passage" ? await passageSlideFontSize(passageState(index))
        : row.layout === "diagram" ? await diagramSlideFontSize(diagramState(index))
        : row.layout === "concept" ? await conceptSlideFontSize(conceptState(index))
        : await pedagogySlideFontSize(boardState(index));
      sizeByLayout.set(key, Math.min(size, sizeByLayout.get(key) ?? size));
    } catch {
      throw new PedagogySlideRenderError(row.sourceRow);
    }
  }
  console.info("Pedagogy text size", { path: "one-size-per-video", sizes: Object.fromEntries(sizeByLayout) });
  for (const [index, row] of timeline.rows.entries()) {
    const framePrefix = join(directory, `frame-${String(index).padStart(4, "0")}`);
    try {
      if (row.layout === "passage") {
        const framePath = `${framePrefix}.png`;
        await writeFile(framePath, await createPassageSlide({ ...passageState(index), maxFontSize: sizeByLayout.get("passage") }));
        concatLines.push(`file '${framePath}'`, `duration ${row.allocatedDuration.toFixed(6)}`);
        lastFrame = framePath;
      } else if (row.layout === "concept") {
        const framePath = `${framePrefix}.png`;
        await writeFile(framePath, await createConceptSlide({ ...conceptState(index), maxFontSize: sizeByLayout.get("concept") }));
        concatLines.push(`file '${framePath}'`, `duration ${row.allocatedDuration.toFixed(6)}`);
        lastFrame = framePath;
      } else if (row.layout === "diagram") {
        const previous = timeline.rows[index - 1];
        const state = { ...diagramState(index), maxFontSize: sizeByLayout.get("diagram") };
        // Fade the newest step in only when the drawing changes; otherwise hold the finished drawing.
        const isNewStep = !previous || previous.layout !== "diagram" || previous.diagram !== row.diagram || previous.diagramStep !== row.diagramStep || previous.questionId !== row.questionId;
        const frames = isNewStep ? DIAGRAM_ANIMATION_FRAMES : 1;
        const animationSeconds = isNewStep ? Math.min(DIAGRAM_ANIMATION_FRAMES * DIAGRAM_FRAME_SECONDS, row.allocatedDuration * 0.6) : 0;
        const frameSeconds = isNewStep ? animationSeconds / DIAGRAM_ANIMATION_FRAMES : 0;
        for (let frame = 1; frame <= frames; frame += 1) {
          const framePath = `${framePrefix}-${String(frame).padStart(2, "0")}.png`;
          await writeFile(framePath, await createDiagramSlide(state, frame / frames));
          const duration = frame === frames ? row.allocatedDuration - animationSeconds + frameSeconds : frameSeconds;
          concatLines.push(`file '${framePath}'`, `duration ${duration.toFixed(6)}`);
          lastFrame = framePath;
        }
      } else if (row.layout === "trick") {
        const previous = timeline.rows[index - 1];
        const state = {
          title: row.effectiveQuestionText.trim() || row.questionId,
          working: row.effectiveWorking,
          arcs: row.arcs ? parsePedagogyArcs(row.arcs, row.effectiveWorking, row.sourceRow) : [],
          step: row.board,
          result: row.effectiveResult,
          previousResult: previous?.layout === "trick" ? previous.effectiveResult : "",
          stepIndex: index,
        };
        const animationSeconds = Math.min(TRICK_ANIMATION_FRAMES * TRICK_FRAME_SECONDS, row.allocatedDuration * 0.6);
        const frameSeconds = animationSeconds / TRICK_ANIMATION_FRAMES;
        for (let frame = 1; frame <= TRICK_ANIMATION_FRAMES; frame += 1) {
          const framePath = `${framePrefix}-${String(frame).padStart(2, "0")}.png`;
          await writeFile(framePath, await createTrickSlide(state, frame / TRICK_ANIMATION_FRAMES));
          const duration = frame === TRICK_ANIMATION_FRAMES ? row.allocatedDuration - animationSeconds + frameSeconds : frameSeconds;
          concatLines.push(`file '${framePath}'`, `duration ${duration.toFixed(6)}`);
          lastFrame = framePath;
        }
      } else {
        const framePath = `${framePrefix}.png`;
        await writeFile(framePath, await createPedagogySlide({ ...boardState(index), maxFontSize: sizeByLayout.get(row.layout) }));
        concatLines.push(`file '${framePath}'`, `duration ${row.allocatedDuration.toFixed(6)}`);
        lastFrame = framePath;
      }
    } catch (error) {
      if (error instanceof PedagogyBriefValidationError) throw error;
      throw new PedagogySlideRenderError(row.sourceRow);
    }
    onProgress?.({ phase: "rendering-slides", completed: index + 1, total: rows.length });
  }
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
  onProgress?.({ phase: "assembling-mp4" });
  await runFfmpeg([
    ...inputs,
    "-filter_complex", `[0:v]fps=24,format=yuv420p,setsar=1[outv];${audioFilters.join(";")};${audioInputs}amix=inputs=${rows.length}:duration=longest:normalize=0,atrim=duration=${totalDuration.toFixed(6)}[outa]`,
    "-map", "[outv]", "-map", "[outa]", "-t", totalDuration.toFixed(6), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "24", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", outputPath,
  ]);
  const qa = await probeFinalVideo(outputPath, { width: 1920, height: 1080, duration: totalDuration });
  if (!qa.passed) throw new Error(`Pedagogy video technical QA failed: ${JSON.stringify(qa)}`);
  return { outputPath, qa: { ...qa, renderSource: "code", narrationDurations, timingAudit: timeline.audit, warningCount: warningMessages.length } };
}

export async function renderPedagogyVideo(rows: PedagogyRow[], options: { pack?: boolean } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "frame-pedagogy-"));
  const outputPath = join(directory, "pedagogy-explainer.mp4");
  const result = await renderPedagogyVideoToFile(rows, { directory, outputPath, pack: options.pack === true });
  return { bytes: new Uint8Array(await readFile(outputPath)), qa: result.qa };
}
