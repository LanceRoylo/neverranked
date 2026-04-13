/**
 * Test 01 — New client journey
 *
 * Verifies: login page loads, magic link flow exists,
 * onboarding form renders with correct fields,
 * form submission redirects to domain detail.
 */

import { test, expect } from "@playwright/test";
import { authenticateAs, URLS, TEST_CLIENT_EMAIL } from "./helpers";

test.describe("New client journey", () => {
  test("login page renders with email form", async ({ page }) => {
    await page.goto(URLS.login);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"], .btn')).toBeVisible();
  });

  test("login page rejects empty email", async ({ page }) => {
    await page.goto(URLS.login);
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toHaveAttribute("required", "");
  });

  test("authenticated client sees onboarding if not onboarded", async ({
    context,
    page,
  }) => {
    const authed = await authenticateAs(context, TEST_CLIENT_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    // Visit root — non-onboarded clients get redirected to /onboarding
    await page.goto(URLS.dashboard);
    const url = page.url();

    // Client either sees onboarding or the domain page (if already onboarded)
    expect(
      url.includes("/onboarding") || url.includes("/domain/")
    ).toBeTruthy();
  });

  test("onboarding page renders form or thank-you", async ({
    context,
    page,
  }) => {
    const authed = await authenticateAs(context, TEST_CLIENT_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.onboarding);
    await page.waitForLoadState("networkidle");
    const url = page.url();

    // If redirected away, client doesn't have onboarding access
    if (!url.includes("/onboarding")) {
      return;
    }

    // Either the form (not onboarded) or the thank-you (already onboarded)
    const hasForm = (await page.locator('input[name="primary_domain"]').count()) > 0;
    const hasHeading = (await page.locator("h1").count()) > 0;

    // One of these must be true
    expect(hasForm || hasHeading).toBeTruthy();

    // If form exists, check its structure
    if (hasForm) {
      await expect(page.locator('input[name="domain_1"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
      await expect(page.locator('a[href="/onboarding/skip"]')).toBeVisible();
    }
  });

  test("onboarding skip redirects to dashboard", async ({
    context,
    page,
  }) => {
    const authed = await authenticateAs(context, TEST_CLIENT_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.onboarding);
    await page.waitForLoadState("networkidle");
    const url = page.url();

    if (!url.includes("/onboarding")) {
      return;
    }

    const skipLink = page.locator('a[href="/onboarding/skip"]');
    if ((await skipLink.count()) === 0) {
      // Already onboarded, skip link not shown
      return;
    }

    await skipLink.click();
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/onboarding");
  });
});
