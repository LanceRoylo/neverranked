/**
 * Free-tier cron tasks.
 *
 * runFreeWeeklyDigests: dispatched from the Monday weekly cron
 * after the paid digest fan-out. Iterates free_users with
 * email_alerts=1, gathers the latest scan + previous-week scan,
 * sends the digest. Best-effort: per-user errors are logged
 * and do not abort the batch.
 *
 * runFreeScoreDropAlertsCheck: dispatched from runDailyTasks.
 * Compares each free_user's most recent two scans and fires an
 * alert if score dropped 5+ pts OR crossed a band boundary
 * (green 80+ -> yellow 60-79 -> red <60). Capped at one alert
 * per week per user via free_users.last_alert_at.
 *
 * Spec: content/strategy/free-monitoring-tier.md
 */

import type { Env } from "./types";
import { sendFreeWeeklyDigestEmail, sendFreeScoreDropAlertEmail } from "./email";

interface FreeUserRow {
  id: number;
  email: string;
  domain: string;
  email_alerts: number;
  last_alert_at: number | null;
  unsub_token: string;
}

interface ScanRow {
  aeo_score: number;
  grade: string;
  scanned_at: number;
}

const ALERT_DROP_THRESHOLD = 5; // 5+ point drop triggers alert
const ALERT_COOLDOWN_SEC = 7 * 24 * 60 * 60; // 1 alert/week max

function bandFor(score: number): "green" | "yellow" | "red" {
  if (score >= 80) return "green";
  if (score >= 60) return "yellow";
  return "red";
}

function bandCrossingFor(prev: number, curr: number): FreeAlertCrossing {
  const pb = bandFor(prev);
  const cb = bandFor(curr);
  if (pb === cb) return null;
  if (pb === "green" && cb === "yellow") return "green-to-yellow";
  if (pb === "yellow" && cb === "red") return "yellow-to-red";
  if (pb === "green" && cb === "red") return "green-to-red";
  return null; // upward band crossings are not alerts
}

type FreeAlertCrossing =
  | "green-to-yellow"
  | "yellow-to-red"
  | "green-to-red"
  | null;

export async function runFreeWeeklyDigests(env: Env): Promise<void> {
  const users = (await env.DB.prepare(
    "SELECT id, email, domain, email_alerts, last_alert_at, unsub_token FROM free_users WHERE email_alerts = 1"
  ).all<FreeUserRow>()).results;

  if (users.length === 0) {
    console.log("[free-cron] no free users opted in for digest");
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const u of users) {
    try {
      const scans = (await env.DB.prepare(
        `SELECT sr.aeo_score, sr.grade, sr.scanned_at
         FROM scan_results sr
         JOIN domains d ON sr.domain_id = d.id
         WHERE d.free_user_id = ?
         ORDER BY sr.scanned_at DESC
         LIMIT 2`
      ).bind(u.id).all<ScanRow>()).results;

      if (scans.length === 0) {
        // No scan yet (signup hasn't completed first scan). Skip.
        continue;
      }

      const latest = scans[0];
      const prev = scans[1] || null;

      const ok = await sendFreeWeeklyDigestEmail({
        email: u.email,
        domain: u.domain,
        score: latest.aeo_score,
        grade: latest.grade,
        prevScore: prev ? prev.aeo_score : null,
        unsubToken: u.unsub_token,
      }, env);

      if (ok) sent++;
      else failed++;
    } catch (e) {
      console.log(`[free-cron] digest failure for free_user ${u.id}: ${e}`);
      failed++;
    }
  }

  console.log(`[free-cron] free digests: ${sent} sent, ${failed} failed, ${users.length} total`);
}

export async function runFreeScoreDropAlertsCheck(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const cooldownCutoff = now - ALERT_COOLDOWN_SEC;

  const users = (await env.DB.prepare(
    `SELECT id, email, domain, email_alerts, last_alert_at, unsub_token
     FROM free_users
     WHERE email_alerts = 1
       AND (last_alert_at IS NULL OR last_alert_at < ?)`
  ).bind(cooldownCutoff).all<FreeUserRow>()).results;

  if (users.length === 0) {
    console.log("[free-cron] no free users eligible for score-drop alerts");
    return;
  }

  let alerted = 0;
  for (const u of users) {
    try {
      const scans = (await env.DB.prepare(
        `SELECT sr.aeo_score, sr.grade, sr.scanned_at
         FROM scan_results sr
         JOIN domains d ON sr.domain_id = d.id
         WHERE d.free_user_id = ?
         ORDER BY sr.scanned_at DESC
         LIMIT 2`
      ).bind(u.id).all<ScanRow>()).results;

      if (scans.length < 2) continue; // need a baseline to compare

      const latest = scans[0];
      const prev = scans[1];

      const drop = prev.aeo_score - latest.aeo_score;
      const crossing = bandCrossingFor(prev.aeo_score, latest.aeo_score);
      const shouldAlert = drop >= ALERT_DROP_THRESHOLD || crossing !== null;
      if (!shouldAlert) continue;

      const ok = await sendFreeScoreDropAlertEmail({
        email: u.email,
        domain: u.domain,
        prevScore: prev.aeo_score,
        currScore: latest.aeo_score,
        bandCrossing: crossing,
        unsubToken: u.unsub_token,
      }, env);

      if (ok) {
        alerted++;
        await env.DB.prepare(
          "UPDATE free_users SET last_alert_at = ? WHERE id = ?"
        ).bind(now, u.id).run();
      }
    } catch (e) {
      console.log(`[free-cron] alert check failed for free_user ${u.id}: ${e}`);
    }
  }

  console.log(`[free-cron] score-drop alerts: ${alerted} fired across ${users.length} eligible users`);
}
