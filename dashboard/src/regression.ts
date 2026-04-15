/**
 * Dashboard -- Score regression detection + alerting
 *
 * Compares latest scan to previous scan. If the score dropped by
 * REGRESSION_THRESHOLD or more, alerts all relevant users immediately.
 */

import type { Env, Domain, User, ScanResult } from "./types";
import { sendRegressionAlert, REGRESSION_THRESHOLD } from "./email";

/** Check if a domain's latest scan shows a significant regression, and alert users */
export async function checkAndAlertRegression(domain: Domain, env: Env): Promise<void> {
  // Get the two most recent scans
  const recent = (await env.DB.prepare(
    "SELECT * FROM scan_results WHERE domain_id = ? ORDER BY scanned_at DESC LIMIT 2"
  ).bind(domain.id).all<ScanResult>()).results;

  const latest = recent[0];
  const previous = recent[1];

  // Need both scans, both successful
  if (!latest || !previous) return;
  if (latest.error || previous.error) return;

  const drop = previous.aeo_score - latest.aeo_score;

  if (drop < REGRESSION_THRESHOLD) return;

  console.log(`Regression detected: ${domain.domain} dropped ${drop} pts (${previous.aeo_score} -> ${latest.aeo_score})`);

  // Find users to alert: clients with this slug + all admins, who have regression alerts on
  const users = (await env.DB.prepare(
    "SELECT * FROM users WHERE (email_regression = 1 OR email_regression IS NULL) AND (role = 'admin' OR client_slug = ?)"
  ).bind(domain.client_slug).all<User>()).results;

  let sent = 0;
  for (const user of users) {
    const ok = await sendRegressionAlert(
      user.email,
      user.name,
      domain.domain,
      domain.id,
      latest.aeo_score,
      previous.aeo_score,
      latest.grade,
      latest,
      env
    );
    if (ok) sent++;

    // Log it
    try {
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        "INSERT INTO email_log (email, type, created_at) VALUES (?, 'regression_alert', ?)"
      ).bind(user.email, now).run();
    } catch {
      // Non-critical
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`Regression alerts sent: ${sent} of ${users.length} for ${domain.domain}`);
}
