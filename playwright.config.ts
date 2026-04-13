import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: "https://app.neverranked.com",
    extraHTTPHeaders: {
      "User-Agent": "NeverRanked-Playwright-Test/1.0",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
