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
    const existing = await env.DB.prepare(
      `SELECT id FROM admin_alerts
         WHERE client_slug = ?
           AND type = ?
           AND created_at > ?
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
