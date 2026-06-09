// Playwright config for live-site E2E checks. Targets production by default;
// override with BASE_URL / CHECK_URL env vars to point elsewhere.
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: ".",
  timeout: 60000,
  expect: { timeout: 20000 },
  fullyParallel: true,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL || "https://neverranked.com",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
