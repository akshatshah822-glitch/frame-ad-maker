import assert from "node:assert/strict";
import test from "node:test";
import { validatePedagogyRows, type PedagogyBriefInputRow } from "../src/lib/pedagogy-brief";
import { createDiagramSlideSvg } from "../src/lib/pedagogy-diagram-slide";
import { infographicElements } from "../src/lib/pedagogy-infographic";

const row = (diagram: string, items: string, step = 1): PedagogyBriefInputRow => ({
  sourceRow: 2, questionId: "X", lineNo: 1, time: "0:01", narration: "એક લાઇન.", board: "નોંધ", layout: "diagram", diagram, diagramItems: items, diagramStep: step,
});

test("table, hub, venn and stairs are brief kinds with one step per item", () => {
  for (const [kind, items] of [["table", "A = B | C = D | E = F"], ["hub", "Centre | One = 1 | Two = 2"], ["venn", "A = 1 | B = 2 | C = 3 | All"], ["stairs", "0-2 = One | 2-7 = Two"]]) {
    const [validated] = validatePedagogyRows([row(kind, items)]);
    assert.equal(validated.diagramItems.length, items.split("|").length, kind);
  }
  assert.throws(() => validatePedagogyRows([row("venn", "A | B | C | D | E")]));
  assert.throws(() => validatePedagogyRows([row("table", Array.from({ length: 9 }, (_, i) => `r${i} = x`).join(" | "))]));
});

test("table: header first, then one row per step", async () => {
  const elements = await infographicElements("table", ["Growth = Development", "Physical = All-round", "Quantity = Quality"]);
  assert.deepEqual(elements.map((e) => e.step), [1, 2, 3]);
  assert.match(elements[0].svg, /Growth/);
  assert.match(elements[2].svg, /Quality/);
});

test("hub: centre first, spokes joined to it", async () => {
  const elements = await infographicElements("hub", ["Child = whole", "Body = play", "Mind = puzzles", "Language = songs"]);
  assert.deepEqual(elements.map((e) => e.step), [1, 2, 3, 4]);
  assert.match(elements[1].svg, /<line /);
});

test("venn: circles then the shared middle", async () => {
  const elements = await infographicElements("venn", ["Growth = size", "Development = behaviour", "Maturity = readiness", "Whole child"]);
  assert.deepEqual(elements.map((e) => e.step), [1, 2, 3, 4]);
  assert.equal(elements.filter((e) => /fill-opacity="0.18"/.test(e.svg)).length, 3);
  assert.match(elements[3].svg, /Whole child/);
});

test("stairs: each step stands higher than the last", async () => {
  const elements = await infographicElements("stairs", ["0-2 = One", "2-7 = Two", "7-11 = Three"]);
  const tops = elements.map((e) => Number(/<rect x="[\d.]+" y="([\d.]+)"/.exec(e.svg)?.[1]));
  assert.ok(tops[0] > tops[1] && tops[1] > tops[2], tops.join(","));
  const svg = await createDiagramSlideSvg({ diagram: "stairs", step: 3, board: "નોંધ", emphasis: "", title: "t", timeLabel: "0:00", items: ["0-2 = One", "2-7 = Two", "7-11 = Three"] });
  assert.match(svg, /7-11/);
});

test("an item ending in '@ file.png' draws that picture inside its box", async () => {
  const { mkdtemp, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const sharp = (await import("sharp")).default;
  const folder = await mkdtemp(join(tmpdir(), "frame-item-pic-"));
  await writeFile(join(folder, "baby.png"), await sharp({ create: { width: 60, height: 50, channels: 3, background: "#ffcc99" } }).png().toBuffer());
  for (const kind of ["timeline", "table", "stairs", "cards", "compare"] as const) {
    const elements = await infographicElements(kind, ["Infancy = birth to 2 @ baby.png", "Childhood = 2 to 6"], folder);
    const withPicture = elements.filter((e) => e.svg.includes("data:image/png;base64,"));
    assert.equal(withPicture.length, 1, kind);
    assert.doesNotMatch(elements.map((e) => e.svg).join(""), /baby\.png/, `${kind}: file name must not be shown as text`);
  }
  const [missing] = await infographicElements("cards", ["Gone = x @ gone.png"], folder);
  assert.match(missing.svg, /missing: gone.png/);
});
