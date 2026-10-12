// Shared, immersive frame for every exam-explainer board (text and visual).
// Deep gradient, soft colour glows, a faint grid and a glass panel. An optional full-bleed
// background image sits under a dark overlay so board text always stays readable.

export const pedagogyTheme = {
  ink: "#f5f7f8",
  muted: "#a9b5cf",
  accent: "#ff5c46",
  line: "#40528a",
  box: "#1b2853",
  blue: "#6ea8ff",
  green: "#3ccf91",
  font: "Arial, sans-serif",
} as const;

function escape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export type PedagogyFrameChrome = {
  questionId: string;
  generatedTimeLabel: string;
  /** data: URI of a background image already sized to 1920×1080, or undefined for the procedural backdrop only. */
  backgroundImage?: string | null;
};

export function pedagogyFrameOpen(state: PedagogyFrameChrome) {
  const { ink, muted, accent, font } = pedagogyTheme;
  const image = state.backgroundImage
    ? `<image href="${state.backgroundImage}" x="0" y="0" width="1920" height="1080" preserveAspectRatio="xMidYMid slice"/>
       <rect width="1920" height="1080" fill="url(#imageShade)"/>`
    : "";
  const watermark = (state.questionId || "").slice(0, 14);
  return `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <defs>
      <linearGradient id="base" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#080e22"/><stop offset="0.55" stop-color="#0f1a3f"/><stop offset="1" stop-color="#1a1840"/></linearGradient>
      <radialGradient id="glowWarm"><stop offset="0" stop-color="${accent}" stop-opacity="0.42"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
      <radialGradient id="glowCool"><stop offset="0" stop-color="#4f7dff" stop-opacity="0.45"/><stop offset="1" stop-color="#4f7dff" stop-opacity="0"/></radialGradient>
      <radialGradient id="glowTeal"><stop offset="0" stop-color="#2ed3b7" stop-opacity="0.18"/><stop offset="1" stop-color="#2ed3b7" stop-opacity="0"/></radialGradient>
      <linearGradient id="imageShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#080e22" stop-opacity="0.7"/><stop offset="1" stop-color="#080e22" stop-opacity="0.9"/></linearGradient>
      <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.085"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.03"/></linearGradient>
      <linearGradient id="topBar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="#6ea8ff"/></linearGradient>
      <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M 64 0 L 0 0 0 64" fill="none" stroke="#ffffff" stroke-opacity="0.045" stroke-width="1"/></pattern>
    </defs>
    <rect width="1920" height="1080" fill="url(#base)"/>
    ${image}
    <ellipse cx="1660" cy="110" rx="760" ry="560" fill="url(#glowWarm)"/>
    <ellipse cx="180" cy="1010" rx="860" ry="620" fill="url(#glowCool)"/>
    <ellipse cx="1020" cy="600" rx="620" ry="420" fill="url(#glowTeal)"/>
    <rect width="1920" height="1080" fill="url(#grid)"/>
    <text x="1840" y="1050" text-anchor="end" font-family="${font}" font-size="230" font-weight="800" fill="#ffffff" fill-opacity="0.035" letter-spacing="-4">${escape(watermark)}</text>
    <rect x="0" y="0" width="1920" height="8" fill="url(#topBar)"/>
    <circle cx="160" cy="97" r="8" fill="${accent}"/>
    <text x="182" y="106" font-family="${font}" font-size="26" font-weight="800" letter-spacing="5" fill="#d3dbea">EXAM EXPLAINER</text>
    <rect x="1636" y="72" width="124" height="46" rx="23" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-opacity="0.16"/>
    <text x="1698" y="104" text-anchor="middle" font-family="${font}" font-size="25" font-weight="800" letter-spacing="2" fill="${accent}">${escape(state.generatedTimeLabel)}</text>
    <rect x="120" y="160" width="1680" height="760" rx="32" fill="url(#panel)" stroke="#ffffff" stroke-opacity="0.15" stroke-width="2"/>
    <rect x="152" y="161" width="1616" height="2" fill="#ffffff" fill-opacity="0.18"/>
    <text x="150" y="1015" font-family="${font}" font-size="23" font-weight="800" letter-spacing="4" fill="${muted}">FRAME / PEDAGOGY BRIEF</text>
    <g fill="${ink}">`;
}

export const pedagogyFrameClose = `</g></svg>`;
