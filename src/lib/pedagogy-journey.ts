import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, Page } from "playwright-core";
import { PedagogyBriefValidationError } from "@/lib/pedagogy-brief";
import type { JourneyCamera, JourneySpec } from "@/lib/pedagogy-journey-spec";

// Earth journey (gs_theme = journey): every frame is drawn by assets/journey/page.html (three.js) in a hidden browser.
// The camera flies from one row's view to the next while the line is spoken; new glows, arcs and labels fade in.

export const JOURNEY_FPS = 12;
const ORIGIN = "http://frame-journey.local/";

const key = (value: unknown) => JSON.stringify(value);
const ease = (t: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, t)))) / 2;
const unit = (lat: number, lon: number) => { const a = (lat * Math.PI) / 180, b = (lon * Math.PI) / 180; return [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)]; };

/** The camera part-way along a flight: along the great circle, pulling back on long flights and diving in again. */
export function journeyCameraAt(from: JourneyCamera, to: JourneyCamera, t: number): JourneyCamera {
  const e = ease(t), a = unit(from.lat, from.lon), b = unit(to.lat, to.lon);
  const angle = Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  let v = a;
  if (angle > 1e-4) { const s = Math.sin(angle), wa = Math.sin((1 - e) * angle) / s, wb = Math.sin(e * angle) / s; v = a.map((x, i) => wa * x + wb * b[i]); }
  const bump = (angle / Math.PI) * 9 * Math.sin(Math.PI * e);
  return { lat: (Math.asin(Math.max(-1, Math.min(1, v[2]))) * 180) / Math.PI, lon: (Math.atan2(v[1], v[0]) * 180) / Math.PI, distance: from.distance + (to.distance - from.distance) * e + bump, tilt: from.tilt + (to.tilt - from.tilt) * e };
}

export type JourneyFrameState = {
  camera: JourneyCamera;
  effects: { effect: JourneySpec["effects"][number]; k: number }[];
  pins: (JourneySpec["pins"][number] & { k: number })[];
  cardLines: string[];
  cardK: number;
  caption: string;
  ts: string;
  captionK: number;
  badge: string;
  chapters: string[];
  chapterIndex: number;
  notes: { text: string; k: number }[];
  notesTitle: string;
};

/** Frames for one row: a flight (if the camera moves) and fade-ins (if something is new), then the finished view held. */
export function planJourneyRow(spec: JourneySpec, previous: JourneySpec | null, duration: number, chapters: string[]) {
  const span = Math.max(1 / JOURNEY_FPS, duration);
  const from = previous?.camera ?? spec.camera;
  const moved = key(from) !== key(spec.camera);
  const oldEffects = new Set((previous?.effects ?? []).map(key)), oldPins = new Set((previous?.pins ?? []).map(key));
  const sameCard = key(spec.cardLines) === key(previous?.cardLines ?? []);
  const sameCaption = spec.caption === (previous?.caption ?? "");
  // A note is old only if the previous row showed the same note at the same place in the same topic's list.
  const sameNotesTopic = spec.notesTitle === (previous?.notesTitle ?? "");
  const oldNote = (text: string, i: number) => sameNotesTopic && (previous?.notes ?? [])[i] === text;
  const somethingNew = spec.notes.some((text, i) => !oldNote(text, i)) || spec.effects.some((effect) => !oldEffects.has(key(effect))) || spec.pins.some((pin) => !oldPins.has(key(pin))) || !sameCaption || !sameCard;
  const move = moved ? Math.min(2.6, span * 0.55) : 0;
  const reveal = somethingNew ? Math.min(1.1, span * 0.5) : 0;
  const animation = Math.max(move, reveal);
  const count = animation ? Math.max(2, Math.round(animation * JOURNEY_FPS)) : 1;
  const frames: { state: JourneyFrameState; duration: number }[] = [];
  for (let frame = 1; frame <= count; frame += 1) {
    const t = count === 1 ? 1 : frame / count;
    const flight = move ? Math.min(1, (t * animation) / move) : 1;
    // New glows, arcs and labels start fading in halfway through the flight, so the globe is never bare for long.
    const fade = reveal ? Math.min(1, Math.max(0, (t * animation - move * 0.5) / reveal)) : 1;
    frames.push({
      duration: frame === count ? Math.max(1 / JOURNEY_FPS, span - (count - 1) / JOURNEY_FPS) : 1 / JOURNEY_FPS,
      state: {
        camera: moved && flight < 1 ? journeyCameraAt(from, spec.camera, flight) : spec.camera,
        effects: spec.effects.map((effect) => ({ effect, k: oldEffects.has(key(effect)) ? 1 : fade })),
        pins: spec.pins.map((pin) => ({ ...pin, k: oldPins.has(key(pin)) ? 1 : fade })),
        cardLines: spec.cardLines, cardK: sameCard ? 1 : fade,
        caption: spec.caption, ts: spec.sourceTs, captionK: sameCaption ? 1 : Math.min(1, (t * animation) / 0.3),
        badge: spec.badge, chapters, chapterIndex: chapters.indexOf(spec.chapter),
        notes: spec.notes.map((text, i) => ({ text, k: oldNote(text, i) ? 1 : fade })), notesTitle: spec.notesTitle,
      },
    });
  }
  return frames;
}


/** Files the page asks for, all from this repo. */
async function asset(path: string) {
  const root = process.cwd();
  const name = path.replace(/^\/+/, "");
  if (name === "" || name === "page.html") return { body: await readFile(join(root, "assets", "journey", "page.html")), type: "text/html; charset=utf-8" };
  if (name === "three.module.js") return { body: await readFile(join(root, "node_modules", "three", "build", "three.module.js")), type: "text/javascript" };
  if (name === "earth-board.png") return { body: await readFile(join(root, "assets", "journey", "earth-board.png")), type: "image/png" };
  const font = /^fonts\/((itim|kalam)-[a-z0-9-]+\.(woff2?))$/.exec(name);
  if (font) return { body: await readFile(join(root, "assets", "fonts", font[2], font[1])), type: font[3] === "woff2" ? "font/woff2" : "font/woff" };
  return null;
}

/** A hidden browser with the journey page loaded. The browser path that ran is logged. */
export async function openJourneyRenderer(options: { executablePath?: string } = {}) {
  const { chromium } = await import("playwright-core");
  // Bundled Playwright Chromium first, then the Mac's own Google Chrome; GPU first, then software WebGL.
  const attempts: { label: string; launch: () => Promise<Browser> }[] = options.executablePath
    ? [{ label: "given-executable-swiftshader", launch: () => chromium.launch({ executablePath: options.executablePath, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] }) }]
    : [
      { label: "playwright-chromium", launch: () => chromium.launch() },
      { label: "playwright-chromium-swiftshader", launch: () => chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }) },
      { label: "google-chrome", launch: () => chromium.launch({ channel: "chrome" }) },
      { label: "google-chrome-swiftshader", launch: () => chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }) },
    ];
  const failures: string[] = [];
  for (const attempt of attempts) {
    let browser: Browser | null = null;
    try {
      browser = await attempt.launch();
      const page: Page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route(`${ORIGIN}**`, async (route) => {
        const file = await asset(new URL(route.request().url()).pathname).catch(() => null);
        if (!file) return route.fulfill({ status: 404, body: "" });
        return route.fulfill({ status: 200, body: file.body, contentType: file.type });
      });
      await page.goto(`${ORIGIN}page.html`);
      await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 60_000 }).catch(() => {
        throw new Error(errors[0] ?? "the journey page did not finish loading");
      });
      console.info("Pedagogy journey renderer", { path: attempt.label });
      return {
        async frame(state: JourneyFrameState) {
          await page.evaluate((value) => (window as unknown as { renderJourney: (s: unknown) => boolean }).renderJourney(value), state);
          return page.screenshot({ type: "png" });
        },
        close: () => browser!.close(),
      };
    } catch (error) {
      failures.push(`${attempt.label}: ${error instanceof Error ? error.message.split("\n")[0].slice(0, 160) : String(error)}`);
      await browser?.close().catch(() => undefined);
    }
  }
  console.error("Pedagogy journey renderer unavailable", { path: "no-browser", failures });
  throw new PedagogyBriefValidationError("The Earth journey needs a browser to draw the globe. In the FRAME folder run: npx playwright install chromium", { safeReason: "Earth journey browser unavailable." });
}
