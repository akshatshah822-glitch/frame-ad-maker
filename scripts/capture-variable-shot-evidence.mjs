import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const baseUrl = "https://frame-ad-maker.vercel.app";
const qaToken = (await readFile("/tmp/frame_qa_token", "utf8")).trim();
const outputRoot = "artifacts/evidence/frame-v1-variable";
await mkdir(outputRoot, { recursive: true });

const runs = [
  {
    name: "performance-5-shot",
    count: 5,
    brief: {
      intent: "performance",
      brandProduct: "A modular insulated lunch box with leak-resistant compartments for weekday office commutes.",
      audience: "Indian office commuters who carry homemade lunches on crowded daily journeys.",
      proposition: "Lunch stays organised, intact and ready when the workday pauses.",
      platform: "Instagram / Reels",
      visualTones: ["Raw", "Minimal"],
      testObjective: "Product Proof",
      testObjectiveOther: "",
      preserveDetails: "",
    },
  },
  {
    name: "cinematic-7-shot",
    count: 7,
    brief: {
      intent: "cinematic",
      brandProduct: "A government-school teacher studies for a state administrative exam before dawn, then teaches her class by day.",
      audience: "Working Indian exam aspirants carrying responsibility while preparing for a different future.",
      proposition: "The work nobody sees can quietly change the life everyone sees.",
      platform: "Instagram / Reels",
      visualTones: ["Cinematic", "Emotional"],
      preserveDetails: "A dignified teacher in a modest Lucknow home and government classroom; no pity imagery or melodrama.",
    },
  },
];

async function jsonRequest(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${body.error || "Unknown error"}`);
  return body;
}

function unsafeProof(value) {
  const text = JSON.stringify(value);
  return /clinically|dermatologists?|consumer[- ]?trial|certified|testimonial|five[- ]star|real users? (?:say|report)|\b\d+(?:\.\d+)?%/i.test(text);
}

async function persistedTreatment(id) {
  return (await jsonRequest(`/api/treatments/${id}`, { cache: "no-store" })).treatment;
}

async function renderShot(run, id, shot, deliberatelyFailFirst = false) {
  if (deliberatelyFailFirst) {
    const failed = await fetch(`${baseUrl}/api/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imagePrompt: "", platform: run.brief.platform, shotNumber: shot.shotNumber, generationId: id }),
    });
    if (failed.status !== 400) throw new Error(`${run.name}: deliberate invalid frame did not fail safely`);
  }

  try {
    const response = await fetch(`${baseUrl}/api/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imagePrompt: shot.imagePrompt, platform: run.brief.platform, shotNumber: shot.shotNumber, generationId: id }),
    });
    if (response.ok) return { retried: deliberatelyFailFirst, reconciled: false };
  } catch {}

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const stored = await persistedTreatment(id);
    const persistedShot = stored.generation.shots.find((item) => item.shotNumber === shot.shotNumber);
    if (persistedShot?.imageStatus === "complete" && persistedShot.imageUrl) return { retried: deliberatelyFailFirst, reconciled: true };
  }
  throw new Error(`${run.name}: shot ${shot.shotNumber} did not render or reconcile`);
}

async function verifyTreatmentPage(run, id) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/treatment/${id}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(1200);
  for (const shot of await page.locator(".treatment-shot").all()) {
    await shot.scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
  }
  await page.screenshot({ path: `${outputRoot}/${run.name}-desktop.png`, fullPage: true });
  const desktop = {
    shots: await page.locator(".treatment-shot").count(),
    images: await page.locator(".shot-frame img").count(),
    videoGate: await page.getByText(/Turn these frames into a finished ad/i).count(),
  };

  await page.getByRole("button", { name: /Copy treatment/i }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  await page.getByRole("button", { name: /Share link/i }).click();
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  const pdfHref = await page.getByRole("link", { name: /Download PDF/i }).getAttribute("href");
  const pdfResponse = await page.request.get(new URL(pdfHref, page.url()).href);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  for (const shot of await page.locator(".treatment-shot").all()) {
    await shot.scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
  }
  await page.screenshot({ path: `${outputRoot}/${run.name}-mobile.png`, fullPage: true });
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  await browser.close();

  return {
    ...desktop,
    copied: copied.startsWith("FRAME") && copied.includes(`SHOT ${String(run.count).padStart(2, "0")}`),
    shared: shared === `${baseUrl}/treatment/${id}`,
    pdfStatus: pdfResponse.status(),
    pdfType: pdfResponse.headers()["content-type"],
    mobileOverflow,
  };
}

const results = [];
for (const run of runs) {
  console.log(`${run.name}: generating concepts`);
  const conceptResult = await jsonRequest("/api/concepts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(run.brief),
  });
  if (conceptResult.concepts.length !== 3 || unsafeProof(conceptResult.concepts)) throw new Error(`${run.name}: concepts failed count or proof safety`);

  console.log(`${run.name}: generating exact ${run.count}-shot storyboard`);
  const generationResult = await jsonRequest("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-frame-qa-token": qaToken },
    body: JSON.stringify({ ...run.brief, selectedConcept: conceptResult.concepts[0], qaTargetShotCount: run.count }),
  });
  const { generation, generationId } = generationResult;
  if (!generationId || generation.shots.length !== run.count) throw new Error(`${run.name}: expected ${run.count} shots, received ${generation.shots.length}`);
  if (unsafeProof(generation)) throw new Error(`${run.name}: storyboard contains unsupported proof`);
  if (generation.shots.some((shot) => !shot.imagePrompt.includes("No collage, no montage grid, no contact sheet, no split screen, no multi-panel layout, no storyboard sheet."))) throw new Error(`${run.name}: single-frame lock missing`);

  const renderResults = [];
  for (const shot of generation.shots) {
    console.log(`${run.name}: rendering shot ${shot.shotNumber}/${run.count}`);
    renderResults.push(await renderShot(run, generationId, shot, shot.shotNumber === 2));
  }

  const stored = await persistedTreatment(generationId);
  if (stored.generation.shots.length !== run.count || stored.generation.shots.some((shot) => shot.imageStatus !== "complete" || !shot.imageUrl)) throw new Error(`${run.name}: persistence is incomplete`);
  const pageEvidence = await verifyTreatmentPage(run, generationId);
  if (pageEvidence.shots !== run.count || pageEvidence.images !== run.count || pageEvidence.videoGate || !pageEvidence.copied || !pageEvidence.shared || pageEvidence.pdfStatus !== 200 || pageEvidence.pdfType !== "application/pdf" || pageEvidence.mobileOverflow) throw new Error(`${run.name}: treatment-page verification failed`);
  results.push({ name: run.name, generationId, treatmentUrl: `${baseUrl}/treatment/${generationId}`, shotCount: run.count, renderResults, pageEvidence });
}

await writeFile(`${outputRoot}/results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
