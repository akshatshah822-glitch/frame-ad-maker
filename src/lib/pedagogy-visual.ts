// Optional visual boards for the exam-question (pedagogy) path only.
// A row with no `visual` column, or `visual` = "text", keeps the original text board unchanged.

export const pedagogyVisualKinds = ["text", "flowchart", "cards", "bar", "line", "waterfall", "counter", "logo"] as const;
export type PedagogyVisualKind = typeof pedagogyVisualKinds[number];

export type PedagogyNumber = { prefix: string; value: number; suffix: string; decimals: number };
export type PedagogyDataPoint = { label: string; amount: PedagogyNumber };
export type PedagogyCard = { title: string; body: string };

export type PedagogyVisual =
  | { kind: "text" }
  | { kind: "flowchart"; steps: string[] }
  | { kind: "cards"; cards: PedagogyCard[] }
  | { kind: "bar" | "line" | "waterfall"; points: PedagogyDataPoint[] }
  | { kind: "counter"; amount: PedagogyNumber }
  | { kind: "logo"; names: string[] };

export class PedagogyVisualParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PedagogyVisualParseError";
  }
}

const fail = (message: string): never => { throw new PedagogyVisualParseError(message); };

function text(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "");
}

export function normalizePedagogyVisualKind(value: unknown): PedagogyVisualKind {
  const kind = text(value).trim().toLowerCase();
  if (!kind) return "text";
  if ((pedagogyVisualKinds as readonly string[]).includes(kind)) return kind as PedagogyVisualKind;
  return fail(`visual ${JSON.stringify(kind)} must be one of: ${pedagogyVisualKinds.join(", ")}.`);
}

export function parsePedagogyNumber(raw: string, allowSign = false): PedagogyNumber {
  const trimmed = raw.trim().replace(/^−/, "-");
  const leadingSign = /^[+-]/.test(trimmed) ? trimmed[0] : "";
  const match = trimmed.slice(leadingSign.length).match(/^(.*?)(\d[\d,]*(?:\.\d+)?)(.*)$/);
  if (!match) return fail(`${JSON.stringify(raw.trim())} must contain a number.`);
  const [, prefix, digits, suffix] = match;
  if (!allowSign && leadingSign) return fail(`${JSON.stringify(raw.trim())} must not be signed; signs are only used by waterfall.`);
  const value = (leadingSign === "-" ? -1 : 1) * Number(digits.replaceAll(",", ""));
  if (!Number.isFinite(value)) return fail(`${JSON.stringify(raw.trim())} is not a readable number.`);
  const decimals = digits.includes(".") ? digits.split(".")[1].length : 0;
  return { prefix: prefix.trimStart(), value, suffix: suffix.trimEnd(), decimals };
}

function items(data: string, separator: RegExp) {
  return data.split(separator).map((item) => item.trim()).filter(Boolean);
}

function count(kind: string, values: unknown[], minimum: number, maximum: number) {
  if (values.length < minimum || values.length > maximum) fail(`${kind} needs ${minimum}–${maximum} items in visual_data; found ${values.length}.`);
}

function dataPoints(kind: "bar" | "line" | "waterfall", data: string) {
  const points = items(data, /\|/).map((item) => {
    const colon = item.lastIndexOf(":");
    if (colon <= 0) return fail(`${kind} item ${JSON.stringify(item)} must use "label: number".`);
    const label = item.slice(0, colon).trim();
    if (!label) return fail(`${kind} item ${JSON.stringify(item)} has no label.`);
    return { label, amount: parsePedagogyNumber(item.slice(colon + 1), kind === "waterfall") };
  });
  count(kind, points, 2, 8);
  if (kind === "bar" && points.some((point) => point.amount.value < 0)) fail("bar values must be zero or positive.");
  return points;
}

export function parsePedagogyVisual(kindValue: unknown, dataValue: unknown): PedagogyVisual {
  const kind = normalizePedagogyVisualKind(kindValue);
  const data = text(dataValue).trim();
  if (kind === "text") return { kind };
  if (!data) return fail(`visual_data is required when visual is ${JSON.stringify(kind)}.`);
  if (kind === "flowchart") {
    const steps = items(data, />|→/);
    count("flowchart", steps, 2, 6);
    return { kind, steps };
  }
  if (kind === "cards") {
    const cards = items(data, /\|/).map((item) => {
      const colon = item.indexOf(":");
      return colon > 0 ? { title: item.slice(0, colon).trim(), body: item.slice(colon + 1).trim() } : { title: item, body: "" };
    });
    count("cards", cards, 1, 4);
    return { kind, cards };
  }
  if (kind === "bar" || kind === "line" || kind === "waterfall") return { kind, points: dataPoints(kind, data) };
  if (kind === "counter") return { kind, amount: parsePedagogyNumber(data) };
  const names = items(data, /,/).map((name) => name.toLowerCase());
  count("logo", names, 1, 8);
  const invalid = names.find((name) => !/^[a-z0-9][a-z0-9-]*$/.test(name));
  if (invalid) fail(`logo name ${JSON.stringify(invalid)} may only use lowercase letters, numbers and hyphens.`);
  return { kind, names };
}

/** Labels a row's `emphasis` may point at, in addition to the board/title text. */
export function pedagogyVisualLabels(visual: PedagogyVisual): string[] {
  if (visual.kind === "flowchart") return visual.steps;
  if (visual.kind === "cards") return visual.cards.flatMap((card) => [card.title, card.body]);
  if (visual.kind === "waterfall") return [...visual.points.map((point) => point.label), "Net"];
  if (visual.kind === "bar" || visual.kind === "line") return visual.points.map((point) => point.label);
  if (visual.kind === "logo") return visual.names;
  return [];
}

export function formatPedagogyNumber(amount: PedagogyNumber, value = amount.value, signed = false) {
  const digits = Math.abs(value).toLocaleString("en-IN", { minimumFractionDigits: amount.decimals, maximumFractionDigits: amount.decimals });
  const sign = value < 0 ? "−" : signed && value > 0 ? "+" : "";
  return `${sign}${amount.prefix}${digits}${amount.suffix}`;
}
