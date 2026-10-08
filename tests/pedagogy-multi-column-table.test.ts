import assert from "node:assert/strict";
import test from "node:test";
import { infographicElements, tableCells, tableColumns } from "../src/lib/pedagogy-infographic";

test("the header row sets the number of columns", () => {
  assert.equal(tableColumns("Organelle = Job"), 2);
  assert.equal(tableColumns("Feature = Prokaryotic = Eukaryotic"), 3);
  assert.equal(tableColumns("Property = Monera = Protista = Fungi = Plantae = Animalia"), 6);
  assert.equal(tableColumns("A = B = C = D = E = F = G = H"), 6, "never more than 6 columns");
});

test("rows split into exactly that many cells", () => {
  assert.deepEqual(tableCells({ title: "Nucleus", text: "Absent (nucleoid) = Present" }, 3), ["Nucleus", "Absent (nucleoid)", "Present"]);
  assert.deepEqual(tableCells({ title: "Size", text: "Small" }, 3), ["Size", "Small", ""]);
  assert.deepEqual(tableCells({ title: "Bonds", text: "A = T = G = C" }, 3), ["Bonds", "A", "T = G = C"]);
});

test("a three-column table draws one row per step with every cell's words", async () => {
  const elements = await infographicElements("table", ["Feature = Prokaryotic = Eukaryotic", "Nucleus = Absent = *Present*", "Ribosomes = Small = Large"]);
  assert.deepEqual(elements.map((e) => e.step), [1, 2, 3]);
  assert.match(elements[1].svg, /Absent/);
  assert.match(elements[1].svg, /font-weight="bold">Present</);
  assert.equal((elements[2].svg.match(/<line /g) ?? []).length, 2, "two column dividers");
});

test("two-column tables are drawn exactly as before (an '=' inside the text is kept)", async () => {
  const [, row] = await infographicElements("table", ["Pair = Bonds", "A and T = A = T (2 bonds)"]);
  assert.match(row.svg, /A = T \(2 bonds\)/);
});

test("a long single word in a narrow cell is shrunk so it does not spill into the next cell", async () => {
  const [, row] = await infographicElements("table", ["P = A = B = C = D = E", "Nutrition = Heterotrophic = Heterotrophic = Heterotrophic = Heterotrophic = Heterotrophic"]);
  const sizes = [...row.svg.matchAll(/font-size="(\d+)" fill="[^"]+">Heterotrophic/g)].map((m) => Number(m[1]));
  assert.equal(sizes.length, 5);
  assert.ok(sizes.every((size) => size < 32), `shrunk from 32, got ${sizes}`);
});
