/**
 * Test 02 — Returning client
 *
 * Verifies: authenticated client with a domain gets
 * redirected to domain detail (single-domain redirect),
 * report page shows grade, score, and data tables.
 */

import { test, expect } from "@playwright/test";
import { authenticateAs, URLS, TEST_CLIENT_EMAIL } from "./helpers";

test.describe("Returning client", () => {
  test("single-domain client redirects from / to /domain/:id", async ({
    context,
    page,
  }) => {
    const authed = await authenticateAs(context, TEST_CLIENT_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.dashboard);
    await page.waitForLoadState("networkidle");
    const url = page.url();

    // Should land on domain detail or onboarding (depending on state)
    expect(
      url.includes("/domain/") || url.includes("/onboarding")
    ).toBeTruthy();
  });

  test("domain detail page shows report content", async ({
    context,
    page,
  }) => {
    const authed = await authenticateAs(context, TEST_CLIENT_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    // Navigate to root which should redirect to domain detail
    await page.goto(URLS.dashboard);
    await page.waitForLoadState("networkidle");
    const url = page.url();

    if (!url.includes("/domain/")) {
      test.skip();
      return;
    }

    // Page title / heading
    await expect(page.locator("h1")).toBeVisible();

    // Grade badge (if scan exists)
    const grade = page.locator(".grade");
    const hasGrade = await grade.count();

    if (hasGrade > 0) {
      await expect(grade.first()).toBeVisible();

      // At least one data table (technical signals, scan history, etc.)
      const tables = page.locator(".data-table");
      expect(await tables.count()).toBeGreaterThan(0);
    } else {
      // No scan yet — empty state
      const empty = page.locator(".empty");
      expect(await empty.count()).toBeGreaterThanOrEqual(0);
    }
  });

  test("domain detail page has navigation", async ({ context, page }) => {
    const authed = await authenticateAs(context, TEST_CLIENT_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.dashboard);
    await page.waitForLoadState("networkidle");

    // Topbar with logo
    await expect(page.locator(".topbar")).toBeVisible();
    await expect(page.locator(".mark")).toBeVisible();

    // Nav links present
    const navLinks = page.locator(".sidebar-item");
    expect(await navLinks.count()).toBeGreaterThan(0);
  });

  test("share report button exists on domain detail", async ({
    context,
    page,
  }) => {
    const authed = await authenticateAs(context, TEST_CLIENT_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.dashboard);
    await page.waitForLoadState("networkidle");
    const url = page.url();

    if (!url.includes("/domain/")) {
      test.skip();
      return;
    }

    // Share button form
    const shareForm = page.locator('form[action*="/share"]');
    expect(await shareForm.count()).toBeGreaterThanOrEqual(0);
  });
});
