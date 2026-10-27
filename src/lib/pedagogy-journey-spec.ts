// Earth journey (gs_theme = journey): one continuous 3D Earth for a whole video. The camera flies between rows,
// labels are pinned to latitude/longitude and simple effects (glows, arcs, sinking air) mark what the educator
// is talking about. This file only parses and checks the sheet columns; pedagogy-journey.ts draws the frames.

export class JourneyParseError extends Error {}

export type JourneyColour = "yellow" | "red" | "blue" | "orange" | "grey" | "green" | "white";
export const JOURNEY_COLOURS: Record<JourneyColour, string> = { yellow: "#ffd166", red: "#ff6b6b", blue: "#5fb3ff", orange: "#ffb070", grey: "#8a96ad", green: "#7bd389", white: "#e8eef9" };

export type JourneyCamera = { lat: number; lon: number; distance: number; tilt: number };
export type JourneyPin = { lat: number; lon: number; text: string; colour: JourneyColour };
export type JourneyEffect =
  | { kind: "glow"; lat: number; lon: number; colour: JourneyColour; width: number; height: number }
  | { kind: "arc" | "path"; from: [number, number]; to: [number, number]; colour: JourneyColour }
  | { kind: "band"; from: number; to: number }
  | { kind: "equator" }
  | { kind: "sink" | "ring"; lat: number; lon: number };

export type JourneySpec = {
  camera: JourneyCamera;
  pins: JourneyPin[];
  /** Lines with no coordinates ("board: …", "cards: …"), shown on a note card. */
  cardLines: string[];
  effects: JourneyEffect[];
  caption: string;
  sourceTs: string;
  badge: string;
  chapter: string;
  /** Notes panel: this topic's key points so far (newest last) and its heading. Empty = no panel. */
  notes: string[];
  notesTitle: string;
};

export const JOURNEY_MAX_NOTES = 6;

/** The view used before the first row names a camera: the whole Earth, Asia and the Pacific. */
export const JOURNEY_DEFAULT_CAMERA: JourneyCamera = { lat: 25, lon: 130, distance: 12.5, tilt: 0 };

const number = (text: string, what: string, min: number, max: number) => {
  const value = Number(text.trim());
  if (!text.trim() || !Number.isFinite(value) || value < min || value > max) throw new JourneyParseError(`${what} must be a number from ${min} to ${max} (got ${JSON.stringify(text.trim())}).`);
  return value;
};
const lonOf = (text: string) => { const lon = number(text, "longitude", -360, 360); return ((((lon + 180) % 360) + 360) % 360) - 180; };
const point = (text: string): [number, number] => {
  const parts = text.split(",");
  if (parts.length !== 2) throw new JourneyParseError(`a place must be "lat, lon" (got ${JSON.stringify(text.trim())}).`);
  return [number(parts[0], "latitude", -90, 90), lonOf(parts[1])];
};
const colourOf = (text: string | undefined, fallback: JourneyColour): JourneyColour => {
  const name = (text ?? "").trim().toLowerCase();
  if (!name) return fallback;
  if (!(name in JOURNEY_COLOURS)) throw new JourneyParseError(`colour ${JSON.stringify(name)} is not one of ${Object.keys(JOURNEY_COLOURS).join(", ")}.`);
  return name as JourneyColour;
};

/** "lat, lon, distance, tilt": distance from the surface in Earth radii × 4, tilt 0 (straight down) to 1.5 (low, looking north). */
export function parseJourneyCamera(text: string): JourneyCamera {
  const parts = text.split(",");
  if (parts.length !== 4) throw new JourneyParseError(`camera must be "lat, lon, distance, tilt" (got ${JSON.stringify(text.trim())}).`);
  return { lat: number(parts[0], "camera latitude", -85, 85), lon: lonOf(parts[1]), distance: number(parts[2], "camera distance", 2, 40), tilt: number(parts[3], "camera tilt", 0, 1.5) };
}

/** "lat, lon = text = colour | …"; an item without coordinates ("board: …") becomes a note-card line. */
export function parseJourneyLabels(text: string) {
  const pins: JourneyPin[] = [];
  const cardLines: string[] = [];
  for (const item of text.split("|").map((part) => part.trim()).filter(Boolean)) {
    if (!/^-?\d/.test(item)) { cardLines.push(item); continue; }
    const [where, label, colour, ...extra] = item.split("=").map((part) => part.trim());
    if (extra.length || !label) throw new JourneyParseError(`label ${JSON.stringify(item)} must be "lat, lon = text = colour".`);
    const [lat, lon] = point(where);
    pins.push({ lat, lon, text: label, colour: colourOf(colour, "yellow") });
  }
  if (pins.length > 8) throw new JourneyParseError(`anchored_labels takes at most 8 pinned labels; this row has ${pins.length}.`);
  return { pins, cardLines };
}

/** Effects, separated by "|": glow lat,lon colour [width height] · arc lat,lon > lat,lon [colour] · path lat,lon > lat,lon [colour]
 * · band lat1,lat2 · equator · sink lat,lon · ring lat,lon. */
export function parseJourneyEffects(text: string): JourneyEffect[] {
  const effects: JourneyEffect[] = [];
  for (const item of text.split("|").map((part) => part.trim()).filter(Boolean)) {
    const [kind, ...restWords] = item.split(/\s+/);
    const rest = restWords.join(" ");
    const name = kind.toLowerCase();
    if (name === "equator") effects.push({ kind: "equator" });
    else if (name === "glow") {
      const match = /^(-?[\d.]+\s*,\s*-?[\d.]+)\s+([a-z]+)(?:\s+([\d.]+)\s+([\d.]+))?$/i.exec(rest);
      if (!match) throw new JourneyParseError(`glow must be "glow lat,lon colour [width height]" (got ${JSON.stringify(item)}).`);
      const [lat, lon] = point(match[1]);
      effects.push({ kind: "glow", lat, lon, colour: colourOf(match[2], "red"), width: match[3] ? number(match[3], "glow width", 0.2, 8) : 3, height: match[4] ? number(match[4], "glow height", 0.2, 8) : 1.4 });
    } else if (name === "arc" || name === "path") {
      const match = /^(.+?)\s*>\s*(-?[\d.]+\s*,\s*-?[\d.]+)\s*([a-z]*)$/i.exec(rest);
      if (!match) throw new JourneyParseError(`${name} must be "${name} lat,lon > lat,lon [colour]" (got ${JSON.stringify(item)}).`);
      effects.push({ kind: name, from: point(match[1]), to: point(match[2]), colour: colourOf(match[3], "yellow") });
    } else if (name === "band") {
      const [from, to] = point(rest);
      if (from >= to) throw new JourneyParseError(`band needs the lower latitude first (got ${JSON.stringify(item)}).`);
      effects.push({ kind: "band", from, to });
    } else if (name === "sink" || name === "ring") {
      const [lat, lon] = point(rest);
      effects.push({ kind: name, lat, lon });
    } else throw new JourneyParseError(`effect ${JSON.stringify(kind)} is not one of glow, arc, path, band, equator, sink, ring.`);
  }
  return effects;
}

/** The sheet-wide generation type. "cinematic" is a saved prototype that FRAME does not draw yet. */
export function parseGsTheme(text: string): "" | "journey" | "cinematic" {
  const value = text.trim().toLowerCase();
  if (value === "" || value === "journey" || value === "cinematic") return value;
  throw new JourneyParseError('gs_theme must be "journey", "cinematic", or blank.');
}

const place = (lat: number, lon: number) => `${lat}, ${lon}`;
function effectText(effect: JourneyEffect) {
  switch (effect.kind) {
    case "glow": return `glow ${effect.lat},${effect.lon} ${effect.colour} ${effect.width} ${effect.height}`;
    case "arc": case "path": return `${effect.kind} ${effect.from.join(",")} > ${effect.to.join(",")} ${effect.colour}`;
    case "band": return `band ${effect.from},${effect.to}`;
    case "equator": return "equator";
    case "sink": case "ring": return `${effect.kind} ${effect.lat},${effect.lon}`;
  }
}
/** A reviewed row's journey spec written back as sheet columns, so the render sees exactly what the review checked. */
export function journeyToColumns(spec: JourneySpec) {
  return {
    camera: `${spec.camera.lat}, ${spec.camera.lon}, ${spec.camera.distance}, ${spec.camera.tilt}`,
    anchoredLabels: [...spec.pins.map((pin) => `${place(pin.lat, pin.lon)} = ${pin.text} = ${pin.colour}`), ...spec.cardLines].join(" | "),
    effects: spec.effects.map(effectText).join(" | "),
    caption: spec.caption,
    sourceTs: spec.sourceTs,
    badge: spec.badge,
    chapter: spec.chapter,
    notes: spec.notes.join(" | "),
    notesTitle: spec.notesTitle,
  };
}
