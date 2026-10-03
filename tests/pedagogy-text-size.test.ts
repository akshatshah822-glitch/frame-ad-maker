import assert from "node:assert/strict";
import test from "node:test";
import { pedagogySlideFontSize, type PedagogySlideState } from "../src/lib/pedagogy-slide";
import { passageSlideFontSize } from "../src/lib/pedagogy-passage-slide";

const options: PedagogySlideState["options"] = ["Harmful", "Wholesome", "Formal", "Ancient", "Bitter"];
const slide = (board: string, maxFontSize?: number): PedagogySlideState => ({ questionId: "Q", questionText: "Which word is most similar in meaning to SALUTARY?", options, board, emphasis: "", generatedTimeLabel: "0:00", questionView: "strip", maxFontSize });

test("a short and a long solution get different sizes on their own, the same size with one shared cap", async () => {
  const short = await pedagogySlideFontSize(slide("Answer: (B) Wholesome"));
  const LONG = ["Harmful = nuksaan ✗", "Formal = aupchaarik ✗", "Ancient = bahut purana ✗", "Bitter = kadwa ✗ (same line, trap!)", "Wholesome = sehat ke liye achha ✓", "Step 1: sentence se clue", "Step 2: Hindi meaning", "Step 3: similar ya opposite?", "Step 4: eliminate", "So the answer is (B) Wholesome"].join("\n");
  const long = await pedagogySlideFontSize(slide(LONG));
  assert.ok(short > long, `expected the short slide to fit bigger text (${short} vs ${long})`);
  const cap = Math.min(short, long);
  assert.equal(await pedagogySlideFontSize(slide("Answer: (B) Wholesome", cap)), cap);
  assert.equal(await pedagogySlideFontSize(slide(LONG, cap)), cap);
});

test("in the strip view the question and the solution use the same size", async () => {
  const size = await pedagogySlideFontSize(slide("Answer: (B) Wholesome", 30));
  assert.equal(size, 30);
});

test("a passage slide's meaning card is never bigger than the passage text, and respects the cap", async () => {
  const state = { passage: "Every October, the nation remembers Gandhi.", emphasis: "Gandhi", taught: [], board: "Gandhi = Gandhi ji", title: "Read with me", timeLabel: "0:00" };
  assert.ok(await passageSlideFontSize(state) <= 44);
  assert.equal(await passageSlideFontSize({ ...state, maxFontSize: 30 }), 30);
});
