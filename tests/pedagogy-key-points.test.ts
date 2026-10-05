import assert from "node:assert/strict";
import test from "node:test";
import { pedagogyWarnings, validatePedagogyRows, type PedagogyBriefInputRow } from "../src/lib/pedagogy-brief";
import { createConceptSlideSvg } from "../src/lib/pedagogy-concept-slide";
import { createDiagramSlideSvg } from "../src/lib/pedagogy-diagram-slide";
import { emphasisPhrases } from "../src/lib/pedagogy-emphasis";

test("emphasis splits on | and a single phrase still works", () => {
  assert.deepEqual(emphasisPhrases("IPC | IPU |  Mihir Shah Committee "), ["IPC", "IPU", "Mihir Shah Committee"]);
  assert.deepEqual(emphasisPhrases("one phrase"), ["one phrase"]);
});

test("concept slide highlights every key point", async () => {
  const svg = await createConceptSlideSvg({ topic: "T", board: "Huge gap between IPC and IPU\n(Mihir Shah Committee)", emphasis: "IPC | IPU | Mihir Shah Committee", timeLabel: "0:00" });
  assert.equal((svg.match(/<rect[^>]*rx="8" fill="#ffd166"\/>/g) ?? []).length, 3);
});

test("diagram notes colour each key phrase, not the whole line", async () => {
  const svg = await createDiagramSlideSvg({ diagram: "canal-network", step: 1, board: "Say: 10,000 litres (big on paper)", emphasis: "10,000 litres", title: "T", timeLabel: "0:00", labels: "en" });
  assert.match(svg, /<tspan fill="#ffd166">10,000 litres<\/tspan>/);
});

test("each missing key point gets its own warning", () => {
  const row: PedagogyBriefInputRow = { sourceRow: 2, questionId: "D4", lineNo: 1, time: "0:01", narration: "लाइन।", board: "IPC and IPU", emphasis: "IPC | FRBM", layout: "concept" };
  const warnings = pedagogyWarnings(validatePedagogyRows([row]));
  assert.deepEqual(warnings, ['Row 2: emphasis "FRBM" does not exist on the current board; no highlight was added.']);
});
