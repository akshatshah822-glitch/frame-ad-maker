import { expect, test } from "@playwright/test";

const treatmentId = process.env.FRAME_TREATMENT_ID ?? "j578ghnpfa9dwjdtypjks1f6tx8dd3n5";

async function expectNoOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectTouchTargets(page: import("@playwright/test").Page) {
  const tooSmall = await page.locator("button:visible, a:visible, summary:visible").evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { text: (element.textContent ?? "").trim().slice(0, 60), width: rect.width, height: rect.height };
  }).filter((item) => item.width < 44 || item.height < 44));
  expect(tooSmall).toEqual([]);
}

for (const width of [320, 375, 390, 430]) {
  test(`brief controls fit and remain tappable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expectNoOverflow(page);
    await expectTouchTargets(page);
  });

  test(`treatment fits and remains tappable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/treatment/${treatmentId}`);
    await expect(page.getByText("STORYBOARD READY", { exact: true })).toBeVisible();
    await expect(page.locator("summary").filter({ hasText: "View shot details" })).toHaveCount(6);
    await expectNoOverflow(page);
    await expectTouchTargets(page);
  });
}

test("concept generation explains the wait and can return safely", async ({ page }) => {
  await page.route("**/api/concepts", async (route) => new Promise<void>((resolve) => setTimeout(async () => { await route.abort(); resolve(); }, 15_000)));
  await page.goto("/");
  await page.getByLabel("What are we advertising?").fill("A considered everyday coffee");
  await page.getByLabel("Who specifically needs to care?").fill("Creative teams working through the afternoon");
  await page.getByLabel("What one thing should they remember?").fill("Good coffee can reset the whole day");
  await page.getByRole("button", { name: "Develop directions" }).click();
  await expect(page.getByText("READING YOUR BRIEF")).toBeVisible();
  await expect(page.getByText("DRAFTING CREATIVE TERRITORIES")).toBeVisible({ timeout: 6_000 });
  await page.getByRole("button", { name: "Back to brief" }).click();
  await expect(page.getByText("DRAFTING CREATIVE TERRITORIES")).not.toBeVisible();
  await expect(page.getByLabel("What are we advertising?")).toHaveValue("A considered everyday coffee");
});

test("shared treatment exposes concise cards, details, copy, share, and PDF", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/treatment/${treatmentId}`);
  await expect(page.locator(".shot-summary")).toHaveCount(6);
  await expect(page.locator(".shot-summary section")).toHaveCount(18);
  await expect(page.locator(".shot-frame img")).toHaveCount(6);
  for (const image of await page.locator(".shot-frame img").all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBeTruthy();
  }
  await page.locator("summary").filter({ hasText: "View shot details" }).first().click();
  await expect(page.getByText("IMAGE GENERATION DETAILS").first()).toBeVisible();
  await page.getByRole("button", { name: /Copy treatment/i }).click();
  await expect(page.getByText("Treatment copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("SHOT 06 — BRAND ENDING");
  await page.getByRole("button", { name: "Share link" }).click();
  await expect(page.getByText("Share link copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`/treatment/${treatmentId}`);
  const response = await page.request.get(`/api/treatments/${treatmentId}/pdf`);
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"]).toContain("application/pdf");
  expect((await response.body()).subarray(0, 4).toString()).toBe("%PDF");
});

test("real-video request saves and confirms from a completed treatment", async ({ page }) => {
  await page.goto(`/treatment/${treatmentId}`);
  await page.getByRole("button", { name: "Get this as a real video, ₹200, delivered in 24h" }).click();
  await page.getByLabel("Email").fill("codex-video-request-test@example.com");
  await page.getByLabel("Brand name").fill("FRAME E2E TEST");
  await expect(page.getByLabel("Storyboard ID")).toHaveValue(treatmentId);
  await page.getByRole("button", { name: "REQUEST REAL VIDEO" }).click();
  await expect(page.getByText("REQUEST RECEIVED")).toBeVisible();
  await expect(page.getByText("We’ll email you about your 24-hour video delivery.")).toBeVisible();
});

test("one failed frame ends in an accurate usable completion state", async ({ page }) => {
  const concept = { conceptName: "The Quiet Reset", idea: "One sip restores order to a noisy afternoon.", hook: "A desk freezes mid-chaos.", story: "A tired team pauses. The product resets the room. Work resumes with clarity.", productRole: "The product creates the reset.", visualWorld: "A tactile office in warm afternoon light.", ending: "The room moves in rhythm again." };
  await page.route("**/api/concepts", (route) => route.fulfill({ json: { concepts: [concept, { ...concept, conceptName: "Made With Patience" }, { ...concept, conceptName: "Pause Button" }] } }));
  const shots = Array.from({ length: 6 }, (_, index) => ({
    shotNumber: index + 1, startTime: [0, 3, 7, 12, 18, 25][index], endTime: [3, 7, 12, 18, 25, 30][index], purpose: ["HOOK", "TENSION", "PRODUCT", "PROOF / ESCALATION", "PAYOFF", "BRAND ENDING"][index],
    displayVisual: `A clear visual direction for shot ${index + 1}.`, displayCamera: "50mm medium · slow push-in", displayAction: "The subject completes one clear action.",
    visualDescription: "A detailed production-ready visual description.", subjectAction: "The subject completes one clear action.", cameraFraming: "Medium", cameraAngle: "Eye level", lensSuggestion: "50mm", cameraMovement: "Slow push-in", lighting: "Motivated window light", audio: "Natural room tone", voiceoverOrDialogue: "", productPresence: "Product remains consistent", locationAndProps: "One continuous office set", imagePrompt: "A complete image prompt", imageStatus: "pending",
  }));
  await page.route("**/api/generate", (route) => route.fulfill({ json: { saved: true, generationId: treatmentId, generation: { title: "The Quiet Reset", duration: "30 seconds", visualBible: { subject: "One consistent protagonist", product: "One consistent product", location: "One office", colorPalette: ["ink", "paper"], lighting: "Window light", cinematography: "Measured 50mm photography", texture: "Natural materials", continuityLocks: ["Same subject", "Same product"] }, shots } } }));
  await page.route("**/api/images", async (route) => {
    const body = route.request().postDataJSON() as { shotNumber: number };
    if (body.shotNumber === 4) await route.fulfill({ status: 502, json: { error: "This frame couldn't be rendered." } });
    else await route.fulfill({ json: { imageUrl: "/window.svg", imageStatus: "complete" } });
  });
  await page.goto("/");
  await page.getByLabel("What are we advertising?").fill("Frame Coffee");
  await page.getByLabel("Who specifically needs to care?").fill("Creative teams");
  await page.getByLabel("What one thing should they remember?").fill("One sip resets the afternoon");
  await page.getByRole("button", { name: "Develop directions" }).click();
  await page.getByRole("button", { name: /Choose this direction/ }).first().click();
  await expect(page.getByText("STORYBOARD READY · 5/6 FRAMES")).toBeVisible();
  await expect(page.getByText("One frame couldn't be rendered.")).toBeVisible();
  await expect(page.getByText("FRAME IS DEVELOPING YOUR FILM")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry frame" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Copy treatment/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share link" })).toBeVisible();
});

test("a saved ID replaces the landing URL before storyboard frames render", async ({ page }) => {
  const concept = { conceptName: "The Quiet Reset", idea: "One sip restores order to a noisy afternoon.", hook: "A desk freezes mid-chaos.", story: "A tired team pauses. The product resets the room. Work resumes with clarity.", productRole: "The product creates the reset.", visualWorld: "A tactile office in warm afternoon light.", ending: "The room moves in rhythm again." };
  const shots = Array.from({ length: 6 }, (_, index) => ({
    shotNumber: index + 1, startTime: [0, 3, 7, 12, 18, 25][index], endTime: [3, 7, 12, 18, 25, 30][index], purpose: ["HOOK", "TENSION", "PRODUCT", "PROOF / ESCALATION", "PAYOFF", "BRAND ENDING"][index],
    displayVisual: `A clear visual direction for shot ${index + 1}.`, displayCamera: "50mm medium · slow push-in", displayAction: "The subject completes one clear action.",
    visualDescription: "A detailed production-ready visual description.", subjectAction: "The subject completes one clear action.", cameraFraming: "Medium", cameraAngle: "Eye level", lensSuggestion: "50mm", cameraMovement: "Slow push-in", lighting: "Motivated window light", audio: "Natural room tone", voiceoverOrDialogue: "", productPresence: "Product remains consistent", locationAndProps: "One continuous office set", imagePrompt: "A complete image prompt", imageStatus: "pending",
  }));
  let imageRequests = 0;
  await page.route("**/api/runs", (route) => route.fulfill({ json: { runId: "test-run" } }));
  await page.route("**/api/concepts", (route) => route.fulfill({ json: { concepts: [concept, { ...concept, conceptName: "Made With Patience" }, { ...concept, conceptName: "Pause Button" }] } }));
  await page.route("**/api/generate", (route) => route.fulfill({ json: { saved: true, generationId: treatmentId, generation: { title: "The Quiet Reset", duration: "30 seconds", visualBible: { subject: "One consistent protagonist", product: "One consistent product", location: "One office", colorPalette: ["ink", "paper"], lighting: "Window light", cinematography: "Measured 50mm photography", texture: "Natural materials", continuityLocks: ["Same subject", "Same product"] }, shots } } }));
  await page.route("**/api/images", (route) => { imageRequests += 1; return route.fulfill({ json: { imageUrl: "/window.svg", imageStorageId: `storage-${imageRequests}`, imageStatus: "complete" } }); });
  await page.route("**/api/video/status", (route) => route.fulfill({ json: { production: null } }));
  await page.goto("/");
  await page.getByLabel("What are we advertising?").fill("Frame Coffee");
  await page.getByLabel("Who specifically needs to care?").fill("Creative teams");
  await page.getByLabel("What one thing should they remember?").fill("One sip resets the afternoon");
  await page.getByRole("button", { name: "Develop directions" }).click();
  await page.getByRole("button", { name: /Choose this direction/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/treatment/${treatmentId}$`));
  await expect.poll(() => imageRequests).toBe(6);
  await expect(page.getByText("All six frames are ready. Start AI animatic preview production when you’re ready.")).toBeVisible();
});

test("a missing saved ID stays retryable and never draws storyboard frames", async ({ page }) => {
  const concept = { conceptName: "The Quiet Reset", idea: "One sip restores order to a noisy afternoon.", hook: "A desk freezes mid-chaos.", story: "A tired team pauses. The product resets the room. Work resumes with clarity.", productRole: "The product creates the reset.", visualWorld: "A tactile office in warm afternoon light.", ending: "The room moves in rhythm again." };
  const shots = Array.from({ length: 6 }, (_, index) => ({ shotNumber: index + 1, imagePrompt: `Prompt ${index + 1}`, imageStatus: "pending" }));
  let generateRequests = 0;
  let imageRequests = 0;
  await page.route("**/api/runs", (route) => route.fulfill({ json: { runId: "test-run" } }));
  await page.route("**/api/concepts", (route) => route.fulfill({ json: { concepts: [concept, { ...concept, conceptName: "Made With Patience" }, { ...concept, conceptName: "Pause Button" }] } }));
  await page.route("**/api/generate", (route) => { generateRequests += 1; return route.fulfill({ json: { saved: true, generation: { title: "The Quiet Reset", duration: "30 seconds", visualBible: {}, shots } } }); });
  await page.route("**/api/images", (route) => { imageRequests += 1; return route.abort(); });
  await page.goto("/");
  await page.getByLabel("What are we advertising?").fill("Frame Coffee");
  await page.getByLabel("Who specifically needs to care?").fill("Creative teams");
  await page.getByLabel("What one thing should they remember?").fill("One sip resets the afternoon");
  await page.getByRole("button", { name: "Develop directions" }).click();
  await page.getByRole("button", { name: /Choose this direction/ }).first().click();
  await expect(page.locator("p.concepts-error")).toContainText("We could not save this treatment. Retry.");
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => imageRequests).toBe(0);
  await expect(page.getByText("All six frames are ready. Start AI animatic preview production when you’re ready.")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry failed step" }).click();
  await expect.poll(() => generateRequests).toBe(2);
  await expect.poll(() => imageRequests).toBe(0);
});
