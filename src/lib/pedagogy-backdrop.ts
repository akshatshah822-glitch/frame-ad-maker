/**
 * Immersive backdrop shared by the board, topic, diagram and passage slides:
 * the slide's own base colour, a soft diagonal gradient, warm and cool light glows,
 * a faint chalk grid and a gentle vignette. Drawn in code, so it costs nothing extra
 * and never covers the board: every panel sits on top of it.
 */
export function pedagogyBackdrop(base: string, accent = "#ffd166") {
  return `<defs>
      <linearGradient id="bd-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c2b5c" stop-opacity="0.55"/><stop offset="0.55" stop-color="${base}" stop-opacity="0"/><stop offset="1" stop-color="#2a1d4a" stop-opacity="0.6"/></linearGradient>
      <radialGradient id="bd-warm"><stop offset="0" stop-color="${accent}" stop-opacity="0.3"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
      <radialGradient id="bd-cool"><stop offset="0" stop-color="#4f7dff" stop-opacity="0.42"/><stop offset="1" stop-color="#4f7dff" stop-opacity="0"/></radialGradient>
      <radialGradient id="bd-teal"><stop offset="0" stop-color="#2ed3b7" stop-opacity="0.16"/><stop offset="1" stop-color="#2ed3b7" stop-opacity="0"/></radialGradient>
      <radialGradient id="bd-vignette" cx="0.5" cy="0.5" r="0.75"><stop offset="0.6" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.45"/></radialGradient>
      <pattern id="bd-grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M 60 0 L 0 0 0 60" fill="none" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1"/></pattern>
    </defs>
    <rect width="1920" height="1080" fill="${base}"/>
    <rect width="1920" height="1080" fill="url(#bd-sheen)"/>
    <ellipse cx="1700" cy="80" rx="720" ry="520" fill="url(#bd-warm)"/>
    <ellipse cx="160" cy="1040" rx="820" ry="600" fill="url(#bd-cool)"/>
    <ellipse cx="980" cy="560" rx="640" ry="420" fill="url(#bd-teal)"/>
    <rect width="1920" height="1080" fill="url(#bd-grid)"/>
    <rect width="1920" height="1080" fill="url(#bd-vignette)"/>`;
}
