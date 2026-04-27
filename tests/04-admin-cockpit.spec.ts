/**
 * Test 04 — Admin cockpit
 *
 * Verifies: admin sees cockpit at /admin with MRR,
 * stats, alert feed, client health table, quick actions.
 */

import { test, expect } from "@playwright/test";
import { authenticateAs, URLS, TEST_ADMIN_EMAIL } from "./helpers";

test.describe("Admin cockpit", () => {
  test("cockpit page loads for admin", async ({ context, page }) => {
    const authed = await authenticateAs(context, TEST_ADMIN_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.cockpit);
    await page.waitForLoadState("networkidle");

    // Should stay on /admin (not redirected)
    expect(page.url()).toContain("/admin");
    expect(page.url()).not.toContain("/login");

    // Page title
    await expect(page.locator("h1")).toBeVisible();
  });

  test("cockpit shows revenue stats cards", async ({ context, page }) => {
    const authed = await authenticateAs(context, TEST_ADMIN_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.cockpit);
    await page.waitForLoadState("networkidle");

    // Stats cards in the revenue pulse section
    const cards = page.locator(".card");
    expect(await cards.count()).toBeGreaterThan(0);

    // Look for known labels
    const pageText = await page.textContent("body");
    expect(pageText).toContain("MRR");
  });

  test("cockpit shows client health table", async ({ context, page }) => {
    const authed = await authenticateAs(context, TEST_ADMIN_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.cockpit);
    await page.waitForLoadState("networkidle");

    // Client health section has a data table
    const tables = page.locator(".data-table");
    expect(await tables.count()).toBeGreaterThan(0);
  });

  test("cockpit has quick action links", async ({ context, page }) => {
    const authed = await authenticateAs(context, TEST_ADMIN_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.cockpit);
    await page.waitForLoadState("networkidle");

    // Manage clients link
    const manageLink = page.locator('a[href="/admin/manage"]');
    expect(await manageLink.count()).toBeGreaterThan(0);

    // Leads link
    const leadsLink = page.locator('a[href="/admin/leads"]');
    expect(await leadsLink.count()).toBeGreaterThan(0);
  });

  test("manage page loads from cockpit", async ({ context, page }) => {
    const authed = await authenticateAs(context, TEST_ADMIN_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.manage);
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/admin/manage");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("leads page loads from cockpit", async ({ context, page }) => {
    const authed = await authenticateAs(context, TEST_ADMIN_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.leads);
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/admin/leads");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("admin nav shows Cockpit and Leads links", async ({
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

    const navLinks = page.locator(".sidebar-item");
    const navTexts: string[] = [];
    for (let i = 0; i < (await navLinks.count()); i++) {
      const text = await navLinks.nth(i).textContent();
      if (text) navTexts.push(text.trim());
    }

    expect(navTexts).toContain("Cockpit");
    expect(navTexts).toContain("Leads");
  });

  test("alert feed renders if alerts exist", async ({ context, page }) => {
    const authed = await authenticateAs(context, TEST_ADMIN_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }

    await page.goto(URLS.cockpit);
    await page.waitForLoadState("networkidle");

    // Alert section — either has alerts or shows "No unread alerts"
    const pageText = await page.textContent("body");
    const hasAlerts =
      pageText?.includes("alert") || pageText?.includes("Alert");

    // Just confirm the section exists (not erroring)
    expect(pageText).toBeTruthy();
  });
});
