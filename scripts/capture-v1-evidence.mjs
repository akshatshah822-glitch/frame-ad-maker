import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.FRAME_E2E_URL || "https://frame-ad-maker.vercel.app";
const outputRoot = "artifacts/evidence/frame-v1";
await mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(20_000);

async function capture(name, fullPage = false) {
  await page.screenshot({ path: `${outputRoot}/${name}.png`, fullPage });
}

async function captureBoth(name, fullPage = false) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture(`${name}-desktop`, fullPage);
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(`${name}-mobile`, fullPage);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error(`${name}: horizontal overflow at 390px`);
  await page.setViewportSize({ width: 1440, height: 1000 });
}

async function openHome() {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".launch-copy h1");
}

async function fillBrief(intent) {
  await page.locator("#brief").scrollIntoViewIfNeeded();
  if (intent === "cinematic") await page.locator(".intent-choice").nth(1).click();
  else await page.locator(".intent-choice").nth(0).click();

  if (intent === "performance") {
    await page.getByRole("button", { name: "Product Proof", exact: true }).click();
    await page.locator('textarea[aria-label="What are we advertising?"]').fill("A vitamin C serum that gives visible glow without a complicated routine.");
    await page.locator('input[aria-label="Who specifically needs to care?"]').fill("Indian women aged 21–30 managing busy workdays and recurring dullness.");
    await page.locator('textarea[aria-label="What one thing should they remember?"]').fill("Visible glow can come from one credible, easy daily step.");
  } else {
    await page.locator('textarea[aria-label="What\'s the story about?"]').fill("A 24-year-old working SSC aspirant returns home at 8 PM and studies quietly while the city sleeps.");
    await page.locator('input[aria-label="Who is this for?"]').fill("Working Indian exam aspirants balancing a full-time job with nightly preparation.");
    await page.locator('textarea[aria-label="What should they feel or remember?"]').fill("Quiet consistency can change the direction of a life.");
    await page.locator('input[aria-label="Character, setting or cultural detail to preserve"]').fill("A modest Jaipur family home, office clothes, dignity and specificity; no pity imagery.");
  }
}

async function runJourney(intent) {
  await openHome();
  await captureBoth(`${intent}-01-landing`);
  await fillBrief(intent);
  await captureBoth(`${intent}-02-intent-and-brief`, true);

  let generationId = null;
  page.on("response", async (response) => {
    if (response.url().endsWith("/api/generate") && response.request().method() === "POST") {
      try { generationId = (await response.json()).generationId || generationId; } catch {}
    }
  });

  await page.getByRole("button", { name: /Develop directions/i }).click();
  await page.waitForSelector(".concept-card", { timeout: 120_000 });
  if (await page.locator(".concept-card").count() !== 3) throw new Error(`${intent}: expected exactly 3 concept cards`);
  await captureBoth(`${intent}-03-three-concepts`, true);

  const firstConcept = page.locator(".concept-card").first();
  await firstConcept.getByRole("button", { name: /Choose this direction/i }).click();
  await page.waitForTimeout(250);
  await captureBoth(`${intent}-04-selected-concept`);

  await page.waitForSelector(".treatment-shot", { timeout: 180_000 });
  const shotCount = await page.locator(".treatment-shot").count();
  if (shotCount < 4 || shotCount > 8) throw new Error(`${intent}: expected 4–8 shots, received ${shotCount}`);
  await captureBoth(`${intent}-05-dynamic-storyboard`, true);

  await page.waitForFunction(() => document.body.innerText.includes("STORYBOARD READY"), null, { timeout: 900_000 });
  const completeFrames = await page.locator('.shot-frame[data-status="complete"]').count();
  const failedFrames = await page.locator('.shot-frame[data-status="failed"]').count();
  const actions = {
    copy: await page.getByRole("button", { name: /Copy treatment/i }).count(),
    pdf: await page.getByRole("button", { name: /Download PDF/i }).count(),
    share: await page.getByRole("button", { name: /Share link/i }).count(),
    restart: await page.getByRole("button", { name: /Start over|Make another/i }).count(),
  };
  await captureBoth(`${intent}-06-generated-frames-and-actions`, true);

  return { intent, generationId, shotCount, completeFrames, failedFrames, actions };
}

const results = [];
try {
  results.push(await runJourney("performance"));
  results.push(await runJourney("cinematic"));
  console.log(JSON.stringify({ baseUrl, results }, null, 2));
} finally {
  await browser.close();
}
