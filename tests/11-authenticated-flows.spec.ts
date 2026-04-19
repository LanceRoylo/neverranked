/**
 * Test 11 -- Authenticated agency flows
 *
 * Covers surfaces only visible after login, using the long-lived
 * session for e2e-tests@neverranked.com (an agency_admin of the
 * e2e-test-agency seeded by dashboard/scripts/seed-e2e-test-session.sql).
 *
 * The session token comes from PLAYWRIGHT_SESSION_TOKEN in CI, or from
 * a wrangler D1 query locally (see helpers.ts). If neither is set,
 * every test in this file is auto-skipped so the suite stays green
 * for contributors who haven't seeded a token yet.
 *
 * SAFETY: every test below is read-only. We GET pages and assert on
 * what's visible. No POST forms, no Stripe calls, no DB writes. Adding
 * a mutating test here would be a regression -- the test user is
 * shared across runs and would accumulate garbage.
 */

import { test, expect } from "@playwright/test";
import { authenticateAs, E2E_TEST_AGENCY_ADMIN_EMAIL, E2E_TEST_AGENCY_SLUG, getSessionForUser } from "./helpers";

const APP = "https://app.neverranked.com";

// Skip every test in this file if no test session is available
// (contributor running locally without seeding, or CI secret missing).
const sessionAvailable = !!getSessionForUser(E2E_TEST_AGENCY_ADMIN_EMAIL);
test.skip(!sessionAvailable, "PLAYWRIGHT_SESSION_TOKEN not set and no local D1 session for e2e-tests user");

test.describe("Agency dashboard (authenticated)", () => {
  test.beforeEach(async ({ context }) => {
    const ok = await authenticateAs(context, E2E_TEST_AGENCY_ADMIN_EMAIL);
    expect(ok, "test-user authentication failed").toBe(true);
  });

  test("/agency renders the agency dashboard with the agency name", async ({ page }) => {
    const res = await page.goto(`${APP}/agency`);
    expect(res?.status()).toBeLessThan(400);
    await page.waitForLoadState("networkidle");

    const body = await page.textContent("body");
    // Agency name from the seed script.
    expect(body).toContain("E2E Test Agency");
  });

  test("/agency shows the action-bar buttons", async ({ page }) => {
    await page.goto(`${APP}/agency`);
    await page.waitForLoadState("networkidle");

    // Each is wired in the routes/agency.ts header.
    await expect(page.locator('a[href="/agency/clients/new"]:has-text("Add a client")')).toBeVisible();
    await expect(page.locator('a[href="/agency/invites"]:has-text("Invites")')).toBeVisible();
    await expect(page.locator('a[href="/agency/settings"]:has-text("Settings")')).toBeVisible();
    await expect(page.locator('a[href="/agency/billing"]:has-text("Billing")')).toBeVisible();
  });

  test("/agency/clients/new renders the add-client form", async ({ page }) => {
    const res = await page.goto(`${APP}/agency/clients/new`);
    expect(res?.status()).toBeLessThan(400);
    await page.waitForLoadState("networkidle");

    // The form OR the "activate subscription first" landing -- both are valid
    // states for an agency without a Stripe subscription. Either way the
    // route must render without erroring.
    const body = await page.textContent("body");
    const hasForm = await page.locator('form[action="/agency/clients/new"]').count() > 0;
    const hasBillingPrompt = (body || "").toLowerCase().includes("activate your subscription");
    expect(hasForm || hasBillingPrompt).toBe(true);
  });

  test("/agency/invites renders the invites page", async ({ page }) => {
    const res = await page.goto(`${APP}/agency/invites`);
    expect(res?.status()).toBeLessThan(400);
    await page.waitForLoadState("networkidle");

    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("invite");
    // Two distinct forms (teammate, client) per the routes/agency-invites.ts spec.
    await expect(page.locator('form[action="/agency/invites/teammate"]')).toBeVisible();
    await expect(page.locator('form[action="/agency/invites/client"]')).toBeVisible();
  });

  test("/agency/settings renders branding controls", async ({ page }) => {
    const res = await page.goto(`${APP}/agency/settings`);
    expect(res?.status()).toBeLessThan(400);
    await page.waitForLoadState("networkidle");

    // Inputs from agency-settings.ts.
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="primary_color"]')).toBeVisible();
  });

  test("/agency/billing renders without 5xx", async ({ page }) => {
    const res = await page.goto(`${APP}/agency/billing`);
    // Either a billing dashboard (with subscription) or a "start subscription"
    // panel (without). Both are < 400.
    expect(res?.status()).toBeLessThan(400);
  });
});

test.describe("Settings -- 2FA enrollment surface", () => {
  test.beforeEach(async ({ context }) => {
    await authenticateAs(context, E2E_TEST_AGENCY_ADMIN_EMAIL);
  });

  test("/settings/2fa renders the enroll/disable status page", async ({ page }) => {
    const res = await page.goto(`${APP}/settings/2fa`);
    expect(res?.status()).toBeLessThan(400);
    await page.waitForLoadState("networkidle");

    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("two-factor");
    // Either "Set up 2FA" form or "2FA is on" status -- depending on
    // whether the test user has enrolled (we don't enroll them in seed).
    const enrollVisible = await page.locator('form[action="/settings/2fa/enroll"]').count() > 0;
    const disableVisible = await page.locator('form[action="/settings/2fa/disable"]').count() > 0;
    expect(enrollVisible || disableVisible).toBe(true);
  });
});

test.describe("Cancellation interstitial", () => {
  test.beforeEach(async ({ context }) => {
    await authenticateAs(context, E2E_TEST_AGENCY_ADMIN_EMAIL);
  });

  test("/settings/cancel renders the four-option interstitial", async ({ page }) => {
    const res = await page.goto(`${APP}/settings/cancel`);
    expect(res?.status()).toBeLessThan(400);
    await page.waitForLoadState("networkidle");

    // Four distinct forms per cancel-flow.ts: pause / talk / update card / cancel-anyway.
    const forms = page.locator('form[action="/settings/cancel"]');
    expect(await forms.count()).toBeGreaterThanOrEqual(4);
  });
});
