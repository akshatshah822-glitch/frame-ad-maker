import sharp from "sharp";
import type { PedagogyArc } from "@/lib/pedagogy-brief";

/**
 * "Trick" layout: a dark board with the working row (digits), arcs that draw on
 * between digits, a step box, and a result line that fills in. Each row is
 * rendered as a short build-in animation (TRICK_ANIMATION_FRAMES frames) and then held.
 */
export const TRICK_ANIMATION_FRAMES = 12;
export const TRICK_FRAME_SECONDS = 1 / 20;

export type TrickSlideState = {
  title: string;
  working: string;
  arcs: PedagogyArc[];
  step: string;
  result: string;
  previousResult: string;
  /** Position of this step, used to pick the accent colour. */
  stepIndex: number;
};

const ACCENTS = ["#4fd1e8", "#9bd67a", "#f59a52", "#b9a3f5", "#f2d58a", "#ff7a8a"];
const SERIF = "Georgia, 'Times New Roman', serif";
const WORKING_Y = 400;
const WORKING_SIZE = 108;
const CHAR_STEP = 84;
const SPACE_STEP = 64;

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

/** x centre of every non-space working character, plus its group (space-separated) index. */
export function workingLayout(working: string) {
  const characters: { character: string; x: number; group: number }[] = [];
  let x = 0;
  let group = 0;
  let previousWasSpace = false;
  for (const character of [...working.trim()]) {
    if (/\s/.test(character)) {
      if (!previousWasSpace) { x += SPACE_STEP; group += 1; }
      previousWasSpace = true;
      continue;
    }
    previousWasSpace = false;
    characters.push({ character, x: x + CHAR_STEP / 2, group });
    x += CHAR_STEP;
  }
  const offset = (1920 - x) / 2;
  return characters.map((entry) => ({ ...entry, x: entry.x + offset }));
}

function groupColour(character: string, group: number) {
  if (!/[0-9a-zA-Z.]/.test(character)) return "#f5f7f8";
  return group === 0 ? "#4fd1e8" : "#f2d58a";
}

function arcSvg(arc: PedagogyArc, layout: ReturnType<typeof workingLayout>, colour: string, progress: number) {
  const start = layout[arc.from];
  const end = layout[arc.to];
  const distance = Math.abs(end.x - start.x);
  const lift = 50 + distance * 0.22;
  const y = arc.below ? WORKING_Y + 34 : WORKING_Y - WORKING_SIZE * 0.82;
  const controlY = arc.below ? y + lift : y - lift;
  const controlX = (start.x + end.x) / 2;
  const curveLength = Math.hypot(distance, lift) * 1.25 + 1;
  const dash = curveLength * (1 - clamp(progress));
  const angle = Math.atan2(y - controlY, end.x - controlX);
  const headSize = 20;
  const head = [
    [end.x, y],
    [end.x - headSize * Math.cos(angle - 0.45), y - headSize * Math.sin(angle - 0.45)],
    [end.x - headSize * Math.cos(angle + 0.45), y - headSize * Math.sin(angle + 0.45)],
  ].map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const headOpacity = clamp((progress - 0.85) / 0.15);
  return `<path d="M ${start.x.toFixed(1)} ${y.toFixed(1)} Q ${controlX.toFixed(1)} ${controlY.toFixed(1)} ${end.x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${colour}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${curveLength.toFixed(1)}" stroke-dashoffset="${dash.toFixed(1)}"/>`
    + `<polygon points="${head}" fill="${colour}" opacity="${headOpacity.toFixed(2)}"/>`;
}

/** progress: 0 = start of this step's build-in animation, 1 = fully drawn. */
export function createTrickSlideSvg(state: TrickSlideState, progress = 1) {
  const accent = ACCENTS[state.stepIndex % ACCENTS.length];
  const layout = workingLayout(state.working);
  const arcProgress = clamp(progress / 0.7);
  const textOpacity = clamp((progress - 0.15) / 0.5);
  const resultProgress = clamp((progress - 0.45) / 0.55);

  const working = layout.map(({ character, x, group }) => `<text x="${x.toFixed(1)}" y="${WORKING_Y}" text-anchor="middle" font-family="${SERIF}" font-size="${WORKING_SIZE}" fill="${groupColour(character, group)}">${escapeXml(character)}</text>`).join("");
  const arcs = state.arcs.filter((arc) => layout[arc.from] && layout[arc.to]).map((arc) => arcSvg(arc, layout, accent, arcProgress)).join("");

  const stepLines = state.step.split("\n").map((line) => line.trim()).filter(Boolean);
  const stepLineHeight = 62;
  const boxTop = 520;
  const boxHeight = Math.max(110, 50 + stepLines.length * stepLineHeight);
  const stepText = stepLines.map((line, index) => `<text x="960" y="${boxTop + 25 + (index + 1) * stepLineHeight - 14}" text-anchor="middle" font-family="${SERIF}" font-size="46" fill="${accent}" opacity="${textOpacity.toFixed(2)}">${escapeXml(line)}</text>`).join("");
  const box = stepLines.length ? `<rect x="300" y="${boxTop}" width="1320" height="${boxHeight}" rx="18" fill="#0d1622" stroke="#3f6f9e" stroke-width="3"/>${stepText}` : "";

  const done = state.result.includes("✓");
  const resultCharacters = [...state.result.trim()];
  const previousCharacters = [...state.previousResult.trim()];
  const resultY = boxTop + boxHeight + 150;
  const resultStartX = 820;
  const advance = (character: string) => character === " " ? 34 : character === "." ? 30 : 60;
  let cursor = resultStartX;
  const result = resultCharacters.map((character, index) => {
    const x = cursor + advance(character) / 2;
    cursor += advance(character);
    if (character === " ") return "";
    const isNew = previousCharacters[index] !== character;
    const opacity = isNew ? resultProgress : 1;
    const lift = isNew ? (1 - resultProgress) * 24 : 0;
    const colour = character === "✓" ? "#7fe08a" : isNew && progress < 1 ? accent : "#f5f7f8";
    return `<text x="${x.toFixed(1)}" y="${(resultY + lift).toFixed(1)}" text-anchor="middle" font-family="${SERIF}" font-size="84" fill="${colour}" opacity="${opacity.toFixed(2)}">${escapeXml(character)}</text>`;
  }).join("");
  const wasDone = state.previousResult.includes("✓");
  const resultBox = done ? `<rect x="520" y="${resultY - 92}" width="${cursor - 520 + 30}" height="128" rx="16" fill="none" stroke="#7fe08a" stroke-width="4" opacity="${(wasDone ? 1 : resultProgress).toFixed(2)}"/>` : "";
  const resultBlock = resultCharacters.length ? `${resultBox}<text x="720" y="${resultY}" text-anchor="end" font-family="${SERIF}" font-size="52" fill="#c9ced8">Result :</text><text x="770" y="${resultY}" text-anchor="middle" font-family="${SERIF}" font-size="72" fill="#c9ced8">=</text>${result}` : "";

  return `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
    <rect width="1920" height="1080" fill="#050608"/>
    <text x="960" y="110" text-anchor="middle" font-family="${SERIF}" font-size="50" fill="#e8c872">${escapeXml(state.title)}</text>
    ${arcs}
    ${working}
    ${box}
    ${resultBlock}
  </svg>`;
}

export async function createTrickSlide(state: TrickSlideState, progress = 1) {
  return sharp(Buffer.from(createTrickSlideSvg(state, progress))).png().toBuffer();
}
