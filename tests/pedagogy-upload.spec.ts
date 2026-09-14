import { expect, test } from "@playwright/test";

const preview = {
  rows: [
    { sourceRow: 2, questionId: "Q-20", lineNo: 1, sourceTime: "3:54", generatedTimeLabel: "0:00", narration: "Read the expression carefully.", board: "x + y", effectiveBoard: "x + y", emphasis: "x", pauseAfter: "nahi" },
    { sourceRow: 3, questionId: "Q-20", lineNo: 2, sourceTime: "4:00", generatedTimeLabel: "0:06", narration: "We now combine the terms.", board: "", effectiveBoard: "x + y", emphasis: "missing", pauseAfter: "haan" },
    { sourceRow: 4, questionId: "Q-20", lineNo: 3, sourceTime: "4:13", generatedTimeLabel: "0:19", narration: "The answer is x plus y.", board: "Answer: x + y", effectiveBoard: "Answer: x + y", emphasis: "x + y", pauseAfter: "nahi" },
  ],
  warnings: ["Row 3: emphasis \"missing\" does not exist on the current board; no highlight was added."],
  grammarWarnings: [
    "Row 121: grammar warning: Sentence \"कारण है यह।\": missing subject.",
    "Row 121: grammar warning: Sentence \"कारण है यह।\": missing subject.",
  ],
  timingAudit: [
    { sourceRow: 2, sourceTime: "3:54", originalGeneratedTime: 0, originalGeneratedTimeLabel: "0:00", adjustedGeneratedTime: 0, adjustedGeneratedTimeLabel: "0:00", originalAvailableDuration: 6, narrationDuration: 6.55, allocatedDuration: 7.05, addedDuration: 1.05 },
    { sourceRow: 3, sourceTime: "4:00", originalGeneratedTime: 6, originalGeneratedTimeLabel: "0:06", adjustedGeneratedTime: 7.05, adjustedGeneratedTimeLabel: "0:07", originalAvailableDuration: 13, narrationDuration: 2, allocatedDuration: 13, addedDuration: 0 },
    { sourceRow: 4, sourceTime: "4:13", originalGeneratedTime: 19, originalGeneratedTimeLabel: "0:19", adjustedGeneratedTime: 20.05, adjustedGeneratedTimeLabel: "0:20", originalAvailableDuration: null, narrationDuration: 2, allocatedDuration: 2.5, addedDuration: 0 },
  ],
};

test("pedagogy upload previews normalized rows while the manual API remains available", async ({ page }) => {
  const duplicateKeyWarnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Encountered two children with the same key")) duplicateKeyWarnings.push(message.text());
  });
  await page.route("**/api/question/pedagogy/preview", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.fulfill({ json: preview });
  });
  await page.goto("/question");
  await page.setInputFiles('input[type="file"]', { name: "pedagogy-three-rows.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("test workbook") });
  await expect(page.getByText("Checking grammar before narration measurement… 0%")).toBeVisible();
  await expect(page.getByText("Check the teaching timeline.")).toBeVisible();
  await expect(page.getByText("First source timestamp 3:54 maps to video time 0:00.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "0:00" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "x + y" }).first()).toBeVisible();
  await expect(page.getByText("Narration timing audit before assembly")).toBeVisible();
  await expect(page.getByRole("cell", { name: "7.050 s" })).toBeVisible();
  await expect(page.getByText(/Row 3: emphasis/)).toBeVisible();
  await expect(page.getByText('Row 121: grammar warning: Sentence "कारण है यह।": missing subject.')).toHaveCount(2);
  expect(duplicateKeyWarnings).toEqual([]);
  await page.getByRole("tab", { name: "Manual question entry" }).click();
  await expect(page.getByText("Manual question generation stays available.")).toBeVisible();
  const manualRoute = await page.request.post("/api/question/generate", { data: {} });
  expect(manualRoute.status()).toBe(400);
});

test("displays the exact pedagogy render 422 diagnostic", async ({ page }) => {
  await page.route("**/api/question/pedagogy/preview", (route) => route.fulfill({ json: preview }));
  await page.route("**/api/question/pedagogy/render", (route) => route.fulfill({ status: 422, json: {
    error: "Row 42: line_no must be a positive whole number.",
    code: "PEDAGOGY_BRIEF_VALIDATION",
    sourceRow: 42,
  } }));
  await page.goto("/question");
  await page.setInputFiles('input[type="file"]', { name: "pedagogy-three-rows.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("test workbook") });
  await page.getByRole("button", { name: "Generate video" }).click();
  await expect(page.locator("p.error[role=alert]")).toContainText("PEDAGOGY_BRIEF_VALIDATION · Row 42");
  await expect(page.locator("p.error[role=alert]")).toContainText("Row 42: line_no must be a positive whole number.");
});

test("uses the required fallback when a pedagogy render 422 has no JSON diagnostic", async ({ page }) => {
  await page.route("**/api/question/pedagogy/preview", (route) => route.fulfill({ json: preview }));
  await page.route("**/api/question/pedagogy/render", (route) => route.fulfill({ status: 422, body: "" }));
  await page.goto("/question");
  await page.setInputFiles('input[type="file"]', { name: "pedagogy-three-rows.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("test workbook") });
  await page.getByRole("button", { name: "Generate video" }).click();
  await expect(page.locator("p.error[role=alert]")).toContainText("PEDAGOGY_RENDER_FAILED");
  await expect(page.locator("p.error[role=alert]")).toContainText("Render failed with HTTP 422, but the server returned no diagnostic details.");
});
