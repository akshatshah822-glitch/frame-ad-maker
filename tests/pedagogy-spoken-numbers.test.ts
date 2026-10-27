import assert from "node:assert/strict";
import test from "node:test";
import { indianWords, spokenNarration } from "../src/lib/pedagogy-spoken";

test("Indian number words", () => {
  assert.equal(indianWords(48160), "forty-eight thousand one hundred sixty");
  assert.equal(indianWords(120000), "one lakh twenty thousand");
  assert.equal(indianWords(13330), "thirteen thousand three hundred thirty");
  assert.equal(indianWords(25000000), "two crore fifty lakh");
  assert.equal(indianWords(105), "one hundred five");
});

test("rupees, percent, minus, fractions and decimals are spoken in English", () => {
  assert.equal(spokenNarration("तो selling price होगा ₹48,160।"), "तो selling price होगा rupees forty-eight thousand one hundred sixty।");
  assert.equal(spokenNarration("Income है ₹1,20,000, उसमें 30% EMI"), "Income है rupees one lakh twenty thousand, उसमें thirty percent EMI");
  assert.equal(spokenNarration("−18% से +13% तक"), "minus eighteen percent से plus thirteen percent तक");
  assert.equal(spokenNarration("selling price आता है 105.3।"), "selling price आता है one hundred five point three।");
  assert.equal(spokenNarration("P(red) = 1/3 है"), "P(red) equals one by three है");
  assert.equal(spokenNarration("उस पर x% markup"), "उस पर x percent markup");
  assert.equal(spokenNarration("Milk 13a और water 7a।"), "Milk thirteen a और water seven a।");
  assert.equal(spokenNarration("9C3 by 12C3"), "nine C three by twelve C three");
  assert.equal(spokenNarration("24 into 30, यानी 720"), "twenty-four into thirty, यानी seven hundred twenty");
});

test("lines without numbers are left exactly as written", () => {
  assert.equal(spokenNarration("Pass mark को एक wall मानो।"), "Pass mark को एक wall मानो।");
});
