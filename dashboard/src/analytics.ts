/**
 * Lightweight event logger — writes to D1 analytics_events table.
 *
 * Fire-and-forget: uses ctx.waitUntil so it never blocks the response.
 * Every event has a type, source, optional detail JSON, and optional user.
 */

import type { Env } from "./types";

export type EventSource = "dashboard" | "check_tool" | "main_site";

export interface AnalyticsEvent {
  type: string;
  source?: EventSource;
  detail?: Record<string, unknown>;
  ipHash?: string;
  userId?: number;
}

/** Hash an IP to a short anonymized string (no raw IPs stored) */
export function hashIP(ip: string): string {
  let h = 0;
  for (let i = 0; i < ip.length; i++) {
    h = ((h << 5) - h + ip.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/** Log an event to D1. Call with ctx.waitUntil(logEvent(...)) */
export async function logEvent(
  env: Env,
  event: AnalyticsEvent
): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO analytics_events (event_type, source, detail, ip_hash, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(
      event.type,
      event.source || "dashboard",
      event.detail ? JSON.stringify(event.detail) : null,
      event.ipHash || null,
      event.userId || null,
      Math.floor(Date.now() / 1000)
    ).run();
  } catch {
    // Never let analytics break the app
  }
}

/** Query event counts for the cockpit pulse section */
export async function getAnalyticsSummary(env: Env): Promise<{
  visits24h: number;
  visits7d: number;
  visits30d: number;
  scans24h: number;
  scans7d: number;
  scans30d: number;
  captures7d: number;
  captures30d: number;
  checkoutStarts7d: number;
  logins7d: number;
}> {
  const now = Math.floor(Date.now() / 1000);
  const h24 = now - 86400;
  const d7 = now - 604800;
  const d30 = now - 2592000;

  try {
    const rows = await env.DB.prepare(`
      SELECT
        SUM(CASE WHEN event_type = 'page_view' AND created_at >= ? THEN 1 ELSE 0 END) as visits24h,
        SUM(CASE WHEN event_type = 'page_view' AND created_at >= ? THEN 1 ELSE 0 END) as visits7d,
        SUM(CASE WHEN event_type = 'page_view' AND created_at >= ? THEN 1 ELSE 0 END) as visits30d,
        SUM(CASE WHEN event_type IN ('scan_complete', 'free_scan') AND created_at >= ? THEN 1 ELSE 0 END) as scans24h,
        SUM(CASE WHEN event_type IN ('scan_complete', 'free_scan') AND created_at >= ? THEN 1 ELSE 0 END) as scans7d,
        SUM(CASE WHEN event_type IN ('scan_complete', 'free_scan') AND created_at >= ? THEN 1 ELSE 0 END) as scans30d,
        SUM(CASE WHEN event_type = 'email_captured' AND created_at >= ? THEN 1 ELSE 0 END) as captures7d,
        SUM(CASE WHEN event_type = 'email_captured' AND created_at >= ? THEN 1 ELSE 0 END) as captures30d,
        SUM(CASE WHEN event_type = 'checkout_view' AND created_at >= ? THEN 1 ELSE 0 END) as checkoutStarts7d,
        SUM(CASE WHEN event_type = 'login' AND created_at >= ? THEN 1 ELSE 0 END) as logins7d
      FROM analytics_events
    `).bind(h24, d7, d30, h24, d7, d30, d7, d30, d7, d7).first();

    return {
      visits24h: (rows?.visits24h as number) || 0,
      visits7d: (rows?.visits7d as number) || 0,
      visits30d: (rows?.visits30d as number) || 0,
      scans24h: (rows?.scans24h as number) || 0,
      scans7d: (rows?.scans7d as number) || 0,
      scans30d: (rows?.scans30d as number) || 0,
      captures7d: (rows?.captures7d as number) || 0,
      captures30d: (rows?.captures30d as number) || 0,
      checkoutStarts7d: (rows?.checkoutStarts7d as number) || 0,
      logins7d: (rows?.logins7d as number) || 0,
    };
  } catch {
    return {
      visits24h: 0, visits7d: 0, visits30d: 0,
      scans24h: 0, scans7d: 0, scans30d: 0,
      captures7d: 0, captures30d: 0,
      checkoutStarts7d: 0, logins7d: 0,
    };
  }
}
