/**
 * Dashboard -- admin_alerts helpers
 *
 * Thin wrappers around the admin_alerts table so callers don't have to
 * think about dedup windows or duplicate inserts. Two patterns:
 *
 *   createAlert(...)       -- unconditional insert (legacy sites still use raw SQL)
 *   createAlertIfFresh(...) -- skip if an unread alert with the same
 *                             client_slug + type was inserted in the
 *                             last N hours. Default window is 7 days.
 *
 * Over time, migrate call sites to createAlertIfFresh so cron loops
 * don't spam duplicates when the underlying condition persists.
 */

import type { Env } from "./types";

// Alert types that are INTERNAL ops/infra signals for Lance only. They
// live in admin_alerts keyed by client_slug (so admin views can filter by
// customer), but they must NEVER surface in a customer-facing feed. Any
// customer-facing read MUST gate on isCustomerVisibleAlert().
//
// This list is the fix for the 2026-06-01 leak: HTC's customer activity
// feed was showing "htc_events_stale ... Check /health/htc-events?dryrun=1"
// (raw ops language) because the feed read admin_alerts with no type gate.
//
// Default posture is permissive (show), so genuine customer events with
// dynamic suffixes (grade_reached_C/B/A, phase_completed_1/2/...) surface
// without needing to be enumerated. ANY new internal/ops alert type MUST
// be added here, or it will leak to customers.
const INTERNAL_ALERT_TYPES = new Set<string>([
  "atlas_flag",            // flags routed to Lance
  "memo_drafts_ready",     // monthly memo draft queue
  "deploy",                // deploy markers
  "cron",                  // cron status
  "cron_activated",        // cron activation
  "gsc_token_dead",        // GSC auth expiry (ops)
  "content_queue_low",     // content pipeline ops
  "comp_expiry_marker",    // comp/billing marker
  "audit_qa_run",          // internal QA audits
  "nap_audit",             // internal NAP QA
  "new_issue",             // ops issue tracker
  "agency_apply_submit",   // agency funnel ops
  "agency_onboarding",     // agency funnel ops
]);

/**
 * True if an alert type is safe to show in a CUSTOMER-facing surface
 * (activity feed, digest). Internal ops/infra alerts return false. The
 * htc_events_* family is always internal (legacy snippet maintenance
 * plumbing the customer should never see).
 */
export function isCustomerVisibleAlert(type: string | null | undefined): boolean {
  if (!type) return false;
  if (type.startsWith("htc_events_")) return false;
  return !INTERNAL_ALERT_TYPES.has(type);
}

export interface AlertInput {
  clientSlug: string;
  type: string;
  title: string;
  detail?: string | null;
  roadmapItemId?: number | null;
  /** Dedup window in hours. Default: 168 (7 days). Set to 0 to force. */
  windowHours?: number;
}

export async function createAlertIfFresh(env: Env, alert: AlertInput): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const windowHours = alert.windowHours ?? 168;
  const since = now - windowHours * 3600;

  if (windowHours > 0) {
    // Dedupe against UNREAD alerts only (matches this function's documented
    // contract). Without "read_at IS NULL", the daily age-out sweep (which
    // marks alerts read at 3d/14d) leaves a still-in-window READ alert that
    // suppresses a new one, so a persistent problem (monthly_refresh_overdue,
    // engine_degraded) enters a multi-day blind window: aged-out yet unable
    // to re-fire. There is an index on (read_at, created_at) for this.
    const existing = await env.DB.prepare(
      `SELECT id FROM admin_alerts
         WHERE client_slug = ?
           AND type = ?
           AND created_at > ?
           AND read_at IS NULL
         LIMIT 1`
    ).bind(alert.clientSlug, alert.type, since).first<{ id: number }>();
    if (existing) return false;
  }

  await env.DB.prepare(
    `INSERT INTO admin_alerts (client_slug, type, title, detail, roadmap_item_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    alert.clientSlug,
    alert.type,
    alert.title,
    alert.detail ?? null,
    alert.roadmapItemId ?? null,
    now,
  ).run();
  return true;
}

export async function createAlert(env: Env, alert: Omit<AlertInput, "windowHours">): Promise<void> {
  await createAlertIfFresh(env, { ...alert, windowHours: 0 });
}
