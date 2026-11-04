// Optional visual boards for the exam-question (pedagogy) path only.
// A row with no `visual` column, or `visual` = "text", keeps the original text board unchanged.

export const pedagogyVisualKinds = ["text", "flowchart", "cards", "bar", "line", "waterfall", "counter", "logo", "picture", "page", "keypoints", "chapter"] as const;
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
  | { kind: "logo"; names: string[] }
  | { kind: "picture"; file: string; caption: string; credit: string }
  /** A whole booklet page (flipbook style): the camera frames `box` (fractions of the page, x0,y0,x1,y1). */
  | { kind: "page"; file: string; box: [number, number, number, number]; caption: string }
  /** A recap board in the flipbook look: a title and 2 to 7 points, *starred* words highlighted. */
  | { kind: "keypoints"; title: string; points: string[] }
  /** A chapter title card in the flipbook look: "2/6 = title = page.jpg" (the page, optional, is the blurred background). */
  | { kind: "chapter"; number: number; total: number; title: string; file: string };

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
  if (kind === "picture") {
    // "photo.jpg = caption = credit": the file lives in the pedagogy-images folder; caption and credit are optional.
    const [file, caption = "", credit = ""] = data.split("=").map((part) => part.trim());
    if (!/^[\w.-]+\.(?:jpe?g|png|webp)$/i.test(file)) fail(`picture ${JSON.stringify(file)} must be an image file name like photo.jpg.`);
    return { kind, file, caption, credit };
  }
  if (kind === "page") {
    // "page06.jpg = x0, y0, x1, y1 = caption": the page lives in the pedagogy-images folder; the box (fractions of the
    // page width and height, 0 to 1) is the part being read, and is optional (blank = the whole page).
    const [file, boxText = "", caption = "", ...extra] = data.split("=").map((part) => part.trim());
    if (extra.length) fail(`page must be "file.jpg = x0, y0, x1, y1 = caption" (got ${JSON.stringify(data)}).`);
    if (!/^[\w.-]+\.(?:jpe?g|png|webp)$/i.test(file)) fail(`page ${JSON.stringify(file)} must be an image file name like page06.jpg.`);
    let box: [number, number, number, number] = [0, 0, 1, 1];
    if (boxText) {
      const parts = boxText.split(",").map((part) => Number(part.trim()));
      if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) fail(`page box ${JSON.stringify(boxText)} must be four numbers from 0 to 1: x0, y0, x1, y1.`);
      if (parts[2] - parts[0] < 0.02 || parts[3] - parts[1] < 0.02) fail(`page box ${JSON.stringify(boxText)} must have x1 > x0 and y1 > y0.`);
      box = parts as [number, number, number, number];
    }
    return { kind, file, box, caption };
  }
  if (kind === "keypoints") {
    // "Title = point | point | …"
    const [title, list = "", ...extra] = data.split("=").map((part) => part.trim());
    if (extra.length || !title) fail(`keypoints must be "Title = point | point | …" (got ${JSON.stringify(data)}).`);
    const points = items(list, /\|/);
    count("keypoints", points, 2, 7);
    return { kind, title, points };
  }
  if (kind === "chapter") {
    const [order = "", title = "", file = "", ...extra] = data.split("=").map((part) => part.trim());
    const match = /^(\d+)\s*\/\s*(\d+)$/.exec(order);
    if (extra.length || !match || !title) fail(`chapter must be "2/6 = title = page.jpg" (got ${JSON.stringify(data)}).`);
    const number = Number(match![1]), total = Number(match![2]);
    if (number < 1 || total < number || total > 12) fail(`chapter ${JSON.stringify(order)} must be like 2/6 (at most 12 chapters).`);
    if (file && !/^[\w.-]+\.(?:jpe?g|png|webp)$/i.test(file)) fail(`chapter page ${JSON.stringify(file)} must be an image file name like page06.jpg.`);
    return { kind, number, total, title, file };
  }
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
  if (visual.kind === "picture" || visual.kind === "page") return [visual.caption];
  if (visual.kind === "keypoints") return [visual.title, ...visual.points];
  if (visual.kind === "chapter") return [visual.title];
  return [];
}

export function formatPedagogyNumber(amount: PedagogyNumber, value = amount.value, signed = false) {
  const digits = Math.abs(value).toLocaleString("en-IN", { minimumFractionDigits: amount.decimals, maximumFractionDigits: amount.decimals });
  const sign = value < 0 ? "−" : signed && value > 0 ? "+" : "";
  return `${sign}${amount.prefix}${digits}${amount.suffix}`;
}
