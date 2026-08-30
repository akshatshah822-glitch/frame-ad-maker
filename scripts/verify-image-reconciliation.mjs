import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = "https://frame-ad-maker.vercel.app";
const outputRoot = "artifacts/evidence/frame-v1-variable";
await mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(180_000);
let droppedStoredResponse = false;
let generationId = "";

page.on("response", async (response) => {
  if (response.url().endsWith("/api/generate") && response.request().method() === "POST") {
    try { generationId = (await response.json()).generationId || generationId; } catch {}
  }
});

await page.route("**/api/images", async (route) => {
  const body = JSON.parse(route.request().postData() || "{}");
  if (body.shotNumber === 2 && !droppedStoredResponse) {
    const request = route.request();
    const response = await fetch(request.url(), {
      method: request.method(),
      headers: request.headers(),
      body: request.postData(),
    });
    if (!response.ok) throw new Error(`Real shot-2 request returned ${response.status}`);
    droppedStoredResponse = true;
    await route.abort("failed");
    return;
  }
  await route.continue();
});

await page.goto(`${baseUrl}/#brief`, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.locator("#brief").scrollIntoViewIfNeeded();
await page.getByRole("button", { name: "New Hook", exact: true }).click();
await page.locator('textarea[aria-label="What are we advertising?"]').fill("A compact desk lamp with one warm focus mode for small home workspaces.");
await page.locator('input[aria-label="Who specifically needs to care?"]').fill("People working from small Indian apartments after dark.");
await page.locator('textarea[aria-label="What one thing should they remember?"]').fill("One focused pool of light makes a small desk feel ready for work.");
await page.getByRole("button", { name: /Develop directions/i }).click();
await page.waitForTimeout(11_000);
await page.screenshot({ path: `${outputRoot}/reconciliation-loading-expectation.png` });
await page.waitForSelector(".concept-card", { timeout: 120_000 });
await page.locator(".concept-card").first().getByRole("button", { name: /Choose this direction/i }).click();
await page.waitForSelector(".treatment-shot", { timeout: 180_000 });
await page.waitForFunction(() => document.body.innerText.includes("STORYBOARD READY"), null, { timeout: 900_000 });

if (!droppedStoredResponse) throw new Error("The stored shot-2 response was not dropped");
const failed = await page.locator(".shot-frame-failed").count();
const shots = await page.locator(".treatment-shot").count();
const images = await page.locator(".shot-frame img").count();
if (failed || images !== shots) throw new Error(`Reconciliation failed: ${images}/${shots} images, ${failed} failures`);
await page.screenshot({ path: `${outputRoot}/reconciliation-after-lost-response-desktop.png`, fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: `${outputRoot}/reconciliation-after-lost-response-mobile.png`, fullPage: true });
const result = { generationId, treatmentUrl: `${baseUrl}/treatment/${generationId}`, droppedStoredResponse, shots, images, failed, mobileOverflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth) };
await writeFile(`${outputRoot}/reconciliation-result.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
