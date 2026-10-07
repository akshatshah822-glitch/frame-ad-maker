import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { validatePedagogyRows, type PedagogyBriefInputRow } from "../src/lib/pedagogy-brief";
import { createDiagramSlideSvg } from "../src/lib/pedagogy-diagram-slide";
import { infographicElements } from "../src/lib/pedagogy-infographic";

const base = (overrides: Partial<PedagogyBriefInputRow>, sourceRow = 2): PedagogyBriefInputRow => ({
  sourceRow, questionId: "PIC", lineNo: sourceRow - 1, time: `0:0${sourceRow}`, narration: "એક લાઇન.", board: "નોંધ", ...overrides,
});

async function folderWith(name: string, width: number, height: number) {
  const folder = await mkdtemp(join(tmpdir(), "frame-images-"));
  await writeFile(join(folder, name), await sharp({ create: { width, height, channels: 3, background: "#c0703a" } }).png().toBuffer());
  return folder;
}

test("image is a brief diagram kind: one step per picture, at most 4", () => {
  const rows = validatePedagogyRows([
    base({ layout: "diagram", diagram: "image", diagramItems: "potter.png = Clay first | stairs.png", diagramStep: 1 }, 2),
    base({ layout: "diagram", diagramStep: 2 }, 3),
  ]);
  assert.deepEqual(rows.map((row) => [row.diagram, row.diagramStep, row.diagramItems.length]), [["image", 1, 2], ["image", 2, 2]]);
  assert.throws(() => validatePedagogyRows([base({ layout: "diagram", diagram: "image", diagramItems: "a.png | b.png | c.png | d.png | e.png", diagramStep: 1 })]));
});

test("a picture from the folder is embedded with its caption", async () => {
  const folder = await folderWith("potter.png", 400, 300);
  const [element] = await infographicElements("image", ["potter.png = માટી તૈયાર, પછી ઘાટ"], folder);
  assert.match(element.svg, /<image href="data:image\/png;base64,/);
  assert.match(element.svg, /માટી તૈયાર, પછી ઘાટ/);
});

test("a missing or unsafe picture draws a visible placeholder instead of failing", async () => {
  const folder = await folderWith("potter.png", 400, 300);
  const [missing, unsafe] = await infographicElements("image", ["nothere.png", "../secret.png"], folder);
  assert.match(missing.svg, /picture missing: nothere.png/);
  assert.match(unsafe.svg, /picture missing: ..\/secret.png/);
  assert.doesNotMatch(missing.svg + unsafe.svg, /<image /);
});

test("the newest picture eases in and grows; earlier pictures stay still", async () => {
  const state = { diagram: "image", step: 2, board: "નોંધ", emphasis: "", title: "ચિત્ર", timeLabel: "0:01", items: ["a.png", "b.png"] };
  const halfway = await createDiagramSlideSvg(state, 0.5);
  // Eased: halfway through the time, the picture is already 87.5% visible and nearly full size.
  assert.match(halfway, /<g opacity="0.88" transform="translate\([\d.]+ [\d.]+\) scale\(0.985\)/);
  assert.equal((halfway.match(/scale\(/g) ?? []).length, 1);
  const done = await createDiagramSlideSvg(state, 1);
  assert.match(done, /scale\(1.000\)/);
});

test("a picture sits on a white rounded card with a shadow", async () => {
  const folder = await folderWith("card.png", 400, 300);
  const [element] = await infographicElements("image", ["card.png"], folder);
  assert.match(element.svg, /fill="#ffffff"/);
  assert.match(element.svg, /clip-path="url\(#pic-0\)"/);
  assert.match(element.svg, /feGaussianBlur/);
});

test("a new topic dissolves from the previous slide", async () => {
  const { crossfadeFrame } = await import("../src/lib/pedagogy-transition");
  const folder = await mkdtemp(join(tmpdir(), "frame-fade-"));
  const black = join(folder, "black.png");
  await writeFile(black, await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000000" } }).png().toBuffer());
  const white = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const { data } = await sharp(await crossfadeFrame(black, white, 0.5)).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 110 && data[0] < 145, `midpoint grey, got ${data[0]}`);
});
