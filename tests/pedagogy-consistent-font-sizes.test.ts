import assert from "node:assert/strict";
import test from "node:test";
import { infographicElements, ROLE_MAX_SIZE } from "../src/lib/pedagogy-infographic";

const sizesOf = (svg: string) => [...svg.matchAll(/font-size="(\d+)"/g)].map((m) => Number(m[1]));

test("every body cell of a multi-column table uses one size, even when one cell has much more text", async () => {
  const elements = await infographicElements("table", ["P = A = B", "Short = Yes = No", "Long = Phototrophic, heterotrophic or chemoautotrophic and more words here = Small"]);
  const body = elements.slice(1).flatMap((e) => sizesOf(e.svg));
  assert.equal(new Set(body).size, 1, `one body size, got ${[...new Set(body)]}`);
});

test("cards on one slide share one title size and one body size", async () => {
  const elements = await infographicElements("cards", ["A = short", "B = a much longer body text that needs several lines to fit inside its card box on the slide", "C = mid length text"]);
  const all = elements.flatMap((e) => sizesOf(e.svg));
  assert.ok(new Set(all).size <= 2, `title + body only, got ${[...new Set(all)]}`);
});

test("no slide kind goes above the shared ceiling for its role", async () => {
  const compare = await infographicElements("compare", ["Plant = Big", "Animal = Small"]);
  const cards = await infographicElements("cards", ["Plant = Big", "Animal = Small"]);
  assert.ok(Math.max(...compare.flatMap((e) => sizesOf(e.svg))) <= ROLE_MAX_SIZE.title);
  assert.deepEqual(sizesOf(compare[0].svg).sort(), sizesOf(cards[0].svg).sort(), "same words, same sizes on both kinds");
});
