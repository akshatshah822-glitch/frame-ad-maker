import assert from "node:assert/strict";
import test from "node:test";
import { validatePedagogyRows, type PedagogyBriefInputRow } from "../src/lib/pedagogy-brief";
import { conceptSlideFontSize, createConceptSlideSvg } from "../src/lib/pedagogy-concept-slide";

const base = (overrides: Partial<PedagogyBriefInputRow>, sourceRow = 2): PedagogyBriefInputRow => ({
  sourceRow, questionId: "F", lineNo: sourceRow - 1, time: `0:0${sourceRow}`, narration: "एक लाइन।", board: "तीन रास्ते", ...overrides,
});

test("concept rows parse; blank layout still means board", () => {
  const rows = validatePedagogyRows([base({ layout: "concept", questionText: "खेत तक पानी के तीन रास्ते" }, 2), base({}, 3)]);
  assert.equal(rows[0].layout, "concept");
  assert.equal(rows[1].layout, "board");
});

test("concept slide shows the topic and notes, never QUESTION or SOLUTION", async () => {
  const svg = await createConceptSlideSvg({ topic: "खेत तक पानी के तीन रास्ते", board: "1. ऊपर से → बारिश\n2. नीचे से → भूजल", emphasis: "बारिश", timeLabel: "0:42" });
  assert.match(svg, /TOPIC/);
  assert.match(svg, /खेत तक पानी के तीन रास्ते/);
  assert.doesNotMatch(svg, /QUESTION|SOLUTION/);
  assert.match(svg, /fill="#ffd166"/);
  assert.match(svg, /Georgia/);
});

test("concept notes respect the per-video size cap", async () => {
  const state = { topic: "T", board: "छोटी लाइन", emphasis: "", timeLabel: "0:00" };
  assert.equal(await conceptSlideFontSize(state), 56);
  assert.equal(await conceptSlideFontSize({ ...state, maxFontSize: 40 }), 40);
});
