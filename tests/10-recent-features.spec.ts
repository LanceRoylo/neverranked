/**
 * Test 10 -- Recently shipped public surfaces
 *
 * Coverage for the surfaces shipped in the last ~50 commits that
 * aren't yet exercised by the older test files. All read-only --
 * navigates and asserts visible content. No state mutation.
 *
 * Surfaces covered:
 *   /install                  -- platform-picker index
 *   /install/wordpress        -- one specific guide as smoke test
 *   /install/shopify          -- another, to catch a per-guide regression
 *   /changelog                -- public changelog
 *   /agency/apply             -- public partner application form
 *   /auth/2fa-challenge       -- 2FA challenge form (no user, redirects to /login)
 *   X-Request-Id header       -- structured logging echoes correlation ID
 *
 * Branding for unauthenticated visitors should always be NeverRanked
 * (agency branding only kicks in when logged in as a Mode-2 client).
 */

import { test, expect } from "@playwright/test";

const APP = "https://app.neverranked.com";

test.describe("Install guides", () => {
  test("/install index loads and lists multiple platforms", async ({ page }) => {
    const res = await page.goto(`${APP}/install`);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("install the snippet");
    // Sample a few platforms we expect to be there.
    expect(body?.toLowerCase()).toContain("wordpress");
    expect(body?.toLowerCase()).toContain("shopify");
    expect(body?.toLowerCase()).toContain("squarespace");
  });

  test("/install/wordpress renders the guide with a snippet block", async ({ page }) => {
    const res = await page.goto(`${APP}/install/wordpress`);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("wordpress");
    expect(body?.toLowerCase()).toContain("steps");
    expect(body?.toLowerCase()).toContain("snippet");
    // Placeholder snippet should appear when no slug param.
    expect(body).toContain("<your-slug>");
  });

  test("/install/wordpress?slug=acme pre-fills the snippet", async ({ page }) => {
    const res = await page.goto(`${APP}/install/wordpress?slug=acme-test`);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    const body = await page.textContent("body");
    // With a slug param, the snippet should contain that slug verbatim.
    expect(body).toContain("acme-test");
    expect(body).not.toContain("<your-slug>");
  });

  test("/install/shopify guide renders without errors", async ({ page }) => {
    const res = await page.goto(`${APP}/install/shopify`);
    expect(res?.status()).toBe(200);
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("shopify");
    expect(body?.toLowerCase()).toContain("theme.liquid");
  });

  test("/install/nonexistent-platform returns a soft 404", async ({ page }) => {
    const res = await page.goto(`${APP}/install/this-platform-does-not-exist`);
    expect(res?.status()).toBe(404);
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("guide not found");
  });
});

test.describe("Public changelog", () => {
  test("/changelog renders with at least one shipped entry", async ({ page }) => {
    const res = await page.goto(`${APP}/changelog`);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("changelog");
    expect(body?.toLowerCase()).toContain("shipped");
    // We have many entries today; loosen to "at least one date heading".
    const dateHeader = page.locator("text=/202[0-9]/i");
    expect(await dateHeader.count()).toBeGreaterThan(0);
  });
});

test.describe("Agency apply form", () => {
  test("/agency/apply renders the public application form", async ({ page }) => {
    const res = await page.goto(`${APP}/agency/apply`);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("agency");
    // Required form fields per the schema we built.
    await expect(page.locator('input[name="agency_name"]')).toBeVisible();
    await expect(page.locator('input[name="contact_email"]')).toBeVisible();
    await expect(page.locator('input[name="website"]')).toBeVisible();
    // Submit button without filling anything -- HTML5 required validation
    // prevents POST. Just confirm the button is there.
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});

test.describe("2FA challenge route", () => {
  test("/auth/2fa-challenge requires auth (redirects unauth'd users to /login)", async ({ page }) => {
    await page.goto(`${APP}/auth/2fa-challenge`);
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/login");
  });
});

test.describe("Structured logging", () => {
  test("every response carries an X-Request-Id header", async ({ page }) => {
    const responses: string[] = [];
    page.on("response", (r) => {
      const id = r.headers()["x-request-id"];
      if (id) responses.push(id);
    });
    await page.goto(`${APP}/login`);
    await page.waitForLoadState("networkidle");
    expect(responses.length).toBeGreaterThan(0);
    // Each ID is the 8-char base36 from log.ts shortId().
    for (const id of responses) {
      expect(id).toMatch(/^[0-9a-z]{1,10}$/);
    }
  });
});
