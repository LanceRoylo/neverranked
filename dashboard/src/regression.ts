/**
 * Dashboard -- Score regression detection + alerting
 *
 * Compares latest scan to previous scan. If the score dropped by
 * REGRESSION_THRESHOLD or more, alerts all relevant users immediately.
 */

import type { Env, Domain, ScanResult } from "./types";
import { REGRESSION_THRESHOLD } from "./email";
// resolveAgencyForEmail no longer needed: per-event email blasts replaced
// by client_events log + Monday digest renderer.

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

  // Was: per-event grade-up email blast. Now: log to client_events;
  // the Monday digest renders this as a "Score improved" highlight.
  const { logClientEvent } = await import("./client-events");
  await logClientEvent(env, {
    client_slug: domain.client_slug,
    kind: "grade_up",
    title: `${domain.domain} reached grade ${latest.grade}`,
    body: `Up from ${previous?.grade || "F"}. Score ${latest.aeo_score}/100.`,
    payload: {
      domain: domain.domain,
      newGrade: latest.grade,
      previousGrade: previous?.grade || "F",
      newScore: latest.aeo_score,
    },
  });

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(
    domain.client_slug, alertType,
    `${domain.domain} reached grade ${latest.grade}`,
    `Up from ${previous?.grade || "F"}. Score ${latest.aeo_score}/100. Event logged for next digest.`,
    now,
  ).run();

  console.log(`[grade-up] logged event for ${domain.client_slug} reaching ${latest.grade}`);
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

  // Was: per-event regression alert email blast. Now: log to
  // client_events. Critical: regressions still need fast visibility
  // for the operator, but the CLIENT inbox no longer gets hammered.
  // The digest renders this as a "concern" section with the score
  // delta. If it's severe enough we can short-circuit later, but
  // for now the digest is the right cadence.
  const { logClientEvent } = await import("./client-events");
  await logClientEvent(env, {
    client_slug: domain.client_slug,
    kind: "regression_alert",
    title: `${domain.domain} score dropped ${drop} points`,
    body: `From ${previous.aeo_score} to ${latest.aeo_score} (grade ${latest.grade}).`,
    payload: {
      domain: domain.domain,
      drop,
      newScore: latest.aeo_score,
      previousScore: previous.aeo_score,
      newGrade: latest.grade,
    },
  });

  console.log(`[regression] logged event for ${domain.domain}: dropped ${drop} pts`);
}
