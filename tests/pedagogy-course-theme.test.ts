import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { createCourseFrames, wrapText } from "../src/lib/pedagogy-course";
import { parsePedagogyVisual } from "../src/lib/pedagogy-visual";

async function size(png: Buffer) {
  const { width, height } = await sharp(png).metadata();
  return [width, height];
}

test("course boards draw cards, steps, a number, a text line and a host picture at 1920x1080", async () => {
  const picture = `data:image/png;base64,${(await sharp({ create: { width: 160, height: 90, channels: 3, background: "#c08040" } }).png().toBuffer()).toString("base64")}`;
  const pictures = new Map<string, string | null>([["host_01.jpg", picture]]);
  const cases: [string, string, string][] = [
    ["cards", "Hello, how are you?: નમસ્તે, તમે કેમ છો?", "Repeat after me"],
    ["cards", "ખોટું: Myself Ravi. | સાચું: My name is Ravi.", "Myself Ravi"],
    ["cards", "Please: મહેરબાની કરીને | Thank you: આભાર | Sorry: માફ કરશો | Excuse me: જરા સાંભળશો?", "નમ્ર શબ્દો"],
    ["flowchart", "Listen > Understand > Repeat > Speak > Use daily", "પાંચ પગલાં"],
    ["counter", "100 વાક્યો", "સો રોજના વાક્યો"],
    ["text", "", "સમજાય છે, પણ બોલાતું નથી?"],
    ["picture", "host_01.jpg = કેમ છો?", "કેમ છો?"],
  ];
  for (const [kind, data, board] of cases) {
    const frames = await createCourseFrames(parsePedagogyVisual(kind, data), board, 5, pictures);
    assert.ok(frames && frames.length >= 1, kind);
    const total = frames.reduce((sum, frame) => sum + frame.duration, 0);
    assert.ok(Math.abs(total - 5) < 0.1, `${kind} frames fill the line (${total})`);
    assert.deepEqual(await size(frames.at(-1)!.png), [1920, 1080]);
  }
});

test("a held row (same board as the row before) is one frame for the whole line", async () => {
  const frames = await createCourseFrames(parsePedagogyVisual("cards", "Good night.: શુભ રાત્રી."), "Card 1", 4, new Map(), true);
  assert.equal(frames!.length, 1);
  assert.equal(frames![0].duration, 4);
});

test("kinds without a course board return null so the caller can log the exam-look fallback", async () => {
  assert.equal(await createCourseFrames(parsePedagogyVisual("bar", "A: 1 | B: 2"), "Chart", 3, new Map()), null);
});

test("a missing host picture draws its caption on the card and logs the path", async () => {
  const logs: unknown[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => { logs.push(args); };
  try {
    const frames = await createCourseFrames(parsePedagogyVisual("picture", "host_99.jpg = આવજો!"), "આવજો!", 2, new Map([["host_99.jpg", null]]));
    assert.deepEqual(await size(frames![0].png), [1920, 1080]);
  } finally {
    console.warn = warn;
  }
  assert.match(JSON.stringify(logs), /missing-picture-card/);
});

test("long lines wrap by drawn width", async () => {
  const lines = await wrapText("I live with my parents and my brother in a small house near the market.", 46, 700, 500);
  assert.ok(lines.length > 1);
});

test("theme = course is accepted on any row, sent back by the render route, and turns off the running track", async () => {
  const brief = await readFile("src/lib/pedagogy-brief.ts", "utf8");
  assert.match(brief, /row\.themeText !== "course"/);
  const route = await readFile("src/app/api/question/pedagogy/render/route.ts", "utf8");
  assert.match(route, /theme: row\.effectiveTheme,\n/);
  const video = await readFile("src/lib/pedagogy-video.ts", "utf8");
  assert.match(video, /course \? undefined : rowProgress/);
  assert.match(video, /"Pedagogy course look"/);
});
