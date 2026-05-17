/**
 * Test 13 — Warm-prospects rescue + elevated Preview + outreach
 * deliverability fixes (2026-05-16 Workers-cutover work).
 *
 * Regression lock for things fixed this session that the HTTP
 * smoke can't cover end-to-end:
 *  - warm-prospects dashboard repointed to outreach_prospects_master
 *    (real identity, no "metadata not synced", no stale SQLite
 *    banner, explicit Build-Preview-vs-Build-Draft step copy)
 *  - elevated Preview shell + SEO-vs-AEO education block + the
 *    grader-passed canonical proof still render
 *  - /unsubscribe one-click handler (CAN-SPAM fix)
 *  - /check 2-label redirect (URI_TRY_3LD deliverability fix)
 *
 * READ-ONLY: never clicks Build/Rebuild (real Claude spend + prod
 * D1 writes). Asserts structure/invariants only.
 */
import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import { authenticateAs, TEST_ADMIN_EMAIL, getSessionForUser } from "./helpers";

const APP = "https://app.neverranked.com";
const SITE = "https://neverranked.com";
// A stable migrated prospect (Drake Real Estate Partners) used to
// assert the identity repoint. broker_name/email in
// outreach_prospects_master is stable migrated data.
const KNOWN_PID = 192;

// ── Authenticated: the warm-prospects rescue ────────────────────
const sessionAvailable = !!getSessionForUser(TEST_ADMIN_EMAIL);
test.describe("Warm-prospects dashboard (authenticated)", () => {
  test.skip(
    !sessionAvailable,
    "no admin session (PLAYWRIGHT_SESSION_TOKEN unset / no local D1 session)",
  );

  test.beforeEach(async ({ context }) => {
    const ok = await authenticateAs(context, TEST_ADMIN_EMAIL);
    expect(ok, "admin authentication failed").toBe(true);
  });

  test("/admin/warm-prospects loads, real identity, no stale banner", async ({
    page,
  }) => {
    const res = await page.goto(`${APP}/admin/warm-prospects`);
    expect(res?.status()).toBeLessThan(400);
    expect(page.url()).not.toContain("/login");
    const body = (await page.textContent("body")) || "";
    // The stale pre-migration banner must be gone (it misled for
    // hours this session).
    expect(body).not.toContain(
      "Names and emails live in your local outreach tool's SQLite",
    );
    // Identity is surfaced (an email address renders somewhere in
    // the list/detail), not bare "Prospect #N / cross-reference".
    expect(body).not.toContain(
      "Cross-reference this ID in your outreach tool",
    );
    // The explicit Preview-vs-Draft step copy we added.
    expect(body.toLowerCase()).toContain("build preview");
  });

  test("warm prospect detail: identity repointed, no 'metadata not synced'", async ({
    page,
  }) => {
    const res = await page.goto(`${APP}/admin/warm-prospects/${KNOWN_PID}`);
    expect(res?.status()).toBeLessThan(400);
    const body = (await page.textContent("body")) || "";
    // The post-cutover breakage we fixed must not be back.
    expect(body).not.toContain("metadata not synced");
    expect(body).not.toContain(
      "Push prospect data from the local outreach tool",
    );
    // Real identity is rendered (an email address present).
    expect(body).toMatch(/[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    // Rebuild affordance exists (replaces the SQL-archive hack).
    expect(body.toLowerCase()).toContain("rebuild");
  });
});

// ── Public: elevated Preview + deliverability fixes ─────────────
test.describe("Preview + outreach public surfaces (no auth)", () => {
  test("elevated Preview renders: shell + education + grader-passed proof", async ({
    page,
  }) => {
    const res = await page.goto(
      `${APP}/preview/drake-real-estate-partners-xjny9`,
    );
    expect(res?.status()).toBe(200);
    const html = (await page.content()) || "";
    // Visual system ported from the manual pitch pages.
    expect(html).toContain("Playfair Display");
    expect(html).toContain('class="legal-section"');
    expect(html).toContain("Save as PDF");
    // The SEO-vs-AEO education block + its compare device.
    expect(html).toContain("SEO got you ranked");
    expect(html).toContain('class="compare"');
    // Grader-passed canonical proof — exact, not fabricated.
    expect(html).toContain("Hawaii Theatre Center");
    expect(html).toContain("45 to 95");
  });

  test("/unsubscribe: bad/missing token rejected, valid token confirms", async ({
    page,
  }) => {
    const noParams = await page.goto(`${APP}/unsubscribe`);
    expect(noParams?.status()).toBe(400);
    expect((await page.textContent("body")) || "").toContain(
      "Invalid unsubscribe link",
    );
    // Valid token for a NON-existent prospect id -> verifies the
    // HMAC path with zero data mutation (no such row).
    const tok = createHmac("sha256", "neverranked-unsub-secret-change-me")
      .update("999999999")
      .digest("hex")
      .slice(0, 16);
    const ok = await page.goto(
      `${APP}/unsubscribe?id=999999999&token=${tok}`,
    );
    expect(ok?.status()).toBe(200);
    expect((await page.textContent("body")) || "").toContain(
      "You're unsubscribed",
    );
  });

  test("/check is a 2-label 302 to the scanner, query + utm preserved", async ({
    request,
  }) => {
    const r = await request.get(
      `${SITE}/check?url=test.com&utm_source=cold-email&utm_campaign=smb-cold`,
      { maxRedirects: 0 },
    );
    expect(r.status()).toBe(302);
    const loc = r.headers()["location"] || "";
    expect(loc).toBe(
      "https://check.neverranked.com/?url=test.com&utm_source=cold-email&utm_campaign=smb-cold",
    );
  });
});
