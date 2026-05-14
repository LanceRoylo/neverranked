/**
 * Test 12 — Client actions surface ("Things to do")
 *
 * Smoke tests for the routes shipped 2026-05-14:
 *   - /actions/<slug> index
 *   - /actions/<slug>/faq_review (item-driven action)
 *   - /actions/<slug>/bing_for_business (step-driven walkthrough)
 *
 * Two test tiers:
 *
 *  1. UNAUTH smoke (always runs in CI): hits each route and asserts
 *     the dashboard worker returns a valid response (not 500). The
 *     route either renders or redirects to /login. Either is fine.
 *     What we're catching: a route that throws unhandled exceptions
 *     because of a bad import, missing column, or broken renderer.
 *
 *  2. AUTH content (skips in CI without PLAYWRIGHT_SESSION_TOKEN):
 *     drives the surface as the seeded e2e-tests user. Asserts the
 *     'Things to do' header, the action cards, the FAQ review and
 *     Bing walkthrough rendering.
 */
import { test, expect } from "@playwright/test";
import { authenticateAs, E2E_TEST_AGENCY_ADMIN_EMAIL } from "./helpers";

const DASH = "https://app.neverranked.com";

test.describe("Client actions surface — unauth smoke", () => {
  // Use ANY known client slug. hawaii-theatre is a known production
  // client with seeded FAQ data; if it ever gets deleted, swap to
  // another active slug.
  const SMOKE_SLUG = "hawaii-theatre";

  test("/actions/<slug> route renders or redirects (not 500)", async ({ page }) => {
    const resp = await page.goto(`${DASH}/actions/${SMOKE_SLUG}`, { waitUntil: "load" });
    expect(resp, "no response from /actions/<slug>").not.toBeNull();
    const status = resp!.status();
    // 200 OK (rendered), 302 (redirect to /login), 401/403 (auth gate),
    // 404 (not-authorized -> 'Page not found' render). All are "the
    // route exists and didn't crash."
    expect(status).toBeLessThan(500);
  });

  test("/actions/<slug>/faq_review route renders or redirects (not 500)", async ({ page }) => {
    const resp = await page.goto(`${DASH}/actions/${SMOKE_SLUG}/faq_review`, { waitUntil: "load" });
    expect(resp).not.toBeNull();
    expect(resp!.status()).toBeLessThan(500);
  });

  test("/actions/<slug>/bing_for_business route renders or redirects (not 500)", async ({ page }) => {
    const resp = await page.goto(`${DASH}/actions/${SMOKE_SLUG}/bing_for_business`, { waitUntil: "load" });
    expect(resp).not.toBeNull();
    expect(resp!.status()).toBeLessThan(500);
  });

  test("/actions/<slug>/<unknown_action_type> returns not-found (no crash)", async ({ page }) => {
    const resp = await page.goto(`${DASH}/actions/${SMOKE_SLUG}/totally_made_up_action`, { waitUntil: "load" });
    expect(resp).not.toBeNull();
    expect(resp!.status()).toBeLessThan(500);
  });
});

test.describe("Client actions surface — authenticated content", () => {
  // These need an authenticated session. In CI, the seeded test user
  // is an agency_admin who may or may not have hawaii-theatre access.
  // The tests skip cleanly if auth fails or if the action surface
  // returns the "not authorized" empty state.
  const SMOKE_SLUG = "hawaii-theatre";

  test("index renders 'Things to do' header and action cards", async ({ context, page }) => {
    const authed = await authenticateAs(context, E2E_TEST_AGENCY_ADMIN_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }
    await page.goto(`${DASH}/actions/${SMOKE_SLUG}`, { waitUntil: "load" });

    // If the user isn't authorized for this slug, the route renders a
    // 'Page not found' empty state. We treat that as a clean skip
    // rather than a failure -- it means the route works, just not for
    // this user/slug combo.
    const notFound = await page.locator('text="Page not found"').count();
    if (notFound > 0) {
      test.skip(true, "auth user not authorized for smoke slug");
      return;
    }

    await expect(page.locator("h1")).toContainText(/Things/i);
    // The two v1 action cards should both render. We match by their
    // titles; if either is missing, the index is broken.
    await expect(page.locator('text="Review your AI-facing FAQ schema"')).toBeVisible();
    await expect(page.locator('text="Claim your Bing for Business profile"')).toBeVisible();
  });

  test("FAQ review surface renders header and proposal cards", async ({ context, page }) => {
    const authed = await authenticateAs(context, E2E_TEST_AGENCY_ADMIN_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }
    await page.goto(`${DASH}/actions/${SMOKE_SLUG}/faq_review`, { waitUntil: "load" });
    const notFound = await page.locator('text="Page not found"').count();
    if (notFound > 0) {
      test.skip(true, "auth user not authorized for smoke slug");
      return;
    }
    await expect(page.locator("h1")).toContainText(/Review your AI-facing FAQ schema/i);
    // 'Why this matters' card should be present.
    await expect(page.locator('text="Why this matters"').first()).toBeVisible();
  });

  test("Bing for Business walkthrough renders steps and a continue button", async ({ context, page }) => {
    const authed = await authenticateAs(context, E2E_TEST_AGENCY_ADMIN_EMAIL);
    if (!authed) {
      test.skip();
      return;
    }
    await page.goto(`${DASH}/actions/${SMOKE_SLUG}/bing_for_business`, { waitUntil: "load" });
    const notFound = await page.locator('text="Page not found"').count();
    if (notFound > 0) {
      test.skip(true, "auth user not authorized for smoke slug");
      return;
    }
    await expect(page.locator("h1")).toContainText(/Bing for Business/i);
    // Step 1 should render with the bingplaces.com link button.
    await expect(page.locator('text="Step 1 of 6"')).toBeVisible();
    // At least one 'Done, continue' button should exist for unfinished steps.
    const continueButtons = page.locator('button:has-text("Done, continue")');
    expect(await continueButtons.count()).toBeGreaterThan(0);
  });
});
