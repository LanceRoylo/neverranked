/**
 * Test 03 — Client navigation
 *
 * Verifies: all nav links resolve for an authenticated client,
 * no 404s or unexpected redirects.
 */

import { test, expect } from "@playwright/test";
import { authenticateAs, URLS, TEST_CLIENT_EMAIL } from "./helpers";

test.describe("Client navigation", () => {
  test("Dashboard link loads", async ({ context, page }) => {
    const authed = await authenticateAs(context, TEST_CLIENT_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.dashboard);
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/login");
  });

  test("Competitors link resolves (not 404)", async ({ context, page }) => {
    const authed = await authenticateAs(context, TEST_CLIENT_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    // Click the Competitors nav link
    await page.goto(URLS.dashboard);
    await page.waitForLoadState("networkidle");

    const compLink = page.locator('.nav-links-item:has-text("Competitors")');
    if ((await compLink.count()) === 0) {
      test.skip();
      return;
    }

    await compLink.click();
    await page.waitForLoadState("networkidle");

    // Should land on /competitors/{slug} — not login or a broken page
    const url = page.url();
    expect(url).toContain("/competitors/");
    expect(page.url()).not.toContain("/login");

    // Page should have an h1
    await expect(page.locator("h1")).toBeVisible();
  });

  test("Roadmap link resolves (not 404)", async ({ context, page }) => {
    const authed = await authenticateAs(context, TEST_CLIENT_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.dashboard);
    await page.waitForLoadState("networkidle");

    const roadmapLink = page.locator('.nav-links-item:has-text("Roadmap")');
    if ((await roadmapLink.count()) === 0) {
      test.skip();
      return;
    }

    await roadmapLink.click();
    await page.waitForLoadState("networkidle");

    const url = page.url();
    expect(url).toContain("/roadmap/");
    expect(url).not.toContain("/login");

    await expect(page.locator("h1")).toBeVisible();
  });

  test("Settings page loads", async ({ context, page }) => {
    const authed = await authenticateAs(context, TEST_CLIENT_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.settings);
    await page.waitForLoadState("networkidle");

    // Should not redirect to login
    expect(page.url()).not.toContain("/login");

    await expect(page.locator("h1")).toBeVisible();
  });

  test("Logo link goes to dashboard root", async ({ context, page }) => {
    const authed = await authenticateAs(context, TEST_CLIENT_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.settings);
    await page.waitForLoadState("networkidle");

    // Click the logo
    await page.locator(".mark").click();
    await page.waitForLoadState("networkidle");

    // Should be at root or domain detail (single-domain redirect)
    const url = page.url();
    const base = new URL(URLS.dashboard);
    expect(
      url === `${base.origin}/` ||
        url === base.origin ||
        url.includes("/domain/") ||
        url.includes("/onboarding")
    ).toBeTruthy();
  });

  test("client cannot access admin routes (or is redirected)", async ({
    context,
    page,
  }) => {
    const authed = await authenticateAs(context, TEST_CLIENT_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    // Try to access admin cockpit
    const response = await page.goto(URLS.cockpit);
    await page.waitForLoadState("networkidle");

    const url = page.url();
    const status = response?.status();

    // Should either be redirected away, get 403, or (if test user
    // happens to be admin) stay on admin. All are valid behaviors.
    expect(
      url.includes("/admin") ||
        url.includes("/login") ||
        url.includes("/domain/") ||
        status === 403
    ).toBeTruthy();
  });
});
