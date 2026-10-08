/**
 * Test 05 — Checkout flow
 *
 * The /checkout/{plan} pages sold retired plans. Since 2026-10-07 every
 * /checkout/<plan> route 302s to the public pricing page, which is where
 * the current ladder is sold. These tests pin that redirect.
 */

import { test, expect } from "@playwright/test";
import { URLS } from "./helpers";

const PRICING = "neverranked.com/pricing";

test.describe("Checkout flow", () => {
  for (const [name, url] of [
    ["audit", URLS.checkoutAudit],
    ["signal", URLS.checkoutSignal],
    ["amplify", URLS.checkoutAmplify],
  ] as const) {
    test(`retired ${name} checkout redirects to the pricing page`, async ({ page }) => {
      await page.goto(url, { waitUntil: "commit" });
      await page.waitForLoadState("domcontentloaded");
      expect(page.url()).toContain(PRICING);
    });
  }

  test("checkout success page loads with plan param", async ({ page }) => {
    await page.goto(URLS.checkoutSuccess);
    await page.waitForLoadState("domcontentloaded");

    // Success page should render (even without a real Stripe session)
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("checkout URLs are not behind auth wall", async ({ page }) => {
    // Verify checkout doesn't redirect to /login
    const response = await page.goto(URLS.checkoutAudit, {
      waitUntil: "commit",
    });
    await page.waitForLoadState("domcontentloaded");

    const url = page.url();
    expect(url).not.toContain("/login");
  });
});
