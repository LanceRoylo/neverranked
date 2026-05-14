/**
 * Agency onboarding audit — walks the full agency signup + adds-client flow.
 *
 * Uses disposable test data:
 *   email:        audit-<ts>@neverranked.test
 *   agency slug:  audit-agency-<ts>
 *   client slug:  audit-client-<ts>
 *
 * Not a CI test. Run manually:
 *   npx playwright test tests/99-agency-audit.spec.ts --project=chromium --reporter=list
 */
import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// Resolve relative to repo root so this works on any machine when
// invoked manually (not in CI -- 99-* is testIgnore'd).
const REPO_ROOT = path.resolve(__dirname, "..");
const DASH = path.join(REPO_ROOT, "dashboard");
const TS = Date.now();
const AUDIT_EMAIL = `audit-${TS}@neverranked.test`;
const AUDIT_AGENCY = `Audit Agency ${TS}`;
const AUDIT_SITE = `https://audit-${TS}.test`;
const SHOTS = path.join(REPO_ROOT, "test-results", "agency-audit");
fs.mkdirSync(SHOTS, { recursive: true });

function sql(q: string): any {
  // Do NOT swallow stderr -- silent failures here are how this suite
  // leaked test agencies into production for weeks. Wrangler prints
  // FK violations and SQL errors to stderr; stdout has the JSON body.
  let stdout = "";
  try {
    stdout = execSync(
      `cd "${DASH}" && npx wrangler d1 execute neverranked-app --remote --command=${JSON.stringify(q)} --json`,
      { encoding: "utf-8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch (e: any) {
    const msg = (e.stderr || e.message || "").toString().slice(0, 400);
    throw new Error(`sql() failed: ${q.slice(0, 120)}\n  ${msg}`);
  }
  // Wrangler prints status banners before the JSON; find the array.
  const i = stdout.indexOf("[");
  try {
    return JSON.parse(i >= 0 ? stdout.slice(i) : stdout)?.[0]?.results ?? [];
  } catch {
    return [];
  }
}

function shot(page: any, name: string) {
  return page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

test.describe("Agency audit", () => {
  test.describe.configure({ mode: "serial" });

  test("1. marketing /for-agencies — self-serve signup discoverability", async ({ page }) => {
    const resp = await page.goto("https://neverranked.com/for-agencies/", { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBe(200);
    await shot(page, "01-for-agencies");

    const applyLinks = await page.locator('a[href*="/agency/apply"]').count();
    const mailto = await page.locator('a[href^="mailto:"]').count();
    console.log(`[audit] /for-agencies: apply-links=${applyLinks}, mailto-links=${mailto}`);
    // Friction flag: if applyLinks===0 and mailto>0, there's no self-serve path from the marketing page.
  });

  test("2. /agency/apply form renders + submits", async ({ page }) => {
    const resp = await page.goto("https://app.neverranked.com/agency/apply", { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBe(200);
    await shot(page, "02-apply-form");

    await page.fill('input[name="agency_name"]', AUDIT_AGENCY);
    await page.fill('input[name="contact_name"]', "Audit Tester");
    await page.fill('input[name="contact_email"]', AUDIT_EMAIL);
    await page.fill('input[name="website"]', AUDIT_SITE);
    await page.fill('input[name="estimated_clients"]', "5");
    await page.fill('textarea[name="notes"]', `Automated audit run at ${new Date().toISOString()}`);
    await Promise.all([
      page.waitForURL(/\/agency\/apply/, { timeout: 10000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForLoadState("domcontentloaded");
    await shot(page, "03-apply-thankyou");
    await expect(page.locator("body")).toContainText(/Thanks|Got it/i);

    // Verify DB row landed
    const rows = sql(`SELECT id, status, contact_email FROM agency_applications WHERE contact_email='${AUDIT_EMAIL}'`);
    console.log(`[audit] application row: ${JSON.stringify(rows)}`);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("pending");
  });

  test("3. simulate admin approval + capture magic link", async ({ page }) => {
    // Fetch application id
    const apps = sql(`SELECT id, agency_name, contact_email, contact_name FROM agency_applications WHERE contact_email='${AUDIT_EMAIL}'`);
    expect(apps.length).toBe(1);
    const appId = apps[0].id;

    // Directly simulate what /admin/inbox approval does. We can't click
    // that UI without Lance's session, but replicating the DB effect
    // gives us the same downstream state to test.
    const now = Math.floor(Date.now() / 1000);
    const slug = `audit-agency-${TS}`;
    const primaryColor = "#c9a84c";
    const sqlCmds = [
      `UPDATE agency_applications SET status='approved', reviewed_at=${now} WHERE id=${appId}`,
      `INSERT INTO agencies (slug, name, contact_email, primary_color, status, stripe_subscription_id, created_at, updated_at) VALUES ('${slug}', ${JSON.stringify(AUDIT_AGENCY)}, '${AUDIT_EMAIL}', '${primaryColor}', 'active', 'sub_audit_${TS}', ${now}, ${now})`,
    ];
    for (const q of sqlCmds) sql(q);
    const agencyRow = sql(`SELECT id FROM agencies WHERE slug='${slug}'`)[0];
    const agencyId = agencyRow.id;

    sql(`INSERT INTO users (email, name, role, agency_id, created_at) VALUES ('${AUDIT_EMAIL}', 'Audit Tester', 'agency_admin', ${agencyId}, ${now})`);
    const userRow = sql(`SELECT id FROM users WHERE email='${AUDIT_EMAIL}'`)[0];

    // Create a session directly so we can bypass email. Token must be
    // 64 lowercase hex chars to match the session-cookie regex.
    const hex32 = () => Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
    const token = hex32();
    const expires = now + 86400;
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('${token}', ${userRow.id}, ${expires}, ${now})`);
    console.log(`[audit] agency_id=${agencyId} user_id=${userRow.id} session=${token}`);

    // Persist for subsequent tests
    fs.writeFileSync(path.join(SHOTS, "session.json"), JSON.stringify({ token, agencyId, userId: userRow.id, slug }));
  });

  test("4. agency admin lands on /agency dashboard", async ({ page, context }) => {
    const { token } = JSON.parse(fs.readFileSync(path.join(SHOTS, "session.json"), "utf-8"));
    await context.addCookies([{
      name: "nr_app", value: token, domain: "app.neverranked.com", path: "/",
      httpOnly: true, secure: true, sameSite: "Lax",
    }]);
    const resp = await page.goto("https://app.neverranked.com/", { waitUntil: "domcontentloaded" });
    console.log(`[audit] /: ${resp?.status()} ${page.url()}`);
    await shot(page, "04-root-landing");
  });

  test("5. walk agency dashboard + add-client form", async ({ page, context }) => {
    const { token } = JSON.parse(fs.readFileSync(path.join(SHOTS, "session.json"), "utf-8"));
    await context.addCookies([{
      name: "nr_app", value: token, domain: "app.neverranked.com", path: "/",
      httpOnly: true, secure: true, sameSite: "Lax",
    }]);
    await page.goto("https://app.neverranked.com/agency", { waitUntil: "domcontentloaded" });
    await shot(page, "05-agency-dash");

    // Go to add client form
    const resp = await page.goto("https://app.neverranked.com/agency/clients/new", { waitUntil: "domcontentloaded" });
    console.log(`[audit] /agency/clients/new: ${resp?.status()}`);
    await shot(page, "06-add-client-form");

    const bodyText = await page.locator("body").innerText();
    console.log(`[audit] add-client body first 500 chars: ${bodyText.slice(0, 500)}`);
  });

  test("6. submit add-client form", async ({ page, context }) => {
    const { token } = JSON.parse(fs.readFileSync(path.join(SHOTS, "session.json"), "utf-8"));
    await context.addCookies([{
      name: "nr_app", value: token, domain: "app.neverranked.com", path: "/",
      httpOnly: true, secure: true, sameSite: "Lax",
    }]);
    await page.goto("https://app.neverranked.com/agency/clients/new", { waitUntil: "domcontentloaded" });

    const clientDomain = `audit-client-${TS}.test`;
    await page.fill('input[name="domain"]', clientDomain);
    // slug auto-derives; leave it
    await shot(page, "07-add-client-filled");

    // Submit
    const submitBtn = page.locator('button[type="submit"]').last();
    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      submitBtn.click(),
    ]);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const finalUrl = page.url();
    console.log(`[audit] post-submit url: ${finalUrl}`);
    await shot(page, "08-after-add-client");

    // Check the DB
    const clientRow = sql(`SELECT id, client_slug, domain, is_competitor FROM domains WHERE domain='${clientDomain}'`);
    console.log(`[audit] new client domain row: ${JSON.stringify(clientRow)}`);

    const pageText = await page.locator("body").innerText();
    console.log(`[audit] after-submit body first 300 chars: ${pageText.slice(0, 300).replace(/\n+/g, " | ")}`);

    fs.writeFileSync(path.join(SHOTS, "client.json"), JSON.stringify({ clientDomain, clientRow }));
  });

  test("7. walk the client's first-login experience", async ({ page, context }) => {
    const { clientDomain, clientRow } = JSON.parse(fs.readFileSync(path.join(SHOTS, "client.json"), "utf-8"));
    if (!clientRow?.length) {
      console.log(`[audit] no client row was created -- skipping client login test`);
      return;
    }
    const clientSlug = clientRow[0].client_slug;
    // Find (or make) a client user for that slug.
    let clientUser = sql(`SELECT id, email FROM users WHERE client_slug='${clientSlug}' AND role='client' LIMIT 1`);
    let clientUserId: number;
    let clientEmail: string;
    if (clientUser.length) {
      clientUserId = clientUser[0].id;
      clientEmail = clientUser[0].email;
    } else {
      clientEmail = `audit-client-${TS}@neverranked.test`;
      const now = Math.floor(Date.now() / 1000);
      sql(`INSERT INTO users (email, name, role, client_slug, created_at) VALUES ('${clientEmail}', 'Audit Client', 'client', '${clientSlug}', ${now})`);
      clientUserId = sql(`SELECT id FROM users WHERE email='${clientEmail}'`)[0].id;
    }
    const hex32 = () => Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
    const clientToken = hex32();
    const now = Math.floor(Date.now() / 1000);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('${clientToken}', ${clientUserId}, ${now + 86400}, ${now})`);

    await context.clearCookies();
    await context.addCookies([{
      name: "nr_app", value: clientToken, domain: "app.neverranked.com", path: "/",
      httpOnly: true, secure: true, sameSite: "Lax",
    }]);

    await page.goto("https://app.neverranked.com/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    console.log(`[audit] client landing url: ${page.url()}`);
    await shot(page, "09-client-first-login");

    const pageText = await page.locator("body").innerText();
    console.log(`[audit] client first-login body first 400 chars: ${pageText.slice(0, 400).replace(/\n+/g, " | ")}`);

    fs.writeFileSync(path.join(SHOTS, "client-session.json"), JSON.stringify({ clientToken, clientUserId, clientSlug, clientEmail }));
  });

  test("8. cleanup", async () => {
    const ss = JSON.parse(fs.readFileSync(path.join(SHOTS, "session.json"), "utf-8"));
    let clientSession: any = null;
    try {
      clientSession = JSON.parse(fs.readFileSync(path.join(SHOTS, "client-session.json"), "utf-8"));
    } catch {}

    // Cleanup order matters because FKs are enforced and there is no
    // ON DELETE CASCADE. Order:
    //   1. sessions (no children)
    //   2. scan_results, monitored_pages_scans, page_scan_results,
    //      roadmap_items (reference domain or client_slug)
    //   3. domains
    //   4. agency_invites, agency_slot_events, email_delivery_log,
    //      exit_surveys, nps_responses, agency_applications
    //   5. NULL out users.agency_id and domains.agency_id (in case any
    //      survived prior steps -- belt and braces)
    //   6. users
    //   7. agencies
    //   8. admin_alerts last (referenced by nothing, but tied by detail text)
    const slugList: string[] = [];
    if (clientSession?.clientSlug) slugList.push(clientSession.clientSlug);
    const slugIn = slugList.length
      ? `(${slugList.map(s => `'${s.replace(/'/g, "''")}'`).join(",")})`
      : "('__never__')";

    const cleanup = [
      // 1. sessions
      `DELETE FROM sessions WHERE id='${ss.token}'`,
      ...(clientSession ? [`DELETE FROM sessions WHERE id='${clientSession.clientToken}'`] : []),

      // 2. domain-scoped data. Anything that references domain_id must
      //    be deleted before the domain row itself, including
      //    agency_slot_events which has a NOT NULL FK to domains.
      `DELETE FROM scan_results WHERE domain_id IN (SELECT id FROM domains WHERE domain LIKE 'audit-client-${TS}%' OR client_slug IN ${slugIn})`,
      `DELETE FROM page_scans WHERE domain_id IN (SELECT id FROM domains WHERE domain LIKE 'audit-client-${TS}%' OR client_slug IN ${slugIn})`,
      `DELETE FROM monitored_pages WHERE domain_id IN (SELECT id FROM domains WHERE domain LIKE 'audit-client-${TS}%' OR client_slug IN ${slugIn})`,
      `DELETE FROM agency_slot_events WHERE agency_id=${ss.agencyId}`,
      `DELETE FROM roadmap_items WHERE client_slug IN ${slugIn}`,
      `DELETE FROM roadmap_phases WHERE client_slug IN ${slugIn}`,

      // 3. domains
      `DELETE FROM domains WHERE domain LIKE 'audit-client-${TS}%' OR client_slug IN ${slugIn}`,

      // 4. remaining agency-scoped data
      `DELETE FROM agency_invites WHERE agency_id=${ss.agencyId}`,
      `DELETE FROM email_delivery_log WHERE agency_id=${ss.agencyId}`,
      `DELETE FROM exit_surveys WHERE agency_id=${ss.agencyId}`,
      `DELETE FROM nps_responses WHERE agency_id=${ss.agencyId}`,
      `DELETE FROM agency_applications WHERE contact_email='${AUDIT_EMAIL}'`,

      // 5. null out remaining FK refs
      `UPDATE domains SET agency_id=NULL WHERE agency_id=${ss.agencyId}`,
      `UPDATE users SET agency_id=NULL WHERE agency_id=${ss.agencyId}`,

      // 6. users
      `DELETE FROM users WHERE id=${ss.userId}`,
      ...(clientSession ? [`DELETE FROM users WHERE id=${clientSession.clientUserId}`] : []),

      // 7. agencies
      `DELETE FROM agencies WHERE id=${ss.agencyId}`,

      // 8. orphaned alerts
      `DELETE FROM admin_alerts WHERE detail LIKE '%${AUDIT_EMAIL}%'`,
    ];

    const failures: string[] = [];
    for (const q of cleanup) {
      try { sql(q); } catch (e: any) {
        failures.push(`${q.slice(0, 100)}: ${String(e.message || e).slice(0, 200)}`);
      }
    }
    if (failures.length) {
      // Surface every failure -- silent leakage is the whole reason
      // this test was eating production rows for weeks.
      console.log(`[audit] cleanup had ${failures.length} failures:`);
      failures.forEach(f => console.log(`  - ${f}`));
      throw new Error(`Cleanup failed (${failures.length} queries). Fix before re-running.`);
    }

    // Final verification: agency must be gone.
    const left = sql(`SELECT id FROM agencies WHERE id=${ss.agencyId}`);
    expect(left.length, "agency row still present after cleanup").toBe(0);
    console.log(`[audit] cleaned up cleanly (${cleanup.length} queries, agency ${ss.agencyId} gone)`);
  });
});
