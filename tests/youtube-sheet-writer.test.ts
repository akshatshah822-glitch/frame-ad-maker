import test from "node:test";
import assert from "node:assert/strict";
import { parseJson3Captions, parsePastedTranscript, pickCaptionTrack, transcriptWindow, youtubeVideoId, fetchYoutubeTranscript, YoutubeTranscriptError } from "../src/lib/youtube-transcript";
import { normalizeConcepts, sheetWorkbook, type SheetConcept } from "../src/lib/pedagogy-sheet-writer";
import { extractPedagogyRowsFromWorkbook } from "../src/lib/pedagogy-workbook";
import { validatePedagogyRows } from "../src/lib/pedagogy-brief";

test("YouTube links of every shape give the video id", () => {
  for (const link of ["https://www.youtube.com/watch?v=VIoeyTKXLUE&t=1195s", "youtu.be/VIoeyTKXLUE?t=5", "https://www.youtube.com/live/VIoeyTKXLUE", "https://m.youtube.com/shorts/VIoeyTKXLUE", "VIoeyTKXLUE"]) {
    assert.equal(youtubeVideoId(link), "VIoeyTKXLUE", link);
  }
  assert.throws(() => youtubeVideoId("https://example.com/watch?v=VIoeyTKXLUE"), YoutubeTranscriptError);
});

test("YouTube's Show transcript copy is read with its times", () => {
  const lines = parsePastedTranscript("0:05\nएक rule देखो\n1:02:03\nRaise a finger\nfive fingers\n12:00 the inventor");
  assert.deepEqual(lines, [{ start: 5, text: "एक rule देखो" }, { start: 3723, text: "Raise a finger five fingers" }, { start: 720, text: "the inventor" }]);
  assert.equal(transcriptWindow(lines, 0, 800).length, 2);
});

test("caption tracks: Hindi before English, uploaded before auto", () => {
  assert.equal(pickCaptionTrack([{ baseUrl: "a", languageCode: "en", kind: "asr" }, { baseUrl: "b", languageCode: "hi", kind: "asr" }, { baseUrl: "c", languageCode: "en" }])?.baseUrl, "b");
  assert.deepEqual(parseJson3Captions({ events: [{ tStartMs: 1500, segs: [{ utf8: "the " }, { utf8: "sample" }] }, { tStartMs: 2000 }] }), [{ start: 1.5, text: "the sample" }]);
});

test("a video without captions asks for the pasted transcript and logs nothing secret", async () => {
  const fake = (async () => new Response(`<script>var ytInitialPlayerResponse = {"videoDetails":{"title":"T","lengthSeconds":"60"}};</script>`)) as unknown as typeof fetch;
  await assert.rejects(fetchYoutubeTranscript("https://youtu.be/VIoeyTKXLUE", fake), (error: unknown) => error instanceof YoutubeTranscriptError && error.code === "YOUTUBE_NO_CAPTIONS");
});

const aiConcept = {
  id: "x", src: "15:34–21:00", chapter: "Articles", title: "Second Mention or Context → The", emph: "The",
  problem: "An engineer designed a prototype (A) / but *a battery compartment (C)*. / overheated (D)",
  options: ["Only C", "Only A and B", "Only B", "Only A and C", "No Error"],
  table: [["Sentence", "Why", "Article"], ["There was ___ king", "first mention", "*a*"], ["___ king was known = for justice", "already known", "*the*"]],
  note: "First mention → a; known → the",
  steps: ["(C) Car already mentioned → the", "Answer: Error only in part C → Option A: Only C"],
  lines: [{ text: "यह question पढ़ो: An engineer designed a prototype, error कहाँ है?", draw: 0, cards: 0 }, { text: "Story याद करो: once upon a time there was a king, पहली बार, तो a।", draw: 2, cards: 0 }, { text: "तो error सिर्फ part C में है, इसलिए option A, only C।", draw: 3, cards: 1 }],
} as unknown as SheetConcept;

test("the AI's concept is made safe: whole board on the last line, no ' = ' in cells, no 'Answer:' twice", () => {
  const { concepts, fixes } = normalizeConcepts([aiConcept]);
  const [concept] = concepts;
  assert.equal(concept.id, "C1");
  assert.equal(concept.lines.at(-1)!.draw, 4); // header + 2 rows + note
  assert.equal(concept.lines.at(-1)!.cards, 2);
  assert.equal(concept.table[2][0], "___ king was known → for justice");
  assert.equal(concept.steps.at(-1), "Error only in part C → Option A: Only C");
  assert.ok(!concept.problem.includes("*."));
  assert.ok(fixes.some((fix) => fix.includes("whole board")));
});

test("the written workbook passes FRAME's own sheet checks", () => {
  const { concepts } = normalizeConcepts([aiConcept, { ...aiConcept, title: "Only One → The", emph: "Only One" }]);
  const bytes = sheetWorkbook(concepts, { link: "https://youtu.be/VIoeyTKXLUE", title: "Grammar", writer: "test" });
  const rows = validatePedagogyRows(extractPedagogyRowsFromWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer));
  assert.equal(rows.length, 6);
  assert.equal(rows[0].layout, "solution");
  assert.equal(rows[0].effectiveOptions?.length, 5);
});
