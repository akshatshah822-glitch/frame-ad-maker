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
