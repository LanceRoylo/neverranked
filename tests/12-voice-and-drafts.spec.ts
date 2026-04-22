/**
 * Test 12 -- Voice calibration + Content drafts (Phase 1 shell)
 *
 * Exercises the foundation shipped in commit b4ee76b:
 *   - /voice/:slug upload + list + delete samples
 *   - /drafts/:slug list + editor + save + export + status flow + delete
 *
 * Uses the e2e-test-agency + e2e-test-client slug seeded by
 * scripts/seed-e2e-test-client.sql. Every mutation test creates its own
 * data and deletes it at the end so the shared test user stays clean.
 *
 * Skips automatically if no Playwright session is available (local
 * contributor without a seeded session, or CI secret missing).
 */

import { test, expect, Page } from "@playwright/test";
import { authenticateAs, E2E_TEST_AGENCY_ADMIN_EMAIL, getSessionForUser } from "./helpers";

const APP = "https://app.neverranked.com";
const SLUG = "e2e-test-client";

// Auto-skip the file if no session is available.
const sessionAvailable = !!getSessionForUser(E2E_TEST_AGENCY_ADMIN_EMAIL);
test.skip(!sessionAvailable, "PLAYWRIGHT_SESSION_TOKEN not set and no local D1 session for e2e-tests user");

test.describe("Voice page (read-only shape)", () => {
  test.beforeEach(async ({ context }) => {
    const ok = await authenticateAs(context, E2E_TEST_AGENCY_ADMIN_EMAIL);
    expect(ok, "test-user authentication failed").toBe(true);
  });

  test("/voice/:slug renders with the explainer, upload form, and glossary", async ({ page }) => {
    const res = await page.goto(`${APP}/voice/${SLUG}`);
    expect(res?.status()).toBeLessThan(400);
    await page.waitForLoadState("networkidle");

    const body = (await page.textContent("body")) || "";

    // Heading
    expect(body.toLowerCase()).toContain("your");
    expect(body.toLowerCase()).toContain("voice");

    // Explainer block
    expect(body.toLowerCase()).toContain("why this matters");
    // Either the fingerprint card is computed ("your voice fingerprint")
    // or the Phase 1 stub is showing ("voice engine coming online"). Both
    // are valid depending on whether samples have been uploaded.
    const hasFingerprintHeading = body.toLowerCase().includes("voice fingerprint");
    const hasStubHeading = body.toLowerCase().includes("voice engine coming online");
    expect(hasFingerprintHeading || hasStubHeading).toBe(true);

    // Upload form elements
    await expect(page.locator(`form[action="/voice/${SLUG}/sample"]`)).toBeVisible();
    await expect(page.locator('input[name="title"]')).toBeVisible();
    await expect(page.locator('textarea[name="body"]')).toBeVisible();

    // Glossary footer (shared across client-facing pages)
    expect(body.toLowerCase()).toContain("grade scale");
    expect(body.toLowerCase()).toContain("automation schedule");
  });

  test("nav contains Voice and Drafts links", async ({ page }) => {
    await page.goto(`${APP}/voice/${SLUG}`);
    await page.waitForLoadState("networkidle");
    // The nav links use href shortcuts bound to the active client slug.
    await expect(page.locator(`a.nav-links-item[href="/voice/${SLUG}"]`)).toBeVisible();
    await expect(page.locator(`a.nav-links-item[href="/drafts/${SLUG}"]`)).toBeVisible();
  });

  test("voice fingerprint card shows the 'engine coming online' stub in Phase 1", async ({ page }) => {
    await page.goto(`${APP}/voice/${SLUG}`);
    await page.waitForLoadState("networkidle");
    const body = (await page.textContent("body")) || "";
    // Either the stub is visible (no fingerprint yet), or a real fingerprint
    // summary is present. The test accepts either so it doesn't break once
    // Phase 2 extractor lands.
    const hasStub = body.toLowerCase().includes("voice engine coming online");
    const hasFingerprint = body.toLowerCase().includes("your voice fingerprint");
    expect(hasStub || hasFingerprint).toBe(true);
  });
});

test.describe("Voice sample lifecycle (create -> verify -> delete)", () => {
  test.beforeEach(async ({ context }) => {
    const ok = await authenticateAs(context, E2E_TEST_AGENCY_ADMIN_EMAIL);
    expect(ok).toBe(true);
  });

  test("upload a sample, it appears in the list, delete removes it", async ({ page }) => {
    const uniqueTitle = `E2E sample ${Date.now()}`;
    const sampleBody = "This is a small piece of writing for the Playwright test suite. " +
      "It exists only to verify the upload flow, word counter, and delete action. Cleanup happens at the end of this test.";

    // Create
    await page.goto(`${APP}/voice/${SLUG}`);
    await page.waitForLoadState("networkidle");
    await page.fill('input[name="title"]', uniqueTitle);
    await page.fill('textarea[name="body"]', sampleBody);
    await Promise.all([
      page.waitForLoadState("networkidle"),
      page.click(`form[action="/voice/${SLUG}/sample"] button[type="submit"]`),
    ]);

    // Verify it shows in the list
    let body = (await page.textContent("body")) || "";
    expect(body).toContain(uniqueTitle);
    // Word count should render (any number followed by "words")
    expect(body).toMatch(/\d+\s+words/i);

    // Find the delete form for THIS sample. The form action contains the
    // sample id; we locate by the delete button scoped to the row whose
    // text contains our unique title.
    const sampleRow = page.locator(`div:has-text("${uniqueTitle}")`).filter({ has: page.locator('form[action*="/delete"]') }).first();
    const deleteForm = sampleRow.locator('form[action*="/delete"]');

    // Accept the confirm() dialog that fires on submit
    page.once("dialog", (d) => d.accept());
    await Promise.all([
      page.waitForLoadState("networkidle"),
      deleteForm.locator('button[type="submit"]').click(),
    ]);

    // Cleanup verification
    body = (await page.textContent("body")) || "";
    expect(body).not.toContain(uniqueTitle);
  });
});

test.describe("Drafts page (read-only shape)", () => {
  test.beforeEach(async ({ context }) => {
    const ok = await authenticateAs(context, E2E_TEST_AGENCY_ADMIN_EMAIL);
    expect(ok).toBe(true);
  });

  test("/drafts/:slug renders with the explainer and a create form", async ({ page }) => {
    const res = await page.goto(`${APP}/drafts/${SLUG}`);
    expect(res?.status()).toBeLessThan(400);
    await page.waitForLoadState("networkidle");

    const body = (await page.textContent("body")) || "";
    expect(body.toLowerCase()).toContain("content");
    expect(body.toLowerCase()).toContain("drafts");
    expect(body.toLowerCase()).toContain("how drafts work");

    // Create form visible (admin/agency_admin can create)
    await expect(page.locator(`form[action="/drafts/${SLUG}/new"]`)).toBeVisible();
  });
});

test.describe("Draft lifecycle (create -> edit -> save -> export -> approve -> delete)", () => {
  let draftId: number | null = null;
  let page: Page;

  test.beforeEach(async ({ context, page: p }) => {
    const ok = await authenticateAs(context, E2E_TEST_AGENCY_ADMIN_EMAIL);
    expect(ok).toBe(true);
    page = p;
  });

  test("full draft lifecycle", async () => {
    const uniqueTitle = `E2E draft ${Date.now()}`;

    // --- Create ---
    await page.goto(`${APP}/drafts/${SLUG}`);
    await page.waitForLoadState("networkidle");
    await page.fill(`form[action="/drafts/${SLUG}/new"] input[name="title"]`, uniqueTitle);
    // Kind select defaults to article; leave it.
    await Promise.all([
      page.waitForLoadState("networkidle"),
      page.click(`form[action="/drafts/${SLUG}/new"] button[type="submit"]`),
    ]);

    // Create redirects to the detail page. Pull the draft id out of the URL.
    const url = page.url();
    const m = url.match(/\/drafts\/[^/]+\/(\d+)$/);
    expect(m, `expected to land on a draft detail URL, got: ${url}`).not.toBeNull();
    draftId = Number(m![1]);

    // Title should appear in H1
    let body = (await page.textContent("body")) || "";
    expect(body).toContain(uniqueTitle);

    // Status defaults to "Draft"
    expect(body.toLowerCase()).toContain("draft");

    // --- Edit + save ---
    const draftText = `# ${uniqueTitle}\n\nThis is the initial draft body written by the Playwright test.\n\n- bullet one\n- bullet two\n`;
    await page.fill('textarea#draft-body', draftText);
    await Promise.all([
      page.waitForLoadState("networkidle"),
      page.click('form#draft-form button[type="submit"]'),
    ]);

    // After save, textarea should still contain the text we saved
    const savedValue = await page.locator('textarea#draft-body').inputValue();
    expect(savedValue).toContain("Playwright test");
    expect(savedValue).toContain("- bullet one");

    // --- Download .md ---
    const [mdDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.click(`a[href="/drafts/${SLUG}/${draftId}/download.md"]`),
    ]);
    const mdPath = await mdDownload.path();
    expect(mdPath, "markdown download did not arrive").toBeTruthy();
    const mdFilename = mdDownload.suggestedFilename();
    expect(mdFilename).toMatch(/\.md$/i);

    // --- Download .html ---
    const [htmlDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.click(`a[href="/drafts/${SLUG}/${draftId}/download.html"]`),
    ]);
    const htmlPath = await htmlDownload.path();
    expect(htmlPath, "html download did not arrive").toBeTruthy();
    const htmlFilename = htmlDownload.suggestedFilename();
    expect(htmlFilename).toMatch(/\.html$/i);

    // --- Send to review ---
    await Promise.all([
      page.waitForLoadState("networkidle"),
      page.click(`form[action="/drafts/${SLUG}/${draftId}/status"]:has(input[value="in_review"]) button[type="submit"]`),
    ]);
    body = (await page.textContent("body")) || "";
    expect(body.toLowerCase()).toContain("in review");

    // --- Approve ---
    await Promise.all([
      page.waitForLoadState("networkidle"),
      page.click(`form[action="/drafts/${SLUG}/${draftId}/status"]:has(input[value="approved"]) button[type="submit"]`),
    ]);
    body = (await page.textContent("body")) || "";
    expect(body.toLowerCase()).toContain("approved");
  });

  test.afterEach(async () => {
    // Cleanup: delete the draft created by the lifecycle test. Runs even on
    // assertion failures so the shared test user never accumulates drafts.
    if (!draftId || !page) return;
    try {
      page.once("dialog", (d) => d.accept());
      await page.goto(`${APP}/drafts/${SLUG}/${draftId}`);
      await page.waitForLoadState("networkidle");
      const deleteForm = page.locator(`form[action="/drafts/${SLUG}/${draftId}/delete"]`);
      if (await deleteForm.count() > 0) {
        await Promise.all([
          page.waitForLoadState("networkidle"),
          deleteForm.locator('button[type="submit"]').click(),
        ]);
      }
    } catch {
      // cleanup is best-effort; a manual sweep can pick up orphans
    }
    draftId = null;
  });
});
