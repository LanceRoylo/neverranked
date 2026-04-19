/**
 * Test helpers -- session management for authenticated tests
 *
 * Uses the live D1 database to create test sessions via wrangler CLI.
 * This avoids needing to go through the magic link email flow.
 */

import { execSync } from "child_process";
import { BrowserContext } from "@playwright/test";

const DASHBOARD_DIR = "/Users/lanceroylo/Desktop/neverranked/dashboard";

/**
 * Get a valid session token for a user by email.
 *
 * Resolution order:
 *   1. PLAYWRIGHT_SESSION_TOKEN env var -- used in CI (no D1 access).
 *      The CI test user is e2e-tests@neverranked.com (an agency_admin)
 *      seeded by dashboard/scripts/seed-e2e-test-session.sql. The token
 *      is stored as a GitHub Secret and exported into the workflow.
 *   2. Wrangler D1 query -- used locally. Looks up the most recent
 *      unexpired session for the requested email.
 */
export function getSessionForUser(email: string): string | null {
  // CI path: a single test user, single token.
  if (process.env.PLAYWRIGHT_SESSION_TOKEN && email === E2E_TEST_AGENCY_ADMIN_EMAIL) {
    return process.env.PLAYWRIGHT_SESSION_TOKEN;
  }
  // Local path: query D1 via wrangler.
  try {
    const result = execSync(
      `cd "${DASHBOARD_DIR}" && npx wrangler d1 execute neverranked-app --remote --command="SELECT s.id FROM sessions s JOIN users u ON s.user_id = u.id WHERE u.email = '${email}' AND s.expires_at > ${Math.floor(Date.now() / 1000)} ORDER BY s.created_at DESC LIMIT 1" --json 2>/dev/null`,
      { encoding: "utf-8", timeout: 15000 }
    );
    const parsed = JSON.parse(result);
    const rows = parsed?.[0]?.results;
    if (rows && rows.length > 0) {
      return rows[0].id;
    }
    return null;
  } catch {
    return null;
  }
}

/** Set the session cookie on a browser context */
export async function authenticateAs(
  context: BrowserContext,
  email: string
): Promise<boolean> {
  const token = getSessionForUser(email);
  if (!token) return false;

  await context.addCookies([
    {
      name: "nr_app",
      value: token,
      domain: "app.neverranked.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
  return true;
}

/** URLs for testing */
export const URLS = {
  dashboard: "https://app.neverranked.com",
  login: "https://app.neverranked.com/login",
  cockpit: "https://app.neverranked.com/admin",
  manage: "https://app.neverranked.com/admin/manage",
  leads: "https://app.neverranked.com/admin/leads",
  settings: "https://app.neverranked.com/settings",
  onboarding: "https://app.neverranked.com/onboarding",
  checkoutAudit: "https://app.neverranked.com/checkout/audit",
  checkoutSignal: "https://app.neverranked.com/checkout/signal",
  checkoutAmplify: "https://app.neverranked.com/checkout/amplify",
  checkoutSuccess: "https://app.neverranked.com/checkout/success?plan=audit",
  mainSite: "https://neverranked.com",
};

export const TEST_ADMIN_EMAIL = "lanceroylo@gmail.com";
export const TEST_CLIENT_EMAIL = "testclient@example.com";
/** Dedicated test user seeded by dashboard/scripts/seed-e2e-test-session.sql.
 *  Used by CI to drive authenticated browsing without D1 access. */
export const E2E_TEST_AGENCY_ADMIN_EMAIL = "e2e-tests@neverranked.com";
export const E2E_TEST_AGENCY_SLUG = "e2e-test-agency";
