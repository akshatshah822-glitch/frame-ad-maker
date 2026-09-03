import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { generateNarrationTrack } from "@/lib/voice";
import { probeFinalVideo } from "@/lib/video-qa";
import { createQuestionSlide, type QuestionSlideState } from "@/lib/question-slide";
import type { StoredQuestionGeneration } from "@/lib/question-generation-data";

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
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Question narration has no readable duration.");
  return duration;
}

export async function renderQuestionVideo(generation: StoredQuestionGeneration) {
  const directory = await mkdtemp(join(tmpdir(), "frame-question-"));
  const narrationPath = join(directory, "narration.mp3");
  const outputPath = join(directory, "question.mp4");
  await writeFile(narrationPath, await generateNarrationTrack(generation.script));
  const narrationDuration = await probeDuration(narrationPath);
  const totalDuration = Math.max(60, Math.ceil(10 + narrationDuration + 2));
  if (totalDuration > 90) throw new Error(`Invalid script: narration makes the question video ${totalDuration} seconds; maximum is 90 seconds.`);

  const timeline: Array<{ duration: number; state: QuestionSlideState }> = [];
  for (let countdown = 10; countdown >= 1; countdown -= 1) timeline.push({ duration: 1, state: { countdown } });
  const phases: QuestionSlideState[] = [
    { highlight: generation.solve.commonWrong },
    { highlight: generation.solve.commonWrong },
  ];
  const struck = [] as typeof generation.solve.eliminations[number]["option"][];
  for (const elimination of generation.solve.eliminations) {
    struck.push(elimination.option);
    phases.push({ highlight: elimination.option, struck: [...struck] });
  }
  phases.push({ struck: [...struck], highlight: generation.solve.correct, checked: generation.solve.correct });
  const phaseDuration = narrationDuration / phases.length;
  phases.forEach((state) => timeline.push({ duration: phaseDuration, state }));
  const used = timeline.reduce((total, item) => total + item.duration, 0);
  const answerState = phases.at(-1);
  if (!answerState) throw new Error("Question video has no answer state.");
  timeline.push({ duration: Math.max(0.1, totalDuration - used), state: answerState });

  const concatLines: string[] = [];
  for (let index = 0; index < timeline.length; index += 1) {
    const framePath = join(directory, `frame-${String(index).padStart(2, "0")}.png`);
    await writeFile(framePath, await createQuestionSlide(generation.solve, timeline[index].state));
    concatLines.push(`file '${framePath}'`, `duration ${timeline[index].duration.toFixed(6)}`);
  }
  const lastFrame = join(directory, `frame-${String(timeline.length - 1).padStart(2, "0")}.png`);
  concatLines.push(`file '${lastFrame}'`);
  const concatPath = join(directory, "timeline.txt");
  await writeFile(concatPath, concatLines.join("\n"));
  await runFfmpeg([
    "-f", "concat", "-safe", "0", "-i", concatPath,
    "-i", narrationPath,
    "-filter_complex", `[0:v]fps=24,format=yuv420p,setsar=1[outv];[1:a]adelay=10000|10000,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur=${totalDuration},atrim=duration=${totalDuration}[outa]`,
    "-map", "[outv]", "-map", "[outa]", "-t", String(totalDuration), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "24", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", outputPath,
  ]);
  const qa = await probeFinalVideo(outputPath, { width: 1920, height: 1080, duration: totalDuration });
  if (!qa.passed) throw new Error(`Question video technical QA failed: ${JSON.stringify(qa)}`);
  return { bytes: new Uint8Array(await readFile(outputPath)), qa: { ...qa, countdownSeconds: 10, narrationStartsAt: 10, narrationDuration, renderSource: "code" } };
}
