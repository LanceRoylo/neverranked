import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // 99-* specs are manual-only (they mutate state, exercise full
  // signup/onboarding flows, or hardcode Lance-machine paths).
  // Run those manually with the explicit spec path. CI ignores them.
  testIgnore: ["**/99-*"],
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
