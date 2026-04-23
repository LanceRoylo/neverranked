/**
 * Daily safety sweeps.
 *
 * Extensions of the content-pipeline auto-pause pattern to the rest of
 * the system. Each function is idempotent and self-guards with dedupe
 * so re-running the cron doesn't spam alerts.
 *
 * Scope:
 *   - runScanStreakCheck   -- create an admin_alert when a domain hits
 *                             3+ consecutive scan failures, with a
 *                             one-per-domain-per-week dedupe
 *   - runRoadmapStallCheck -- mark roadmap_items "in_progress" for
 *                             14+ days as needing_help so the UI can
 *                             surface them and the cockpit stuck-items
 *                             widget picks them up from status alone
 */

import type { Env } from "./types";
import { createAlertIfFresh } from "./admin-alerts";

const DAY = 86400;

/**
 * Walk each active domain's 3 most recent scans. If all three errored,
 * create an admin alert (dedupe window = 7 days per domain) so the
 * operator sees the failure in the inbox + stuck-items widget.
 */
export async function runScanStreakCheck(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - 30 * DAY;

  const rows = (await env.DB.prepare(
    `SELECT sr.domain_id, sr.error, sr.scanned_at, d.domain, d.client_slug
       FROM scan_results sr
       JOIN domains d ON d.id = sr.domain_id
       WHERE d.active = 1 AND d.is_competitor = 0 AND sr.scanned_at > ?
       ORDER BY sr.domain_id, sr.scanned_at DESC`,
  ).bind(cutoff).all<{ domain_id: number; error: string | null; scanned_at: number; domain: string; client_slug: string }>()).results;

  // Group the most-recent 3 per domain.
  const perDomain = new Map<number, typeof rows>();
  for (const r of rows) {
    const arr = perDomain.get(r.domain_id) || [];
    if (arr.length < 3) arr.push(r);
    perDomain.set(r.domain_id, arr);
  }

  for (const arr of perDomain.values()) {
    if (arr.length < 3) continue;
    if (!arr.every(r => r.error)) continue;
    const first = arr[0];
    await createAlertIfFresh(env, {
      clientSlug: first.client_slug,
      type: "scan_streak",
      title: `Scan failure streak on ${first.domain}`,
      detail: `Last 3 scans errored: ${first.error?.slice(0, 80) || "unknown"}. Needs investigation.`,
      windowHours: 24 * 7,
    });
  }
}

/**
 * Roadmap items that have sat in 'in_progress' for 14+ days are stuck
 * -- the fix may have shipped and our auto-verify missed it, or the
 * customer forgot to follow through. We don't auto-fail them; we just
 * stamp a needs_help marker on updated_at-style signal. The stuck-
 * items widget picks these up via the status+age query.
 *
 * For Phase II we also fire a single admin_alert per client per week
 * so the operator can nudge the customer.
 */
export async function runRoadmapStallCheck(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const staleCutoff = now - 14 * DAY;

  // Count stalls per client, not per item -- the operator doesn't
  // need one alert per stalled item, just one "this client has N".
  const rows = (await env.DB.prepare(
    `SELECT client_slug, COUNT(*) AS cnt
       FROM roadmap_items
       WHERE status = 'in_progress' AND updated_at < ?
       GROUP BY client_slug
       HAVING cnt >= 1`,
  ).bind(staleCutoff).all<{ client_slug: string; cnt: number }>()).results;

  for (const r of rows) {
    await createAlertIfFresh(env, {
      clientSlug: r.client_slug,
      type: "roadmap_stall",
      title: `${r.cnt} roadmap item${r.cnt === 1 ? "" : "s"} stalled`,
      detail: `${r.client_slug} has ${r.cnt} roadmap item${r.cnt === 1 ? "" : "s"} stuck in-progress for 14+ days. Consider a nudge or manual completion check.`,
      windowHours: 24 * 7,
    });
  }
}
