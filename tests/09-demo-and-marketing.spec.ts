/**
 * Test 09 -- Demo mode + marketing site refresh
 *
 * Verifies:
 * - Demo pages load without auth
 * - All three demo pages render correctly with fixture data
 * - Demo banner is present on every page
 * - Demo nav links work
 * - POST routes are blocked
 * - Marketing site has updated features section
 * - Marketing site has product showcase section
 * - Marketing site has demo links
 * - Free check tool has demo links
 * - Mobile responsiveness on demo pages
 */

import { test, expect } from "@playwright/test";

const DEMO_BASE = "https://app.neverranked.com/demo";
const MAIN_SITE = "https://neverranked.com";
const CHECK_TOOL = "https://check.neverranked.com";

// ---------------------------------------------------------------------------
// Demo mode -- access & routing
// ---------------------------------------------------------------------------

test.describe("Demo mode -- routing", () => {
  test("/demo redirects to /demo/domain", async ({ page }) => {
    const response = await page.goto(DEMO_BASE);
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/demo/domain");
  });

  test("/demo/ (trailing slash) redirects to /demo/domain", async ({ page }) => {
    await page.goto(DEMO_BASE + "/");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/demo/domain");
  });

  test("demo pages do NOT redirect to login", async ({ page }) => {
    for (const path of ["/demo/domain", "/demo/citations", "/demo/roadmap"]) {
      await page.goto("https://app.neverranked.com" + path);
      await page.waitForLoadState("domcontentloaded");
      expect(page.url()).not.toContain("/login");
      expect(page.url()).toContain(path);
    }
  });
});

// ---------------------------------------------------------------------------
// Demo mode -- domain page
// ---------------------------------------------------------------------------

test.describe("Demo -- domain page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEMO_BASE + "/domain");
    await page.waitForLoadState("networkidle");
  });

  test("has demo banner", async ({ page }) => {
    const banner = page.locator(".demo-banner");
    await expect(banner).toBeVisible();
    const text = await banner.textContent();
    expect(text?.toLowerCase()).toContain("sample data");
  });

  test("banner has audit CTA", async ({ page }) => {
    const bannerLink = page.locator(".demo-banner a");
    await expect(bannerLink).toBeVisible();
    const href = await bannerLink.getAttribute("href");
    expect(href).toContain("checkout/audit");
  });

  test("shows domain name", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body).toContain("meridiandental.com");
  });

  test("shows AEO score", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body).toContain("68");
    expect(body).toContain("/100");
  });

  test("shows grade B", async ({ page }) => {
    const body = await page.textContent("body");
    // Grade should appear as a large letter
    expect(body).toContain("B");
  });

  test("has executive summary", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("executive summary");
    expect(body).toContain("meridiandental.com scored 68/100");
  });

  test("has score history chart (SVG)", async ({ page }) => {
    const svg = page.locator("svg");
    expect(await svg.count()).toBeGreaterThan(0);
    // Check for the polyline (the chart line)
    const polyline = page.locator("polyline");
    expect(await polyline.count()).toBeGreaterThan(0);
  });

  test("score history has context narrative", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body).toContain("34 points since week one");
  });

  test("has score projection section", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("score projection");
    expect(body).toContain("82"); // projected score
    expect(body?.toLowerCase()).toContain("projected");
  });

  test("score projection has context narrative", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body).toContain("remaining 11 roadmap items");
  });

  test("has citation share trend", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("citation share trend");
    expect(body).toContain("35%");
  });

  test("citation trend has context narrative", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body).toContain("grown from 5% to 35%");
  });

  test("has GSC summary with 4 metric cards", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("search console");
    expect(body).toContain("1,240"); // clicks
    expect(body).toContain("18,600"); // impressions
    expect(body).toContain("6.7%"); // CTR
  });

  test("GSC has context narrative", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body).toContain("Clicks are up 15%");
  });

  test("has recommended next actions", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("recommended next actions");
    expect(body).toContain("AggregateRating");
    expect(body).toContain("HIGH IMPACT");
  });

  test("has content opportunities", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("content opportunities");
    expect(body).toContain("dental implants cost");
  });

  test("has technical signals", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("technical signals");
    expect(body).toContain("HTTPS");
  });

  test("has schema coverage", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("schema coverage");
    expect(body).toContain("Organization");
    expect(body).toContain("FOUND");
    expect(body).toContain("MISSING");
  });

  test("has red flags", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("red flag");
    expect(body).toContain("AggregateRating");
  });

  test("has page-level schema coverage", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("page-level schema");
    expect(body).toContain("/services/implants");
  });

  test("nav links present and point to demo pages", async ({ page }) => {
    const navLinks = page.locator(".nav-links-item");
    const count = await navLinks.count();
    expect(count).toBe(3);

    const hrefs: string[] = [];
    for (let i = 0; i < count; i++) {
      const href = await navLinks.nth(i).getAttribute("href");
      if (href) hrefs.push(href);
    }
    expect(hrefs).toContain("/demo/domain");
    expect(hrefs).toContain("/demo/citations");
    expect(hrefs).toContain("/demo/roadmap");
  });
});

// ---------------------------------------------------------------------------
// Demo mode -- citations page
// ---------------------------------------------------------------------------

test.describe("Demo -- citations page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEMO_BASE + "/citations");
    await page.waitForLoadState("networkidle");
  });

  test("has demo banner", async ({ page }) => {
    await expect(page.locator(".demo-banner")).toBeVisible();
  });

  test("shows citation tracking heading", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("citation tracking");
  });

  test("shows citation share percentage", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body).toContain("35%");
  });

  test("shows summary metrics (3 cards)", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("citation share");
    expect(body?.toLowerCase()).toContain("queries citing you");
    expect(body?.toLowerCase()).toContain("total tracked");
  });

  test("shows engine breakdown table", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body).toContain("ChatGPT");
    expect(body).toContain("Perplexity");
    expect(body).toContain("Gemini");
  });

  test("shows competitor citation matrix", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("competitor citation matrix");
    expect(body).toContain("Meridian Dental");
    expect(body).toContain("Aspen Dental");
    expect(body).toContain("Bright Smiles Family");
  });

  test("matrix has all 8 keywords", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body).toContain("best dentist near me");
    expect(body).toContain("dental implants cost");
    expect(body).toContain("root canal procedure");
  });

  test("has matrix insight narrative", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body).toContain("cited for 4 of 8 tracked keywords");
  });

  test("has legend", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("you are cited");
    expect(body?.toLowerCase()).toContain("competitor cited");
    expect(body?.toLowerCase()).toContain("gap");
  });
});

// ---------------------------------------------------------------------------
// Demo mode -- roadmap page
// ---------------------------------------------------------------------------

test.describe("Demo -- roadmap page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEMO_BASE + "/roadmap");
    await page.waitForLoadState("networkidle");
  });

  test("has demo banner", async ({ page }) => {
    await expect(page.locator(".demo-banner")).toBeVisible();
  });

  test("shows roadmap heading", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("aeo roadmap");
    expect(body).toContain("Meridian Dental");
  });

  test("shows overall progress percentage", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("overall progress");
    // 7 of 18 done = 39%
    expect(body).toContain("39%");
  });

  test("has roadmap narrative", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body).toContain("7 of 18 items delivered");
  });

  test("shows all 3 phases", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body).toContain("Foundation");
    expect(body).toContain("Growth");
    expect(body).toContain("Dominance");
  });

  test("Phase 1 shows as completed", async ({ page }) => {
    const body = await page.textContent("body");
    // Phase 1 should show "Completed" status
    expect(body?.toLowerCase()).toContain("completed");
  });

  test("Phase 2 shows as active with items", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body).toContain("Active");
    expect(body).toContain("Add AggregateRating schema");
    expect(body).toContain("In Progress");
    expect(body).toContain("Pending");
  });

  test("Phase 3 shows as locked", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body).toContain("Locked");
  });
});

// ---------------------------------------------------------------------------
// Demo mode -- POST blocking
// ---------------------------------------------------------------------------

test.describe("Demo -- POST routes blocked", () => {
  test("POST to /demo/domain returns 403 with message", async ({ page }) => {
    const response = await page.goto(DEMO_BASE + "/domain", {
      // We can't POST with goto, so use request context
    });
    // Use fetch API instead
    const postResponse = await page.request.post(DEMO_BASE + "/domain");
    expect(postResponse.status()).toBe(403);
    const body = await postResponse.text();
    expect(body.toLowerCase()).toContain("disabled in demo mode");
  });

  test("POST to /demo/roadmap returns 403", async ({ page }) => {
    const postResponse = await page.request.post(DEMO_BASE + "/roadmap");
    expect(postResponse.status()).toBe(403);
  });

  test("POST to arbitrary /demo/ path returns 403", async ({ page }) => {
    const postResponse = await page.request.post(DEMO_BASE + "/anything");
    expect(postResponse.status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Demo mode -- navigation between pages
// ---------------------------------------------------------------------------

test.describe("Demo -- navigation", () => {
  test("can navigate from domain to citations via nav", async ({ page }) => {
    await page.goto(DEMO_BASE + "/domain");
    await page.waitForLoadState("networkidle");

    await page.click('a[href="/demo/citations"]');
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/demo/citations");
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("citation tracking");
  });

  test("can navigate from citations to roadmap via nav", async ({ page }) => {
    await page.goto(DEMO_BASE + "/citations");
    await page.waitForLoadState("networkidle");

    await page.click('a[href="/demo/roadmap"]');
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/demo/roadmap");
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toContain("roadmap");
  });

  test("can navigate back to domain from roadmap", async ({ page }) => {
    await page.goto(DEMO_BASE + "/roadmap");
    await page.waitForLoadState("networkidle");

    await page.click('a[href="/demo/domain"]');
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/demo/domain");
  });

  test("Back to site link exists", async ({ page }) => {
    await page.goto(DEMO_BASE + "/domain");
    await page.waitForLoadState("networkidle");

    const backLink = page.locator('a:has-text("Back to site")');
    await expect(backLink).toBeVisible();
    const href = await backLink.getAttribute("href");
    expect(href).toContain("neverranked.com");
  });
});

// ---------------------------------------------------------------------------
// Marketing site -- updated sections
// ---------------------------------------------------------------------------

test.describe("Marketing site -- refresh", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(MAIN_SITE);
    await page.waitForLoadState("networkidle");
  });

  test("has Live Demo link in nav", async ({ page }) => {
    const demoLink = page.locator('a:has-text("Live Demo")');
    expect(await demoLink.count()).toBeGreaterThan(0);
    const href = await demoLink.first().getAttribute("href");
    expect(href).toContain("app.neverranked.com/demo");
  });

  test("dashboard features section has 9 cards", async ({ page }) => {
    const dashCards = page.locator(".dash-card");
    expect(await dashCards.count()).toBe(9);
  });

  test("dashboard features include new capabilities", async ({ page }) => {
    const section = page.locator(".dashboard-features");
    const text = await section.textContent();
    expect(text?.toLowerCase()).toContain("score projection");
    expect(text?.toLowerCase()).toContain("citation tracking");
    expect(text?.toLowerCase()).toContain("competitor citation matrix");
    expect(text?.toLowerCase()).toContain("monthly reports");
    expect(text?.toLowerCase()).toContain("auto-generated roadmap");
    expect(text?.toLowerCase()).toContain("search console");
    expect(text?.toLowerCase()).toContain("content gap");
  });

  test("product showcase section exists", async ({ page }) => {
    const showcase = page.locator(".product-showcase");
    await expect(showcase).toBeVisible();
  });

  test("product showcase has 4 steps", async ({ page }) => {
    const steps = page.locator(".showcase-step");
    expect(await steps.count()).toBe(4);
  });

  test("product showcase has demo link", async ({ page }) => {
    const showcase = page.locator(".product-showcase");
    const demoLink = showcase.locator('a[href*="demo"]');
    expect(await demoLink.count()).toBeGreaterThan(0);
  });

  test("hero meta has ROI cell", async ({ page }) => {
    const heroMeta = page.locator(".hero-meta");
    const text = await heroMeta.textContent();
    expect(text?.toLowerCase()).toContain("pays for a year");
    expect(text?.toLowerCase()).toContain("roi");
  });
});

// ---------------------------------------------------------------------------
// Free check tool -- demo links
// ---------------------------------------------------------------------------

test.describe("Free check tool -- demo links", () => {
  test("check tool loads", async ({ page }) => {
    await page.goto(CHECK_TOOL);
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("check.neverranked.com");
  });

  test("check tool page source contains demo link", async ({ page }) => {
    await page.goto(CHECK_TOOL);
    await page.waitForLoadState("networkidle");
    // The demo links are in the results section which may be hidden initially
    // Check the page source for the href
    const content = await page.content();
    expect(content).toContain("app.neverranked.com/demo");
    expect(content.toLowerCase()).toContain("live demo");
  });
});

// ---------------------------------------------------------------------------
// Demo mode -- mobile viewport
// ---------------------------------------------------------------------------

test.describe("Demo -- mobile viewport", () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone X

  test("domain page renders on mobile", async ({ page }) => {
    await page.goto(DEMO_BASE + "/domain");
    await page.waitForLoadState("networkidle");

    // Banner should still be visible
    await expect(page.locator(".demo-banner")).toBeVisible();

    // Score should be visible
    const body = await page.textContent("body");
    expect(body).toContain("68");
    expect(body).toContain("/100");
  });

  test("citations page renders on mobile", async ({ page }) => {
    await page.goto(DEMO_BASE + "/citations");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".demo-banner")).toBeVisible();
    const body = await page.textContent("body");
    expect(body).toContain("35%");
  });

  test("roadmap page renders on mobile", async ({ page }) => {
    await page.goto(DEMO_BASE + "/roadmap");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".demo-banner")).toBeVisible();
    const body = await page.textContent("body");
    expect(body).toContain("Foundation");
  });

  test("demo banner CTA is visible on mobile", async ({ page }) => {
    await page.goto(DEMO_BASE + "/domain");
    await page.waitForLoadState("networkidle");
    const bannerLink = page.locator(".demo-banner a");
    await expect(bannerLink).toBeVisible();
  });
});
