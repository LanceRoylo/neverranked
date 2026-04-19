/**
 * Dashboard -- Score regression detection + alerting
 *
 * Compares latest scan to previous scan. If the score dropped by
 * REGRESSION_THRESHOLD or more, alerts all relevant users immediately.
 */

import type { Env, Domain, User, ScanResult } from "./types";
import { sendRegressionAlert, REGRESSION_THRESHOLD, sendGradeUpEmail } from "./email";
import { resolveAgencyForEmail } from "./agency";

// Grades worth celebrating, in ascending order. We fire the celebration
// the first time the grade reaches each tier. Going down then back up
// won't re-fire (admin_alerts row persists).
const GRADE_RANK: Record<string, number> = { F: 0, D: 1, C: 2, B: 3, A: 4 };

/**
 * Fires a grade-up celebration email when this client reaches a NEW
 * (higher) letter grade for the first time. Skips if the grade went
 * down or stayed flat. Skips if we've ever celebrated this grade
 * tier for this client (admin_alerts type='grade_reached_X').
 */
export async function checkAndCelebrateGradeUp(domain: Domain, env: Env): Promise<void> {
  const recent = (await env.DB.prepare(
    "SELECT * FROM scan_results WHERE domain_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 2"
  ).bind(domain.id).all<ScanResult>()).results;
  const latest = recent[0];
  const previous = recent[1];
  if (!latest) return;

  const newRank = GRADE_RANK[latest.grade] ?? -1;
  const prevRank = previous ? (GRADE_RANK[previous.grade] ?? -1) : -1;
  if (newRank <= prevRank) return;  // no jump
  if (latest.grade === "F") return; // F is not a celebration

  // Have we ever celebrated reaching this grade for this client? If so, skip.
  const alertType = `grade_reached_${latest.grade}`;
  const already = await env.DB.prepare(
    "SELECT id FROM admin_alerts WHERE client_slug = ? AND type = ? LIMIT 1"
  ).bind(domain.client_slug, alertType).first<{ id: number }>();
  if (already) return;

  const users = (await env.DB.prepare(
    "SELECT * FROM users WHERE (email_regression = 1 OR email_regression IS NULL) AND (role = 'admin' OR client_slug = ?)"
  ).bind(domain.client_slug).all<User>()).results;
  const agency = await resolveAgencyForEmail(env, { domainId: domain.id });
  if (agency?.contact_email && !users.some((u) => u.email === agency.contact_email)) {
    users.push({ email: agency.contact_email, name: null } as User);
  }

  let sent = 0;
  for (const user of users) {
    const ok = await sendGradeUpEmail(user.email, user.name, {
      domain: domain.domain,
      clientSlug: domain.client_slug,
      newGrade: latest.grade,
      previousGrade: previous?.grade || "F",
      newScore: latest.aeo_score,
    }, env, agency);
    if (ok) sent++;
    await new Promise((r) => setTimeout(r, 200));
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(
    domain.client_slug, alertType,
    `${domain.domain} reached grade ${latest.grade}`,
    `Up from ${previous?.grade || "F"}. Score ${latest.aeo_score}/100. ${sent}/${users.length} celebration emails sent.`,
    now,
  ).run();

  console.log(`[grade-up] celebrated ${domain.client_slug} reaching ${latest.grade} (${sent}/${users.length} emails)`);
}

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

  // Domain-scoped lookup: every recipient of an alert about this domain
  // should see the same agency branding (or NeverRanked if unaffiliated).
  const agency = await resolveAgencyForEmail(env, { domainId: domain.id });

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
      env,
      agency
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
