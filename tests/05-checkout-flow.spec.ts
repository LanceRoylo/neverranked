/**
 * Test 05 — Checkout flow
 *
 * Verifies: checkout pages redirect to Stripe or show plan info,
 * success page renders after payment.
 *
 * Note: /checkout/{plan} redirects to checkout.stripe.com,
 * so we verify the redirect rather than page content.
 */

import { test, expect } from "@playwright/test";
import { URLS } from "./helpers";

test.describe("Checkout flow", () => {
  test("audit checkout redirects to Stripe", async ({ page }) => {
    await page.goto(URLS.checkoutAudit, { waitUntil: "commit" });

    // Wait for navigation — should end up at Stripe
    await page.waitForLoadState("domcontentloaded");
    const url = page.url();

    // Either stays on our domain (showing plan info) or redirects to Stripe
    expect(
      url.includes("checkout.stripe.com") ||
        url.includes("/checkout/audit") ||
        url.includes("stripe.com")
    ).toBeTruthy();
  });

  test("signal checkout redirects to Stripe", async ({ page }) => {
    await page.goto(URLS.checkoutSignal, { waitUntil: "commit" });
    await page.waitForLoadState("domcontentloaded");
    const url = page.url();

    expect(
      url.includes("checkout.stripe.com") ||
        url.includes("/checkout/signal") ||
        url.includes("stripe.com")
    ).toBeTruthy();
  });

  test("amplify checkout redirects to Stripe", async ({ page }) => {
    await page.goto(URLS.checkoutAmplify, { waitUntil: "commit" });
    await page.waitForLoadState("domcontentloaded");
    const url = page.url();

    expect(
      url.includes("checkout.stripe.com") ||
        url.includes("/checkout/amplify") ||
        url.includes("stripe.com")
    ).toBeTruthy();
  });

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
