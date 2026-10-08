import assert from "node:assert/strict";
import test from "node:test";
import { highlightColour, infographicElements, richText } from "../src/lib/pedagogy-infographic";

test("starred words are drawn bold in the highlight colour and the stars never show", () => {
  const { svg, on } = richText("Has *no* cell wall", "#eef1f7");
  assert.equal(svg, 'Has <tspan fill="#ffd166" font-weight="bold">no</tspan> cell wall');
  assert.equal(on, false);
  assert.doesNotMatch(svg, /\*/);
});

test("text with no stars is unchanged, so old briefs look the same", () => {
  assert.equal(richText("Fluid matrix & more", "#eef1f7").svg, "Fluid matrix &amp; more");
});

test("yellow text gets a different highlight colour so the highlight is still visible", () => {
  assert.equal(highlightColour("#ffd166"), "#ff9f6b");
  assert.equal(highlightColour("#eef1f7"), "#ffd166");
});

test("a highlight that wraps onto the next line stays highlighted on both lines", async () => {
  const [card] = await infographicElements("cards", ["RNA = *the first genetic material, reactive and catalytic, mutates faster than DNA*"]);
  assert.doesNotMatch(card.svg, /\*/);
  assert.ok((card.svg.match(/font-weight="bold"/g) ?? []).length >= 2, "both wrapped lines are highlighted");
});
