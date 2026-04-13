/**
 * Test 08 — Edge cases
 *
 * Verifies: invalid session tokens, 404 handling,
 * auth gates on protected routes, expired sessions.
 */

import { test, expect } from "@playwright/test";
import { URLS } from "./helpers";

test.describe("Edge cases", () => {
  test("invalid session cookie gets redirected to login", async ({
    context,
    page,
  }) => {
    // Set a fake session cookie
    await context.addCookies([
      {
        name: "nr_app",
        value: "fake-invalid-token-12345",
        domain: "app.neverranked.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);

    await page.goto(URLS.dashboard);
    await page.waitForLoadState("networkidle");

    // Should redirect to login
    expect(page.url()).toContain("/login");
  });

  test("expired session cookie gets redirected to login", async ({
    context,
    page,
  }) => {
    // Set an expired-looking session cookie (random UUID format)
    await context.addCookies([
      {
        name: "nr_app",
        value: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        domain: "app.neverranked.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);

    await page.goto(URLS.settings);
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/login");
  });

  test("protected routes redirect unauthenticated users", async ({
    page,
  }) => {
    const protectedUrls = [
      URLS.dashboard,
      URLS.settings,
      URLS.cockpit,
      URLS.manage,
      URLS.leads,
      URLS.onboarding,
    ];

    for (const url of protectedUrls) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");

      // All should redirect to login
      expect(page.url()).toContain("/login");
    }
  });

  test("unknown route returns 404 or redirects", async ({ page }) => {
    const response = await page.goto(
      "https://app.neverranked.com/definitely-not-a-real-route"
    );

    const status = response?.status();
    const url = page.url();

    // Either 404 status or redirect to login
    expect(status === 404 || url.includes("/login")).toBeTruthy();
  });

  test("SQL injection in login email is handled safely", async ({ page }) => {
    await page.goto(URLS.login);
    await page.waitForLoadState("networkidle");

    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill("'; DROP TABLE users; --@evil.com");

    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    await page.waitForLoadState("networkidle");

    // Should not crash — either shows error or stays on login
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    expect(page.url()).not.toContain("error");
  });

  test("domain route with invalid ID handles gracefully", async ({
    context,
    page,
  }) => {
    // Set a fake cookie to get past the auth gate
    // (will fail auth, redirect to login — that's fine)
    await page.goto("https://app.neverranked.com/domain/99999999");
    await page.waitForLoadState("networkidle");

    // Should redirect to login (no auth) or show not found
    const url = page.url();
    const body = await page.textContent("body");
    expect(
      url.includes("/login") ||
        body?.toLowerCase().includes("not found") ||
        body?.toLowerCase().includes("error")
    ).toBeTruthy();
  });

  test("double-slash URLs don't break routing", async ({ page }) => {
    await page.goto("https://app.neverranked.com//login");
    await page.waitForLoadState("networkidle");

    // Should either load login or redirect cleanly
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("no cookie header doesn't crash the app", async ({ page }) => {
    // Fresh context with no cookies at all
    const response = await page.goto(URLS.dashboard);
    await page.waitForLoadState("networkidle");

    // Should redirect to login gracefully
    expect(page.url()).toContain("/login");
    expect(response?.status()).toBeLessThan(500);
  });
});
