import assert from "node:assert/strict";
import test from "node:test";
import { createPedagogySlideSvg } from "../src/lib/pedagogy-slide";

const question = "Rs. 230 is to be divided among 56 persons (men and women). The ratio of the total amount of money received by men and women is 15 : 8. But the ratio of the money received by each man and woman is 3 : 4. Find the number of men and women.";
const board = "M : W\nTotal: 15 : 8\nPer person: 3 : 4\nNumber: 5 : 2";
const base = { questionId: "Q1", questionText: question, options: ["", "", "", "", ""] as [string, string, string, string, string], board, emphasis: "Number: 5 : 2", generatedTimeLabel: "0:10" };

test("strip view draws a question strip and a large solution panel", async () => {
  const strip = await createPedagogySlideSvg({ ...base, questionView: "strip" });
  assert.match(strip, /height="260" rx="22"/, "question strip is drawn");
  assert.match(strip, /height="540" rx="28"/, "large solution panel is drawn");
  const visible = strip.replace(/<[^>]+>/g, "");
  assert.ok(visible.includes("15 : 8") && visible.includes("number of men and women"), "question text still visible in the strip");
});

test("question strip and board use the same font size", async () => {
  const strip = await createPedagogySlideSvg({ ...base, questionView: "strip" });
  const sizes = new Set([...strip.matchAll(/<text xml:space="preserve"[^>]*font-size="(\d+)"/g)].map((m) => m[1]));
  assert.equal(sizes.size, 1, `one shared size, got ${[...sizes]}`);
});

test("default view (no questionView) is unchanged full layout", async () => {
  assert.equal(await createPedagogySlideSvg(base), await createPedagogySlideSvg({ ...base, questionView: "full" }));
});

test("falls back to the full layout and logs when a question is too long for the strip", async () => {
  const logged: unknown[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => { logged.push(args); };
  try {
    const long = { ...base, questionText: `${question} `.repeat(4), questionView: "strip" as const };
    const svg = await createPedagogySlideSvg(long);
    assert.doesNotMatch(svg, /height="260" rx="22"/);
  } finally { console.info = original; }
  assert.match(JSON.stringify(logged), /full-fallback/);
});
