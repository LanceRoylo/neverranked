/**
 * Dashboard -- Automation runtime
 *
 * Central dispatcher for every autonomous decision the system makes.
 * Every caller follows the same pattern:
 *
 *   if (await isAutomationPaused(env)) {
 *     await surfaceToAdmin(env, ...);
 *     return;
 *   }
 *   // ... do the work ...
 *   await logAutomation(env, { kind, ... });
 *
 * Or equivalently use `runAutomation()` which wraps both the pause
 * check, the log write, and the admin-alert fallback so individual
 * cron tasks don't have to repeat the plumbing.
 *
 * Trust layer goals:
 *   - Every auto-decision leaves a reviewable audit row
 *   - A single pause switch kills all automation instantly
 *   - If paused, auto-decisions become admin_alerts (nothing is lost,
 *     just rerouted to human review)
 */

import type { Env } from "./types";

// ---------------------------------------------------------------------------
// Pause switch
// ---------------------------------------------------------------------------

export interface AutomationSettings {
  paused: boolean;
  pausedReason: string | null;
  pausedAt: number | null;
}

export async function getAutomationSettings(env: Env): Promise<AutomationSettings> {
  const row = await env.DB.prepare(
    "SELECT paused, paused_reason, paused_at FROM automation_settings WHERE id = 1"
  ).first<{ paused: number; paused_reason: string | null; paused_at: number | null }>();
  if (!row) return { paused: false, pausedReason: null, pausedAt: null };
  return {
    paused: row.paused === 1,
    pausedReason: row.paused_reason,
    pausedAt: row.paused_at,
  };
}

export async function setAutomationPaused(
  env: Env,
  paused: boolean,
  reason?: string | null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE automation_settings
        SET paused = ?,
            paused_reason = ?,
            paused_at = ?,
            last_updated_at = ?
      WHERE id = 1`
  ).bind(paused ? 1 : 0, paused ? (reason || null) : null, paused ? now : null, now).run();
}

// ---------------------------------------------------------------------------
// Automation log
// ---------------------------------------------------------------------------

export type AutomationTargetType = "client" | "agency" | "domain" | "schema_injection" | "scan" | "roadmap";

export interface LogEntry {
  kind: string;
  targetType: AutomationTargetType;
  targetId?: number | null;
  targetSlug?: string | null;
  reason: string;
  detail?: Record<string, unknown> | null;
}

export async function logAutomation(env: Env, entry: LogEntry): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO automation_log
       (kind, target_type, target_id, target_slug, reason, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    entry.kind,
    entry.targetType,
    entry.targetId ?? null,
    entry.targetSlug ?? null,
    entry.reason,
    entry.detail ? JSON.stringify(entry.detail) : null,
    now,
  ).run();
}

// ---------------------------------------------------------------------------
// runAutomation: the one-function wrapper every auto-decision site uses.
// Guarantees pause-check, audit log, and admin fallback all fire in the
// right order no matter how the caller exits.
// ---------------------------------------------------------------------------

interface RunOpts<T> extends Omit<LogEntry, "reason"> {
  /** Human-readable one-liner describing what the automation did. */
  reason: string;
  /** The actual work. Return the thing the caller wanted (or void). */
  action: () => Promise<T>;
  /**
   * Optional admin alert to create if automation is paused. Falls back
   * to a generic "paused, skipped X" alert if not provided.
   */
  pausedAlertTitle?: string;
}

export async function runAutomation<T>(env: Env, opts: RunOpts<T>): Promise<T | null> {
  const settings = await getAutomationSettings(env);
  if (settings.paused) {
    // Surface the skipped automation to ops so nothing goes silent.
    try {
      await env.DB.prepare(
        "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES (?, 'automation_paused', ?, ?, ?)"
      ).bind(
        opts.targetSlug || `automation:${opts.kind}`,
        opts.pausedAlertTitle || `Automation paused: skipped ${opts.kind}`,
        `Would have run: ${opts.reason}${settings.pausedReason ? ` (pause reason: ${settings.pausedReason})` : ""}`,
        Math.floor(Date.now() / 1000),
      ).run();
    } catch (e) {
      console.log(`[automation] paused alert insert failed: ${e}`);
    }
    return null;
  }

  const result = await opts.action();

  try {
    await logAutomation(env, {
      kind: opts.kind,
      targetType: opts.targetType,
      targetId: opts.targetId,
      targetSlug: opts.targetSlug,
      reason: opts.reason,
      detail: opts.detail,
    });
  } catch (e) {
    console.log(`[automation] log insert failed for ${opts.kind}: ${e}`);
  }

  return result;
}
