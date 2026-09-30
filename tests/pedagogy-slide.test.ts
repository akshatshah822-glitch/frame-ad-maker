import assert from "node:assert/strict";
import test from "node:test";
import { createPedagogySlide, createPedagogySlideSvg, wrapPedagogyBoardText } from "../src/lib/pedagogy-slide";

async function expectPreservedBoardText(value: string) {
  const layout = await wrapPedagogyBoardText(value);
  assert.equal(layout.lines.join(" "), value);
  assert.ok(layout.lines.every((line) => !/^\s|\s$/.test(line)));
  return layout;
}

test("preserves spaces in plain English board text", async () => {
  const value = "A simple sentence consists of a single independent clause.";
  const layout = await expectPreservedBoardText(value);
  assert.ok(layout.lines.join("\n").includes("simple sentence"));
});

test("preserves punctuation spacing in board text", async () => {
  const value = "Definition shown: A complete thought; subject and predicate.";
  const layout = await expectPreservedBoardText(value);
  assert.ok(layout.lines.join("\n").includes("shown: A"));
  assert.ok(layout.lines.join("\n").includes("thought; subject"));
});

test("preserves Hindi Unicode board text", async () => {
  const value = "यह एक पूरा वाक्य है।";
  const layout = await expectPreservedBoardText(value);
  assert.equal(layout.lines.join(""), value);
  assert.ok((await createPedagogySlide({ questionId: "Q", board: value, emphasis: "", generatedTimeLabel: "0:00" })).byteLength > 1_000);
});

test("preserves Hinglish Unicode board text", async () => {
  const value = "Ram is playing. यह एक statement है।";
  const layout = await expectPreservedBoardText(value);
  assert.ok(layout.lines.join("\n").includes("Ram is playing."));
  assert.ok(layout.lines.join("\n").includes("एक statement"));
});

test("preserves spaces on both sides of an emphasised middle phrase", async () => {
  const value = "A complete thought is required.";
  const layout = await wrapPedagogyBoardText(value, "complete thought");
  const svg = await createPedagogySlideSvg({ questionId: "Q", board: value, emphasis: "complete thought", generatedTimeLabel: "0:00" });
  assert.equal(layout.lines.join(" "), value);
  assert.match(svg, /<tspan xml:space="preserve"> <\/tspan><tspan xml:space="preserve" fill="#ff5c46" text-decoration="underline" text-decoration-thickness="3">complete thought<\/tspan><tspan xml:space="preserve"> <\/tspan>/);
});

test("wraps multi-line board text without joining words", async () => {
  const value = "Definition shown: A simple sentence consists of a single independent clause that conveys a complete thought; contains a subject and a predicate.";
  const layout = await expectPreservedBoardText(value);
  assert.ok(layout.lines.length > 1);
  assert.ok(layout.lines.every((line) => line.includes(" ") || line === "predicate."));
});

test("shows a fixed question and its exact option text above the solution", async () => {
  const questionText = "Which sentence has a complete thought?";
  const options: [string, string, string, string, string] = ["Ram is playing.", "Because it rains.", "Under the tree.", "Very quickly.", "A complete thought."];
  const svg = await createPedagogySlideSvg({ questionId: "ENG-1", questionText, options, board: "A complete thought needs a subject and predicate.", emphasis: "subject", generatedTimeLabel: "0:06" });
  assert.match(svg, /QUESTION · ENG-1/);
  assert.match(svg, /SOLUTION/);
  assert.match(svg, /<tspan xml:space="preserve">Which<\/tspan><tspan xml:space="preserve"> <\/tspan><tspan xml:space="preserve">sentence<\/tspan>/);
  assert.match(svg, /<tspan xml:space="preserve">thought\?<\/tspan>/);
  assert.match(svg, /<tspan xml:space="preserve">Ram<\/tspan><tspan xml:space="preserve"> <\/tspan><tspan xml:space="preserve">is<\/tspan>/);
  assert.match(svg, /<tspan xml:space="preserve">quickly\.<\/tspan>/);
  assert.match(svg, /E\.<\/text><text xml:space="preserve" x="310"/);
  assert.match(svg, /<tspan xml:space="preserve">thought\.<\/tspan>/);
  assert.match(svg, /<tspan xml:space="preserve" fill="#ff5c46" text-decoration="underline" text-decoration-thickness="3">subject<\/tspan>/);
});

test("keeps the concept-only slide layout when no question is supplied", async () => {
  const svg = await createPedagogySlideSvg({ questionId: "Q", board: "Concept remains unchanged.", emphasis: "", generatedTimeLabel: "0:00" });
  assert.doesNotMatch(svg, />QUESTION</);
  assert.doesNotMatch(svg, />SOLUTION</);
});

const multiLineBoard = "5 : 2\n7 parts = 56\n1 part = 8\nMen = 5 × 8 = 40\nWomen = 2 × 8 = 16";
const multiLineBoardLines = ["5 : 2", "7 parts = 56", "1 part = 8", "Men = 5 × 8 = 40", "Women = 2 × 8 = 16"];

function svgTextLines(svg: string) {
  return [...svg.matchAll(/<text xml:space="preserve"[^>]*>(.*?)<\/text>/g)].map(([, spans]) => spans.replace(/<[^>]+>/g, ""));
}

test("keeps each line break in a board cell as its own board line", async () => {
  const layout = await wrapPedagogyBoardText(multiLineBoard);
  assert.deepEqual(layout.lines, multiLineBoardLines);
});

test("stacks multi-line board text in the solution panel and highlights emphasis on its line", async () => {
  const svg = await createPedagogySlideSvg({ questionId: "Q", questionText: "Split 56 in the ratio 5 : 2.", options: ["40, 16", "", "", "", ""], board: multiLineBoard, emphasis: "5 × 8 = 40", generatedTimeLabel: "0:00" });
  const lines = svgTextLines(svg).slice(-multiLineBoardLines.length);
  assert.deepEqual(lines, multiLineBoardLines);
  assert.match(svg, /<text xml:space="preserve"[^>]*><tspan xml:space="preserve">Men<\/tspan><tspan xml:space="preserve"> <\/tspan><tspan xml:space="preserve">=<\/tspan><tspan xml:space="preserve"> <\/tspan><tspan xml:space="preserve" fill="#ff5c46"[^>]*>5 × 8 = 40<\/tspan><\/text>/);
});
