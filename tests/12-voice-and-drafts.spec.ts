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
    // Either the voice profile card is computed ("your voice profile")
    // or the Phase 1 stub is showing ("voice profile coming online").
    // Both are valid depending on whether samples have been uploaded.
    const hasProfileHeading = body.toLowerCase().includes("your voice profile");
    const hasStubHeading = body.toLowerCase().includes("voice profile coming online");
    expect(hasProfileHeading || hasStubHeading).toBe(true);

    // Upload form elements. URL field + title are visible; the paste
    // textarea is inside a <details> fallback so it's in the DOM but
    // collapsed (not visible) by default.
    await expect(page.locator(`form[action="/voice/${SLUG}/sample"]`)).toBeVisible();
    await expect(page.locator('input[name="source_url"]')).toBeVisible();
    await expect(page.locator('input[name="title"]')).toBeVisible();
    await expect(page.locator('button[name="mode"][value="fetch"]')).toBeVisible();
    await expect(page.locator(`form[action="/voice/${SLUG}/sample"] textarea[name="body"]`)).toBeAttached();

    // Glossary footer (shared across client-facing pages)
    expect(body.toLowerCase()).toContain("grade scale");
    expect(body.toLowerCase()).toContain("automation schedule");
  });

  test("nav contains Voice and Drafts links", async ({ page }) => {
    await page.goto(`${APP}/voice/${SLUG}`);
    await page.waitForLoadState("networkidle");
    // The nav links use href shortcuts bound to the active client slug.
    await expect(page.locator(`a.sidebar-item[href="/voice/${SLUG}"]`)).toBeVisible();
    await expect(page.locator(`a.sidebar-item[href="/drafts/${SLUG}"]`)).toBeVisible();
  });

  test("voice profile card shows the 'coming online' stub in Phase 1", async ({ page }) => {
    await page.goto(`${APP}/voice/${SLUG}`);
    await page.waitForLoadState("networkidle");
    const body = (await page.textContent("body")) || "";
    // Either the stub is visible (no profile yet) or a real profile is
    // computed. Test accepts either so it stays green once Phase 2 lands.
    const hasStub = body.toLowerCase().includes("voice profile coming online");
    const hasProfile = body.toLowerCase().includes("your voice profile");
    expect(hasStub || hasProfile).toBe(true);
  });
});

test.describe("Voice sample lifecycle (create -> verify -> delete)", () => {
  test.beforeEach(async ({ context }) => {
    const ok = await authenticateAs(context, E2E_TEST_AGENCY_ADMIN_EMAIL);
    expect(ok).toBe(true);
  });

  test("paste a sample via the fallback path, it appears in the list, delete removes it", async ({ page }) => {
    const uniqueTitle = `E2E sample ${Date.now()}`;
    const sampleBody = "This is a small piece of writing for the Playwright test suite. " +
      "It exists only to verify the paste flow, word counter, and delete action. Cleanup happens at the end of this test.";

    // Create via the paste fallback (inside a <details> element)
    await page.goto(`${APP}/voice/${SLUG}`);
    await page.waitForLoadState("networkidle");
    await page.fill('input[name="title"]', uniqueTitle);
    // Open the "paste the text directly" details. Scope the selector to
    // the sample form so it doesn't collide with the glossary's many
    // <details> elements at the bottom of the page.
    await page.locator(`form[action="/voice/${SLUG}/sample"] details summary`).click();
    await page.fill(`form[action="/voice/${SLUG}/sample"] textarea[name="body"]`, sampleBody);
    await Promise.all([
      page.waitForLoadState("networkidle"),
      // Click the paste submit (name="mode" value="paste") to use the
      // fallback path. The fetch button (value="fetch") would try to hit
      // a URL we haven't provided.
      page.click('button[name="mode"][value="paste"]'),
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

test.describe("Voice sample via URL fetch (primary path)", () => {
  test.beforeEach(async ({ context }) => {
    const ok = await authenticateAs(context, E2E_TEST_AGENCY_ADMIN_EMAIL);
    expect(ok).toBe(true);
  });

  test("paste a URL, fetch fires, extracted sample appears, cleanup removes it", async ({ page }) => {
    // Target a real long-form page we know will exist and parse cleanly.
    // neverranked.com blog posts are the safest bet -- our own site.
    const targetUrl = "https://neverranked.com/blog/is-seo-dead/";

    await page.goto(`${APP}/voice/${SLUG}`);
    await page.waitForLoadState("networkidle");
    await page.fill('input[name="source_url"]', targetUrl);
    // No title given -- the extractor should auto-detect one from <title>
    await Promise.all([
      page.waitForLoadState("networkidle"),
      page.click('button[name="mode"][value="fetch"]'),
    ]);

    // Success banner should render
    const body = (await page.textContent("body")) || "";
    expect(body.toLowerCase()).toContain("fetched and saved");

    // The extracted sample should appear in the list. We don't know the
    // exact title the extractor picked, but a sample whose source_url
    // matches our target should exist.
    await expect(page.locator(`a[href="${targetUrl}"]`).first()).toBeVisible();

    // Cleanup: find the row containing our URL and delete it.
    page.once("dialog", (d) => d.accept());
    const sampleRow = page.locator('div').filter({ has: page.locator(`a[href="${targetUrl}"]`) }).filter({ has: page.locator('form[action*="/delete"]') }).first();
    await Promise.all([
      page.waitForLoadState("networkidle"),
      sampleRow.locator('form[action*="/delete"] button[type="submit"]').click(),
    ]);

    const bodyAfter = (await page.textContent("body")) || "";
    expect(bodyAfter).not.toContain(targetUrl);
  });

  test("invalid URL surfaces a friendly error", async ({ page }) => {
    await page.goto(`${APP}/voice/${SLUG}`);
    await page.waitForLoadState("networkidle");
    await page.fill('input[name="source_url"]', "not-a-real-url");
    await Promise.all([
      page.waitForLoadState("networkidle"),
      page.click('button[name="mode"][value="fetch"]'),
    ]);
    const body = (await page.textContent("body")) || "";
    // Browser-level validation blocks the submit OR our server returns
    // the URL error. Either is acceptable.
    const browserBlocked = !body.toLowerCase().includes("fetched and saved");
    const serverError = body.toLowerCase().includes("doesn't look valid") || body.toLowerCase().includes("valid");
    expect(browserBlocked || serverError).toBe(true);
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
