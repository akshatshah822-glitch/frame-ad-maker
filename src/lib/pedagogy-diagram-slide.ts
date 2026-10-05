import sharp from "sharp";

/**
 * "Diagram" layout: a board diagram that builds step by step while the teacher explains,
 * with the row's board text in a notes card beside it. Diagrams are drawn by code
 * (exact labels, no image cost). Each brief row names a diagram and the step it has reached;
 * the newest step fades in over DIAGRAM_ANIMATION_FRAMES frames, earlier steps stay drawn.
 */
export const DIAGRAM_ANIMATION_FRAMES = 12;
export const DIAGRAM_FRAME_SECONDS = 1 / 20;

type DiagramElement = { step: number; svg: string };
type DiagramDefinition = { steps: number; elements: DiagramElement[] };

const SANS = "Georgia, 'Times New Roman', serif";
const LABEL = "Arial, sans-serif";
const BOARD = { x: 60, y: 120, width: 1180, height: 920 };
const NOTES = { x: 1280, y: 120, width: 580, height: 920, padding: 40 };
const WATER = "#4fa3ff";
const WATER_TEXT = "#8cc4ff";
const MISSING = "#ff6b5a";
const FIELD = "#7fe08a";

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

const label = (x: number, y: number, text: string, colour = WATER_TEXT, size = 30, anchor = "middle") =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${SANS}" font-size="${size}" fill="${colour}">${escapeXml(text)}</text>`;
const box = (x: number, y: number, width: number, height: number, text: string, fill: string, stroke: string, colour: string, size = 24) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/>${label(x + width / 2, y + height / 2 + size * 0.35, text, colour, size)}`;
const river = (x: number) => `<path d="M${x} 210 C ${x - 30} 360, ${x + 40} 520, ${x - 10} 680 S ${x + 10} 900, ${x} 960" stroke="${WATER}" stroke-width="34" fill="none" stroke-linecap="round"/>${label(x, 1005, "नदी")}`;

/** Canal network (river -> main canal -> branch canals -> villages -> missing last mile -> IPC vs IPU). */
function canalNetwork(): DiagramDefinition {
  const villages = [250, 410, 570, 730];
  const elements: DiagramElement[] = [
    { step: 1, svg: river(150) },
    { step: 1, svg: `<line x1="168" y1="490" x2="560" y2="490" stroke="${WATER}" stroke-width="20" stroke-linecap="round"/>${label(360, 462, "बड़ी नहर")}` },
    { step: 2, svg: label(660, 205, "छोटी नहरें") },
    ...villages.map((y) => ({ step: 2, svg: `<path d="M560 490 L 560 ${y} L 760 ${y}" stroke="${WATER}" stroke-width="10" fill="none"/>${box(760, y - 32, 110, 64, "गाँव", "#22304f", WATER_TEXT, "#eef1f7")}` })),
    ...villages.map((y) => ({ step: 3, svg: `<line x1="870" y1="${y}" x2="1010" y2="${y}" stroke="${MISSING}" stroke-width="5" stroke-dasharray="12 10"/>${box(1010, y - 28, 84, 56, "खेत", "#2f4a2a", FIELD, "#cfeec9", 22)}${label(940, y - 14, "✗", MISSING, 34)}` })),
    { step: 3, svg: label(940, 830, "Last mile नहीं बनी", MISSING, 28) },
    { step: 4, svg: `${label(250, 915, "IPC: बनाई गई क्षमता", WATER_TEXT, 26, "start")}<rect x="560" y="890" width="560" height="36" rx="8" fill="${WATER}"/>${label(250, 985, "IPU: असल उपयोग", "#cfeec9", 26, "start")}<rect x="560" y="960" width="200" height="36" rx="8" fill="${FIELD}"/>` },
  ];
  return { steps: 4, elements };
}

/** Three ways water reaches a farm: rain from above, groundwater from below, canal from the side. */
function threeSources(): DiagramDefinition {
  const farm = `<rect x="560" y="470" width="300" height="150" rx="12" fill="#2f4a2a" stroke="${FIELD}" stroke-width="3"/>${[600, 660, 720, 780, 820].map((x) => `<line x1="${x}" y1="600" x2="${x}" y2="520" stroke="${FIELD}" stroke-width="4"/>`).join("")}${label(880, 555, "खेत", "#cfeec9", 30, "start")}`;
  const cloud = `<ellipse cx="710" cy="220" rx="150" ry="55" fill="#33415c"/><ellipse cx="640" cy="200" rx="70" ry="50" fill="#33415c"/><ellipse cx="780" cy="195" rx="80" ry="55" fill="#33415c"/>${[630, 690, 750, 810].map((x) => `<line x1="${x}" y1="290" x2="${x - 15}" y2="430" stroke="${WATER}" stroke-width="5" stroke-dasharray="18 14"/>`).join("")}${label(1215, 230, "1. ऊपर से: बारिश", WATER_TEXT, 30, "end")}`;
  const ground = `<rect x="200" y="700" width="1000" height="90" fill="#4a3a2a"/><rect x="200" y="840" width="1000" height="80" rx="8" fill="#1f4f7a"/>${label(1180, 895, "भूजल", WATER_TEXT, 28, "end")}<line x1="710" y1="620" x2="710" y2="860" stroke="#c9ced8" stroke-width="10"/><path d="M690 700 L710 660 L730 700" fill="#c9ced8"/>${label(1185, 760, "2. नीचे से: ट्यूबवेल", WATER_TEXT, 30, "end")}`;
  const canal = `${river(150)}<line x1="170" y1="545" x2="560" y2="545" stroke="${WATER}" stroke-width="18" stroke-linecap="round"/>${label(360, 515, "3. बगल से: नहर")}`;
  return { steps: 3, elements: [{ step: 1, svg: farm }, { step: 1, svg: cloud }, { step: 2, svg: ground }, { step: 3, svg: canal }] };
}


const arrow = (x1: number, y1: number, x2: number, y2: number, colour: string, width = 5) => {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = [[x2, y2], [x2 - 18 * Math.cos(angle - 0.5), y2 - 18 * Math.sin(angle - 0.5)], [x2 - 18 * Math.cos(angle + 0.5), y2 - 18 * Math.sin(angle + 0.5)]].map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colour}" stroke-width="${width}" stroke-linecap="round"/><polygon points="${head}" fill="${colour}"/>`;
};

/** Gaining river (groundwater seeps up into the river), then losing river (river seeps down), then: one water. */
function gainingLosingRiver(): DiagramDefinition {
  // One cross-section per half of the board: ground, water table, river channel.
  const section = (x: number, waterTableY: number, title: string) =>
    `<rect x="${x}" y="420" width="500" height="460" fill="#4a3a2a"/>` +
    `<rect x="${x}" y="${waterTableY}" width="500" height="${880 - waterTableY}" fill="#1f4f7a"/>` +
    `<line x1="${x}" y1="${waterTableY}" x2="${x + 500}" y2="${waterTableY}" stroke="${WATER_TEXT}" stroke-width="3" stroke-dasharray="14 10"/>` +
    `<path d="M${x + 170} 420 Q ${x + 250} 540 ${x + 330} 420 Z" fill="${WATER}"/>` +
    label(x + 250, 400, "नदी") + label(x + 470, waterTableY + 40, "भूजल", WATER_TEXT, 26, "end") + label(x + 250, 260, title, "#eef1f7", 32);
  const gaining = section(110, 470, "1. Gaining river") + arrow(260, 640, 300, 500, FIELD) + arrow(400, 640, 360, 500, FIELD) + label(360, 320, "भूजल → नदी", FIELD, 30);
  const losing = section(650, 760, "2. Losing river") + arrow(860, 470, 820, 690, MISSING) + arrow(940, 470, 980, 690, MISSING) + label(900, 320, "नदी → भूजल", MISSING, 30);
  const oneWater = `<rect x="110" y="920" width="1040" height="70" rx="14" fill="#16213d" stroke="#ffd166" stroke-width="3"/>${label(630, 967, "नदी + भूजल = एक ही पानी", "#ffd166", 32)}`;
  return { steps: 3, elements: [{ step: 1, svg: gaining }, { step: 2, svg: losing }, { step: 3, svg: oneWater }] };
}

/** Canal missing -> tubewell -> power subsidy -> over-extraction -> water table falls (and the loop back). */
function subsidyCycle(): DiagramDefinition {
  const node = (x: number, y: number, text: string, stroke: string) => box(x, y, 380, 90, text, "#22304f", stroke, "#eef1f7", 30);
  return {
    steps: 4,
    elements: [
      { step: 1, svg: node(160, 200, "नहर नहीं बनी ✗", MISSING) },
      { step: 2, svg: arrow(540, 245, 720, 245, WATER_TEXT) + node(730, 200, "ट्यूबवेल (बिजली चाहिए)", WATER_TEXT) },
      { step: 3, svg: arrow(920, 300, 920, 470, WATER_TEXT) + node(730, 480, "बिजली सब्सिडी", "#ffd166") },
      { step: 4, svg: arrow(720, 525, 540, 525, WATER_TEXT) + node(160, 480, "बेहिसाब पानी खींचना", MISSING) + arrow(350, 580, 350, 750, MISSING) + node(160, 760, "जल स्तर हर साल नीचे", MISSING) + `<path d="M540 805 L 1170 805 L 1170 245 L 1125 245" stroke="${MISSING}" stroke-width="4" fill="none" stroke-dasharray="12 10"/>` + label(600, 930, "और गहरा ट्यूबवेल → चक्र चलता रहता है", MISSING, 28, "start") },
    ],
  };
}

const DIAGRAMS: Record<string, DiagramDefinition> = {
  "canal-network": canalNetwork(),
  "three-sources": threeSources(),
  "gaining-losing-river": gainingLosingRiver(),
  "subsidy-cycle": subsidyCycle(),
};

export const diagramNames = Object.keys(DIAGRAMS);

/** English labels for every Hindi label drawn in the diagrams (longest phrases first, so parts are not replaced early). */
const ENGLISH_LABELS: [string, string][] = ([
  ["और गहरा ट्यूबवेल → चक्र चलता रहता है", "Deeper tubewell → the cycle repeats"],
  ["नदी + भूजल = एक ही पानी", "River + groundwater = one water"],
  ["ट्यूबवेल (बिजली चाहिए)", "Tubewell (needs power)"],
  ["जल स्तर हर साल नीचे", "Water table falls every year"],
  ["बेहिसाब पानी खींचना", "Unchecked pumping"],
  ["2. नीचे से: ट्यूबवेल", "2. From below: tubewell"],
  ["IPC: बनाई गई क्षमता", "IPC: capacity created"],
  ["Last mile नहीं बनी", "Last mile not built"],
  ["1. ऊपर से: बारिश", "1. From above: rainfall"],
  ["3. बगल से: नहर", "3. From the side: canal"],
  ["नहर नहीं बनी ✗", "Canal not built ✗"],
  ["IPU: असल उपयोग", "IPU: actually used"],
  ["बिजली सब्सिडी", "Power subsidy"],
  ["भूजल → नदी", "Groundwater → river"],
  ["नदी → भूजल", "River → groundwater"],
  ["छोटी नहरें", "Distributaries"],
  ["बड़ी नहर", "Main canal"],
  ["भूजल", "Groundwater"],
  ["गाँव", "Village"],
  ["खेत", "Farm"],
  ["नदी", "River"],
] as [string, string][]).toSorted((a, b) => b[0].length - a[0].length);

export type DiagramLabelLanguage = "hi" | "en";

function localise(svg: string, language: DiagramLabelLanguage) {
  if (language === "hi") return svg;
  return ENGLISH_LABELS.reduce((text, [hindi, english]) => text.replaceAll(`>${hindi}<`, `>${english}<`), svg);
}

/** Number of steps in a diagram, or 0 when FRAME does not know the name. */
export function diagramStepCount(name: string) {
  return DIAGRAMS[name]?.steps ?? 0;
}

export type DiagramSlideState = {
  diagram: string;
  step: number;
  board: string;
  emphasis: string;
  title: string;
  timeLabel: string;
  /** Language of the words drawn inside the diagram; Hindi when not given. */
  labels?: DiagramLabelLanguage;
  /** Upper limit for the notes text size; the renderer sets one value per video. */
  maxFontSize?: number;
};

const widthCache = new Map<string, Promise<number>>();
async function textWidth(text: string, size: number) {
  const key = `${size}|${text}`;
  let width = widthCache.get(key);
  if (!width) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(text.length * size * 1.2 + 40)}" height="${Math.ceil(size * 2)}"><text x="10" y="${Math.round(size * 1.4)}" font-family="${SANS}" font-size="${size}" fill="#000">${escapeXml(text)}</text></svg>`;
    width = sharp(Buffer.from(svg)).trim().png().toBuffer({ resolveWithObject: true }).then(({ info }) => info.width).catch(() => text.length * size * 0.5);
    widthCache.set(key, width);
  }
  return width;
}

async function wrapNotes(board: string, cap: number) {
  const maxWidth = NOTES.width - NOTES.padding * 2;
  const maxHeight = NOTES.height - 120;
  for (let size = Math.min(40, cap); size >= 22; size -= 2) {
    const lines: string[] = [];
    for (const raw of board.split("\n")) {
      let current = "";
      for (const token of raw.split(/\s+/).filter(Boolean)) {
        const next = current ? `${current} ${token}` : token;
        if (current && await textWidth(next, size) > maxWidth) { lines.push(current); current = token; } else current = next;
      }
      lines.push(current);
    }
    const lineHeight = Math.round(size * 1.6);
    if (lines.length * lineHeight <= maxHeight) return { lines, size, lineHeight };
  }
  throw new Error("Diagram notes do not fit at the minimum readable size.");
}

/** The notes text size this slide would use on its own. */
export async function diagramSlideFontSize(state: DiagramSlideState) {
  return (await wrapNotes(state.board, state.maxFontSize ?? 40)).size;
}

/** progress: 0 = the newest step is invisible, 1 = fully drawn. */
export async function createDiagramSlideSvg(state: DiagramSlideState, progress = 1) {
  const definition = DIAGRAMS[state.diagram];
  if (!definition) throw new Error(`Unknown diagram "${state.diagram}".`);
  const opacity = Math.min(1, Math.max(0, progress));
  const drawn = definition.elements
    .filter((element) => element.step <= state.step)
    .map((element) => {
      const svg = localise(element.svg, state.labels ?? "hi");
      return element.step === state.step ? `<g opacity="${opacity.toFixed(2)}">${svg}</g>` : svg;
    })
    .join("");
  const notes = await wrapNotes(state.board, state.maxFontSize ?? 40);
  const emphasis = state.emphasis.trim();
  const noteText = notes.lines.map((line, index) => {
    const colour = emphasis && line.includes(emphasis) ? "#ffd166" : line.includes("✗") ? "#ff8a7a" : "#eef1f7";
    return `<text x="${NOTES.x + NOTES.padding}" y="${NOTES.y + 130 + index * notes.lineHeight}" font-family="${SANS}" font-size="${notes.size}" fill="${colour}">${escapeXml(line)}</text>`;
  }).join("");
  return `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
    <rect width="1920" height="1080" fill="#101a30"/><rect width="1920" height="10" fill="${MISSING}"/>
    <text x="80" y="80" font-family="${SANS}" font-size="34" fill="#ffd166">${escapeXml(state.title)}</text>
    <text x="1840" y="80" text-anchor="end" font-family="${LABEL}" font-size="24" font-weight="800" fill="${MISSING}">${escapeXml(state.timeLabel)}</text>
    <rect x="${BOARD.x}" y="${BOARD.y}" width="${BOARD.width}" height="${BOARD.height}" rx="22" fill="#16213d" stroke="#33415c" stroke-width="2"/>
    ${drawn}
    <rect x="${NOTES.x}" y="${NOTES.y}" width="${NOTES.width}" height="${NOTES.height}" rx="22" fill="#16213d" stroke="${MISSING}" stroke-width="3"/>
    <text x="${NOTES.x + NOTES.padding}" y="${NOTES.y + 60}" font-family="${LABEL}" font-size="22" font-weight="800" letter-spacing="4" fill="${MISSING}">NOTES</text>
    ${noteText}
  </svg>`;
}

export async function createDiagramSlide(state: DiagramSlideState, progress = 1) {
  return sharp(Buffer.from(await createDiagramSlideSvg(state, progress))).png().toBuffer();
}
