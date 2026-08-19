// End-to-end checks for the live NeverRanked surfaces.
// Functional, not just HTTP: verifies the calculator computes and the free
// scanner actually runs a check and returns a grade. Run before deploys.
const { test, expect } = require("@playwright/test");

const SITE = process.env.BASE_URL || "https://neverranked.com";
const CHECK = process.env.CHECK_URL || "https://check.neverranked.com";

// Console-noise we don't care about (analytics, favicons, third-party cookies).
const IGNORE = /favicon|third-party cookie|analytics|gtag|plausible|net::ERR_/i;

test("homepage: loads with no console errors, and shows a price", async ({ page }) => {
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(SITE, { waitUntil: "load" });
  await expect(page).toHaveTitle(/.+/);
  await expect(page.locator("h1").first()).toBeVisible();

  // A visitor must be able to see a price and reach the pricing page without
  // scrolling the whole argument. Before 2026-08-18 neither was true: the
  // nav had no pricing link and the first price sat 79% down the page.
  await expect(page.locator('.nav-links a[href="/pricing/"]')).toBeVisible();
  await expect(page.locator(".hero-price-line")).toContainText("$199");

  const real = errors.filter((e) => !IGNORE.test(e));
  expect(real, "console errors:\n" + real.join("\n")).toEqual([]);
});

test("pricing: the three tiers render and the calculator computes", async ({ page }) => {
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(SITE + "/pricing/", { waitUntil: "load" });
  await expect(page.locator(".tier")).toHaveCount(3);
  await expect(page.getByText("$199", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("$750", { exact: false }).first()).toBeVisible();

  // The value calculator moved here from the homepage on 2026-08-18. It must
  // still recompute on a vertical change, which is the only part of it that
  // can silently break.
  const industry = page.locator("#roi-industry");
  await expect(industry).toBeVisible();
  const amount = page.locator("#roi-amount");
  const before = (await amount.textContent())?.trim();
  await industry.selectOption("medspa");
  await expect(amount).not.toHaveText(before || "__nochange__");

  const real = errors.filter((e) => !IGNORE.test(e));
  expect(real, "console errors:\n" + real.join("\n")).toEqual([]);
});

test("homepage: renders on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(SITE, { waitUntil: "load" });
  await expect(page.locator("h1").first()).toBeVisible();
});

test("cross-category teardown: three-geo finding renders", async ({ page }) => {
  await page.goto(SITE + "/teardowns/cross-category/", { waitUntil: "load" });
  await expect(page.getByText("Nashville", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/geo-dependent continuum/i).first()).toBeVisible();
});

test("internal links resolve (no 4xx/5xx)", async ({ page, request }) => {
  await page.goto(SITE, { waitUntil: "load" });
  const hrefs = await page
    .locator('a[href^="/"]')
    .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("href")).filter((h) => h && !h.startsWith("//")))]);
  const bad = [];
  for (const h of hrefs) {
    const res = await request.get(SITE + h, { maxRedirects: 5 });
    if (res.status() >= 400) bad.push(`${h} -> ${res.status()}`);
  }
  expect(bad, "broken internal links:\n" + bad.join("\n")).toEqual([]);
});

test("free scanner: runs a real check and returns a grade", async ({ page }) => {
  await page.goto(CHECK, { waitUntil: "load" });
  await expect(page.locator("#url-input")).toBeVisible();
  await page.fill("#url-input", "https://example.com");
  await page.click("#run-btn");
  // The grade section appears once the scan completes. We stop here on purpose:
  // do NOT submit the email gate (#gate-email-btn), which would send a report.
  await expect(page.locator("#grade-section")).toBeVisible({ timeout: 45000 });
});
