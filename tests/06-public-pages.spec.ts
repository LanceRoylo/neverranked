/**
 * Test 06 — Public pages
 *
 * Verifies: login page, checkout pages, and shared reports
 * are accessible without authentication.
 */

import { test, expect } from "@playwright/test";
import { URLS } from "./helpers";

test.describe("Public pages", () => {
  test("login page is accessible", async ({ page }) => {
    await page.goto(URLS.login);
    await page.waitForLoadState("networkidle");

    // Should stay on login, not redirect
    expect(page.url()).toContain("/login");

    // Has a heading
    await expect(page.locator("h1")).toBeVisible();

    // Has email input
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("login page has NeverRanked branding", async ({ page }) => {
    await page.goto(URLS.login);
    await page.waitForLoadState("networkidle");

    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("neverranked");
  });

  test("unauthenticated root redirects to login", async ({ page }) => {
    await page.goto(URLS.dashboard);
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/login");
  });

  test("checkout pages are public (no auth required)", async ({ page }) => {
    const checkoutUrls = [
      URLS.checkoutAudit,
      URLS.checkoutSignal,
      URLS.checkoutAmplify,
    ];

    for (const url of checkoutUrls) {
      await page.goto(url);
      await page.waitForLoadState("domcontentloaded");

      // Should NOT redirect to login
      expect(page.url()).not.toContain("/login");
    }
  });

  test("main site loads", async ({ page }) => {
    await page.goto(URLS.mainSite);
    await page.waitForLoadState("networkidle");

    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("neverranked");
  });

  test("main site has a Free AI check CTA", async ({ page }) => {
    await page.goto(URLS.mainSite);
    await page.waitForLoadState("networkidle");

    // The marketing site's primary CTA is the free check tool. There is
    // intentionally no client-login link here -- the cockpit is reached by a
    // magic link emailed to signed customers, not via a homepage login.
    const checkCta = page.locator('a[href*="check.neverranked.com"]');
    expect(await checkCta.count()).toBeGreaterThan(0);
  });

  test("404 page returns for unknown routes", async ({ page }) => {
    const response = await page.goto(
      "https://app.neverranked.com/this-page-does-not-exist-xyz"
    );

    // Should get a 404 or redirect to login
    const status = response?.status();
    const url = page.url();

    expect(
      status === 404 || url.includes("/login")
    ).toBeTruthy();
  });
});
