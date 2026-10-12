import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import * as XLSX from "xlsx";
import { pedagogyWarnings, validatePedagogyRows } from "../src/lib/pedagogy-brief";
import { createPedagogySlide } from "../src/lib/pedagogy-slide";
import { formatPedagogyNumber, parsePedagogyVisual } from "../src/lib/pedagogy-visual";
import { createPedagogyVisualFrames, loadPedagogyBackgrounds, loadPedagogyLogos } from "../src/lib/pedagogy-visual-slide";
import { extractPedagogyRowsFromWorkbook } from "../src/lib/pedagogy-workbook";

const base = { sourceRow: 2, questionId: "JIO-01", lineNo: "1", time: "0:00", narration: "Start with the 3Cs.", board: "The 3Cs", emphasis: "", pauseAfter: "" };

test("sheets without visual or background columns render as text boards, exactly as before", () => {
  const [row] = validatePedagogyRows([base]);
  assert.equal(row.visual, "text");
  assert.equal(row.visualData, "");
  assert.equal(row.effectiveBackground, "");
});

test("parses every visual kind from spreadsheet-friendly text", () => {
  assert.deepEqual(parsePedagogyVisual("flowchart", "Free SIM > First use → Daily habit"), { kind: "flowchart", steps: ["Free SIM", "First use", "Daily habit"] });
  assert.deepEqual(parsePedagogyVisual("Cards", "Customers: little data | Company"), { kind: "cards", cards: [{ title: "Customers", body: "little data" }, { title: "Company", body: "" }] });
  const line = parsePedagogyVisual("line", "2016: ₹250 | 2018: ₹10");
  assert.equal(line.kind, "line");
  if (line.kind === "line") assert.deepEqual(line.points.map((point) => [point.label, point.amount.prefix, point.amount.value]), [["2016", "₹", 250], ["2018", "₹", 10]]);
  const waterfall = parsePedagogyVisual("waterfall", "Commission: +₹66 | Delivery: -₹50 | Discounts: −₹30");
  if (waterfall.kind === "waterfall") assert.deepEqual(waterfall.points.map((point) => point.amount.value), [66, -50, -30]);
  const counter = parsePedagogyVisual("counter", "10.5 crore users");
  if (counter.kind === "counter") assert.equal(formatPedagogyNumber(counter.amount), "10.5 crore users");
  assert.deepEqual(parsePedagogyVisual("logo", "Jio, tata-docomo"), { kind: "logo", names: ["jio", "tata-docomo"] });
});

test("rejects malformed visuals with the worksheet row number", () => {
  assert.throws(() => validatePedagogyRows([{ ...base, visual: "pie", visualData: "a: 1 | b: 2" }]), /Row 2: visual "pie" must be one of/);
  assert.throws(() => validatePedagogyRows([{ ...base, visual: "bar", visualData: "" }]), /Row 2: visual_data is required/);
  assert.throws(() => validatePedagogyRows([{ ...base, visual: "bar", visualData: "Only: 1" }]), /needs 2–8 items/);
  assert.throws(() => validatePedagogyRows([{ ...base, visual: "bar", visualData: "A: -1 | B: 2" }]), /must not be signed/);
  assert.throws(() => validatePedagogyRows([{ ...base, visual: "logo", visualData: "Jio Platforms" }]), /lowercase letters, numbers and hyphens/);
  assert.throws(() => validatePedagogyRows([{ ...base, background: "Delhi Street" }]), /background "delhi street"/);
});

test("carries the background forward like the board, and clears it with none", () => {
  const rows = validatePedagogyRows([
    { ...base, background: "mumbai-night" },
    { ...base, sourceRow: 3, lineNo: "2", time: "0:05" },
    { ...base, sourceRow: 4, lineNo: "3", time: "0:09", background: "none" },
  ]);
  assert.deepEqual(rows.map((row) => row.effectiveBackground), ["mumbai-night", "mumbai-night", ""]);
});

test("emphasis on a visual row may point at a step, card or bar label", () => {
  const rows = validatePedagogyRows([
    { ...base, visual: "flowchart", visualData: "Free SIM > Daily habit", emphasis: "Daily habit" },
    { ...base, sourceRow: 3, lineNo: "2", time: "0:05", visual: "bar", visualData: "IndiGo: 62 | Others: 38", emphasis: "Missing" },
  ]);
  assert.deepEqual(pedagogyWarnings(rows), ["Row 3: emphasis \"Missing\" does not exist on the current board; no highlight was added."]);
});

test("imports visual, visual_data and background columns from the first worksheet", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ question_id: "ZOM-01", line_no: 1, time: "0:00", sir_ka_vaakya: "Follow one order.", board: "One order", visual: "waterfall", visual_data: "Commission: +66 | Delivery: -50", background: "kitchen" }]), "Pedagogy");
  const [row] = validatePedagogyRows(extractPedagogyRowsFromWorkbook(XLSX.write(workbook, { bookType: "xlsx", type: "array" })));
  assert.equal(row.visual, "waterfall");
  assert.equal(row.visualData, "Commission: +66 | Delivery: -50");
  assert.equal(row.effectiveBackground, "kitchen");
});

test("animates a visual over its slot and holds the final frame for the rest", async () => {
  const visual = parsePedagogyVisual("flowchart", "Free SIM > First use > Daily habit");
  if (visual.kind === "text") throw new Error("expected a visual");
  const frames = await createPedagogyVisualFrames({ questionId: "JIO-01", title: "Remove the switching cost", emphasis: "Daily habit", generatedTimeLabel: "0:12", visual }, 6);
  assert.ok(frames.length >= 10);
  assert.notDeepEqual(frames[0].png, frames.at(-1)!.png);
  const total = frames.reduce((sum, frame) => sum + frame.duration, 0);
  assert.ok(Math.abs(total - 6) < 0.000001);
  const metadata = await sharp(frames.at(-1)!.png).metadata();
  assert.deepEqual([metadata.width, metadata.height], [1920, 1080]);
});

test("loads real logo and background files and reports missing ones as null", async () => {
  const directory = await mkdtemp(join(tmpdir(), "frame-pedagogy-assets-"));
  await writeFile(join(directory, "jio.png"), await sharp({ create: { width: 200, height: 100, channels: 3, background: "#0a2885" } }).png().toBuffer());
  const logos = await loadPedagogyLogos(["jio", "airtel"], directory);
  assert.match(logos.get("jio") ?? "", /^data:image\/png;base64,/);
  assert.equal(logos.get("airtel"), null);
  await writeFile(join(directory, "street.jpg"), await sharp({ create: { width: 640, height: 360, channels: 3, background: "#334455" } }).jpeg().toBuffer());
  const backgrounds = await loadPedagogyBackgrounds(["street", "missing"], directory);
  assert.match(backgrounds.get("street") ?? "", /^data:image\/jpeg;base64,/);
  assert.equal(backgrounds.get("missing"), null);
});

async function rightmostInkColumn(png: Buffer) {
  const { data, info } = await sharp(png).extract({ left: 200, top: 300, width: 1560, height: 600 }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let rightmost = -1;
  for (let y = 0; y < info.height; y += 1) for (let x = info.width - 1; x > rightmost; x -= 1) if (data[y * info.width + x] > 225) { rightmost = x; break; }
  return rightmost;
}

test("text boards keep their word spaces", async () => {
  const spaced = await rightmostInkColumn(await createPedagogySlide({ questionId: "Q-1", board: "a b c d e f g h", emphasis: "", generatedTimeLabel: "0:00" }));
  const joined = await rightmostInkColumn(await createPedagogySlide({ questionId: "Q-1", board: "abcdefgh", emphasis: "", generatedTimeLabel: "0:00" }));
  assert.ok(spaced > joined + 100, `expected spaced text to be wider: ${spaced} vs ${joined}`);
});
