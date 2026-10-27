import assert from "node:assert/strict";
import test from "node:test";
import { validatePedagogyRows, pedagogyWarnings, type PedagogyBriefInputRow } from "../src/lib/pedagogy-brief";
import { journeyToColumns, parseJourneyCamera, parseJourneyEffects, parseJourneyLabels } from "../src/lib/pedagogy-journey-spec";
import { journeyCameraAt, planJourneyRow, JOURNEY_FPS } from "../src/lib/pedagogy-journey";

const row = (n: number, extra: Partial<PedagogyBriefInputRow> = {}): PedagogyBriefInputRow => ({ sourceRow: n + 1, questionId: extra.questionId ?? "Q1", lineNo: n, time: `0:${String(n * 5).padStart(2, "0")}`, narration: "ये North Pacific का pattern है।", board: "Board", layout: "concept", ...extra });

test("a sheet without gs_theme keeps today's look and no journey spec", () => {
  const rows = validatePedagogyRows([row(1), row(2)]);
  assert.equal(rows[0].gsTheme, "");
  assert.equal(rows[0].journey, null);
  assert.deepEqual(pedagogyWarnings(rows), []);
});

test("gs_theme = journey carries camera, labels, effects and caption", () => {
  const rows = validatePedagogyRows([
    row(1, { gsTheme: "journey", camera: "30, 175, 11, 0", anchoredLabels: "36, 175 = North Pacific = yellow | board: 100 students", effects: "equator | band 23.5,50", caption: "साउथ वाला नहीं", sourceTs: "1:51", badge: "NEW CONCEPT", chapter: "Where" }),
    row(2),
    row(3, { questionId: "Q2", camera: "33, -178, 7.6, 0.8" }),
  ]);
  assert.equal(rows[1].journey?.camera.lon, 175);
  assert.equal(rows[1].journey?.pins[0].text, "North Pacific");
  assert.deepEqual(rows[1].journey?.cardLines, ["board: 100 students"]);
  assert.equal(rows[1].journey?.effects.length, 2);
  assert.equal(rows[1].journey?.caption, "साउथ वाला नहीं");
  // a new question starts with no labels or effects, but keeps the badge and chapter
  assert.equal(rows[2].journey?.pins.length, 0);
  assert.equal(rows[2].journey?.effects.length, 0);
  assert.equal(rows[2].journey?.badge, "NEW CONCEPT");
  assert.equal(rows[2].journey?.camera.lat, 33);
});

test("bad journey values stop the sheet with the row number", () => {
  assert.throws(() => validatePedagogyRows([row(1, { gsTheme: "globe" })]), /Row 2: gs_theme must be/);
  assert.throws(() => validatePedagogyRows([row(1, { gsTheme: "journey", camera: "30, 175, 11" })]), /Row 2: camera must be/);
  assert.throws(() => validatePedagogyRows([row(1, { gsTheme: "journey", effects: "smoke 1,2" })]), /Row 2: effect "smoke"/);
  assert.throws(() => validatePedagogyRows([row(1, { gsTheme: "journey", anchoredLabels: "95, 10 = x = yellow" })]), /Row 2: latitude must be/);
  assert.throws(() => validatePedagogyRows([row(1, { gsTheme: "journey", anchoredLabels: "10, 10 = x = pink" })]), /Row 2: colour "pink"/);
});

test("gs_theme = cinematic warns that today's look is used", () => {
  const rows = validatePedagogyRows([row(1, { gsTheme: "cinematic" })]);
  assert.equal(rows[0].journey, null);
  assert.match(pedagogyWarnings(rows)[0], /cinematic" is a saved prototype/);
});

test("parsers and the write-back round trip", () => {
  const camera = parseJourneyCamera("26.5, 83, 4.6, 0.95");
  const { pins, cardLines } = parseJourneyLabels("29.5, 81 = air sinks = blue | 26.4, 83 = high pressure");
  const effects = parseJourneyEffects("glow 26.3,83 orange 1.5 0.55 | sink 26.4,83 | ring 26.4,83 | arc 31,175 > 44,-147 yellow | path 29,165 > 27,83");
  const columns = journeyToColumns({ camera, pins, cardLines, effects, caption: "c", sourceTs: "5:46", badge: "B", chapter: "India" });
  assert.deepEqual(parseJourneyCamera(columns.camera), camera);
  assert.deepEqual(parseJourneyLabels(columns.anchoredLabels).pins, pins);
  assert.deepEqual(parseJourneyEffects(columns.effects), effects);
  assert.equal(pins[1].colour, "yellow");
});

test("camera flights start and end on the given views; long flights pull back", () => {
  const a = { lat: 25, lon: 130, distance: 12.5, tilt: 0 }, b = { lat: 33, lon: -178, distance: 7.6, tilt: 0.8 };
  assert.deepEqual(journeyCameraAt(a, b, 0), { ...a, lon: 130 });
  const end = journeyCameraAt(a, b, 1);
  assert.ok(Math.abs(end.lat - 33) < 1e-6 && Math.abs(end.lon + 178) < 1e-6 && Math.abs(end.distance - 7.6) < 1e-9);
  assert.ok(journeyCameraAt(a, b, 0.5).distance > (a.distance + b.distance) / 2);
});

test("a row's frames fill exactly its spoken time", () => {
  const spec = { camera: parseJourneyCamera("30, 175, 11, 0"), pins: [], cardLines: [], effects: [], caption: "x", sourceTs: "", badge: "", chapter: "Where" };
  const previous = { ...spec, camera: parseJourneyCamera("25, 130, 12.5, 0"), caption: "y" };
  const frames = planJourneyRow(spec, previous, 7.3, ["Where"]);
  assert.ok(frames.length > 1 && frames.length <= Math.ceil(2.6 * JOURNEY_FPS) + 1);
  assert.ok(Math.abs(frames.reduce((sum, frame) => sum + frame.duration, 0) - 7.3) < 1e-9);
  assert.deepEqual(frames.at(-1)!.state.camera, spec.camera);
  // nothing new and no move: one held frame
  assert.equal(planJourneyRow(spec, spec, 4, ["Where"]).length, 1);
});
