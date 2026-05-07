/**
 * System Pulse — three-state heartbeat (done / now / next) rendered
 * in the topbar so the dashboard never reads as "standing still."
 *
 * Per-client scope (default): what the system did for THEIR account
 * recently, what's currently watching, and the next scheduled action.
 *
 * Admin scope (when user.real_role === 'admin'): aggregated across
 * every active client so Lance sees the platform-wide pulse.
 *
 * No JS polling. Values refresh on every page navigation, which in a
 * dashboard session means every few seconds. Cheap to compute.
 */

import type { Env, User } from "./types";

export interface PulseState {
  done: string;      // What just happened. "Scanned 3h ago", "14 scans today"
  now: string;       // What's running. "Monitoring", "2 scans active"
  next: string;      // What's queued. "Next scan in 4h", "Mon 06:00 UTC"
  scope: "client" | "admin";
}

/** Compute the next firing time of the daily 06:00 UTC cron from now. */
function nextDailyCron(nowMs: number): number {
  const d = new Date(nowMs);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 6, 0, 0));
  if (target.getTime() <= nowMs) target.setUTCDate(target.getUTCDate() + 1);
  return target.getTime();
}

/** Compute the next Monday 06:00 UTC (the weekly scan slot). */
function nextWeeklyScan(nowMs: number): number {
  const d = new Date(nowMs);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 6, 0, 0));
  // 1 = Monday in JS getUTCDay
  const daysUntilMon = (1 - target.getUTCDay() + 7) % 7;
  target.setUTCDate(target.getUTCDate() + daysUntilMon);
  if (target.getTime() <= nowMs) target.setUTCDate(target.getUTCDate() + 7);
  return target.getTime();
}

/** Format a millisecond delta as a compact "in 4h 12m" or "in 2d 6h" string. */
function inFromNow(targetMs: number, nowMs: number): string {
  const diff = Math.max(0, targetMs - nowMs);
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d ${hours % 24}h`;
  if (hours >= 1) return `${hours}h ${mins % 60}m`;
  if (mins >= 1) return `${mins}m`;
  return "any moment";
}

/** Format a past timestamp as "3h ago" / "2d ago" / "just now". */
function ago(tsSec: number, nowSec: number): string {
  const diff = Math.max(0, nowSec - tsSec);
  const mins = Math.floor(diff / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d ago`;
  if (hours >= 1) return `${hours}h ago`;
  if (mins >= 1) return `${mins}m ago`;
  return "just now";
}

export async function computePulse(user: User, env: Env): Promise<PulseState | null> {
  const isAdminScope = user.real_role === "admin";
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const nextWeekly = nextWeeklyScan(nowMs);
  const nextDaily = nextDailyCron(nowMs);

  if (isAdminScope) {
    // Aggregated across all active clients.
    const startOfDay = nowSec - (nowSec % 86400);
    const todayScans = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM scan_results WHERE scanned_at >= ?`
    ).bind(startOfDay).first<{ n: number }>();
    const lastScan = await env.DB.prepare(
      `SELECT scanned_at FROM scan_results ORDER BY scanned_at DESC LIMIT 1`
    ).first<{ scanned_at: number }>();
    const activeClients = await env.DB.prepare(
      `SELECT COUNT(DISTINCT client_slug) AS n FROM domains WHERE active = 1 AND is_competitor = 0`
    ).first<{ n: number }>();

    const done = todayScans?.n
      ? `${todayScans.n} scan${todayScans.n === 1 ? "" : "s"} today`
      : (lastScan ? `Last scan ${ago(lastScan.scanned_at, nowSec)}` : "Idle");
    const now = `Monitoring ${activeClients?.n || 0} client${activeClients?.n === 1 ? "" : "s"}`;
    // Next event: whichever fires sooner (daily cron at 06:00 UTC, or weekly Monday scan).
    const nextTs = Math.min(nextDaily, nextWeekly);
    const nextLabel = nextTs === nextWeekly ? "Weekly scan" : "Daily cycle";
    const next = `${nextLabel} in ${inFromNow(nextTs, nowMs)}`;

    return { done, now, next, scope: "admin" };
  }

  // Client scope.
  const slug = user.client_slug;
  if (!slug) return null;

  const lastScan = await env.DB.prepare(
    `SELECT sr.scanned_at FROM scan_results sr
     JOIN domains d ON sr.domain_id = d.id
     WHERE d.client_slug = ? AND d.is_competitor = 0
     ORDER BY sr.scanned_at DESC LIMIT 1`
  ).bind(slug).first<{ scanned_at: number }>();

  const done = lastScan
    ? `Scanned ${ago(lastScan.scanned_at, nowSec)}`
    : "Awaiting first scan";
  const now = "Monitoring citations & bots";
  const next = `Next scan in ${inFromNow(nextWeekly, nowMs)}`;

  return { done, now, next, scope: "client" };
}

/** Render the pulse as a topbar-friendly inline strip. Three slots,
 *  monospace label/value pairs, all visible at once. */
export function renderPulseChip(p: PulseState): string {
  const dot = (color: string) => `<span style="display:inline-block;width:6px;height:6px;background:${color};border-radius:50%;flex-shrink:0"></span>`;
  const slot = (icon: string, text: string) => `
    <span style="display:inline-flex;align-items:center;gap:6px;font-family:var(--label);font-size:10px;letter-spacing:.08em;color:var(--text-faint);white-space:nowrap">
      ${icon}<span>${text}</span>
    </span>`;
  return `
    <div title="System pulse${p.scope === "admin" ? " · admin scope" : ""}" style="display:none;align-items:center;gap:14px;padding:6px 12px;background:rgba(74,222,128,.04);border:1px solid rgba(74,222,128,.18);border-radius:2px"
      class="system-pulse">
      ${slot(dot("var(--green)"), p.done)}
      ${slot(`<span style="display:inline-block;width:6px;height:6px;border:1.5px solid var(--gold);border-radius:50%;border-right-color:transparent;animation:pulse-spin 2s linear infinite"></span>`, p.now)}
      ${slot(`<span style="color:var(--text-faint);font-family:var(--mono)">&#9201;</span>`, p.next)}
    </div>
    <style>
      @keyframes pulse-spin { to { transform: rotate(360deg); } }
      @media (min-width: 900px) { .system-pulse { display: inline-flex !important; } }
    </style>`;
}
