import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: process.env.FRAME_TEST_URL ?? "http://127.0.0.1:3002",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: "line",
});
