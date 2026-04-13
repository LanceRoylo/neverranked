/**
 * Test 07 — Mobile navigation
 *
 * Verifies: hamburger menu appears on mobile viewport,
 * toggles nav visibility, nav links work on mobile.
 */

import { test, expect } from "@playwright/test";
import { authenticateAs, URLS, TEST_ADMIN_EMAIL } from "./helpers";

test.describe("Mobile navigation", () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone X

  test("hamburger is visible on mobile", async ({ context, page }) => {
    const authed = await authenticateAs(context, TEST_ADMIN_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.cockpit);
    await page.waitForLoadState("networkidle");

    const hamburger = page.locator(".hamburger");
    await expect(hamburger).toBeVisible();
  });

  test("nav links are hidden by default on mobile", async ({
    context,
    page,
  }) => {
    const authed = await authenticateAs(context, TEST_ADMIN_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.cockpit);
    await page.waitForLoadState("networkidle");

    // Nav links container should not have 'open' class initially
    const navLinks = page.locator(".nav-links");
    await expect(navLinks).not.toHaveClass(/open/);
  });

  test("hamburger click opens nav", async ({ context, page }) => {
    const authed = await authenticateAs(context, TEST_ADMIN_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.cockpit);
    await page.waitForLoadState("networkidle");

    // Click hamburger
    await page.locator(".hamburger").click();

    // Nav should now have 'open' class
    const navLinks = page.locator(".nav-links");
    await expect(navLinks).toHaveClass(/open/);

    // Nav items should be visible
    const firstItem = page.locator(".nav-links-item").first();
    await expect(firstItem).toBeVisible();
  });

  test("hamburger click toggles nav closed", async ({ context, page }) => {
    const authed = await authenticateAs(context, TEST_ADMIN_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.cockpit);
    await page.waitForLoadState("networkidle");

    const hamburger = page.locator(".hamburger");
    const navLinks = page.locator(".nav-links");

    // Open
    await hamburger.click();
    await expect(navLinks).toHaveClass(/open/);

    // Close
    await hamburger.click();
    await expect(navLinks).not.toHaveClass(/open/);
  });

  test("mobile nav links navigate correctly", async ({ context, page }) => {
    const authed = await authenticateAs(context, TEST_ADMIN_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.cockpit);
    await page.waitForLoadState("networkidle");

    // Open nav
    await page.locator(".hamburger").click();

    // Click Leads link
    const leadsLink = page.locator('.nav-links-item:has-text("Leads")');
    if ((await leadsLink.count()) > 0) {
      await leadsLink.click();
      await page.waitForLoadState("networkidle");
      expect(page.url()).toContain("/leads");
    }
  });

  test("login page renders correctly on mobile", async ({ page }) => {
    await page.goto(URLS.login);
    await page.waitForLoadState("networkidle");

    // Page should be usable — heading and form visible
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();

    // Form should fit within viewport
    const input = page.locator('input[type="email"]');
    const box = await input.boundingBox();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
    }
  });
});
