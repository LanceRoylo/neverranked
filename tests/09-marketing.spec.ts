/**
 * Test 09 -- Marketing site (structural smoke)
 *
 * The /demo feature was retired (every /demo* route now returns 410 Gone) and
 * its tests were removed. The marketing site funnels to the free check tool
 * (check.neverranked.com) and a diagnostic mailto; it intentionally does NOT
 * surface a self-serve checkout, an app CTA, or a client-login link (the
 * cockpit is reached by magic link). These assertions pin the *shape* of that
 * funnel, not the copy -- marketing copy lives downstream of Hello Momentum
 * tastemaking, so pinning phrases here would make the suite the brake on every
 * brand iteration.
 */

import { test, expect } from "@playwright/test";

const MAIN_SITE = "https://neverranked.com";
const CHECK_TOOL = "https://check.neverranked.com";

test.describe("Marketing site -- structure", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(MAIN_SITE);
    await page.waitForLoadState("networkidle");
  });

  test("home has a hero with an h1", async ({ page }) => {
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("home funnels to the free check tool (check.neverranked.com)", async ({ page }) => {
    // The primary conversion path is the free check, not a self-serve checkout.
    const checkLinks = page.locator('a[href*="check.neverranked.com"]');
    expect(await checkLinks.count()).toBeGreaterThan(0);
  });

  test("home has a contact path (mailto or contact form)", async ({ page }) => {
    const mailtos = await page.locator('a[href^="mailto:"]').count();
    const contactForms = await page.locator('form input[type="email"]').count();
    expect(mailtos + contactForms).toBeGreaterThan(0);
  });

  test("home renders a footer with privacy + terms links", async ({ page }) => {
    const privacy = page.locator('a[href*="/privacy"]');
    const terms = page.locator('a[href*="/terms"]');
    expect(await privacy.count()).toBeGreaterThan(0);
    expect(await terms.count()).toBeGreaterThan(0);
  });

  test("home has NeverRanked branding", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("neverranked");
  });

  test("home loads without console errors", async ({ page }) => {
    // Reload with a console listener attached so we see what fired during the
    // actual page load. Cloudflare beacon / favicon 404s are tolerated noise;
    // JS errors are a real regression. 'load' (not 'networkidle') because the
    // homepage has long-lived background streams that never let networkidle
    // fire within the default timeout.
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const t = msg.text();
        if (!/favicon\.ico|cdn-cgi\/rum/.test(t)) errors.push(`console.error: ${t}`);
      }
    });
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(800);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});

test.describe("Free check tool", () => {
  test("check tool loads", async ({ page }) => {
    await page.goto(CHECK_TOOL);
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("check.neverranked.com");
  });
});
