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
  dailyDigestEnabled: boolean;
  lastDigestSentAt: number | null;
}

export async function getAutomationSettings(env: Env): Promise<AutomationSettings> {
  const row = await env.DB.prepare(
    `SELECT paused, paused_reason, paused_at, daily_digest_enabled, last_digest_sent_at
       FROM automation_settings WHERE id = 1`
  ).first<{
    paused: number;
    paused_reason: string | null;
    paused_at: number | null;
    daily_digest_enabled: number;
    last_digest_sent_at: number | null;
  }>();
  if (!row) {
    return { paused: false, pausedReason: null, pausedAt: null, dailyDigestEnabled: false, lastDigestSentAt: null };
  }
  return {
    paused: row.paused === 1,
    pausedReason: row.paused_reason,
    pausedAt: row.paused_at,
    dailyDigestEnabled: row.daily_digest_enabled === 1,
    lastDigestSentAt: row.last_digest_sent_at,
  };
}

export async function setDailyDigestEnabled(env: Env, enabled: boolean): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE automation_settings SET daily_digest_enabled = ?, last_updated_at = ? WHERE id = 1"
  ).bind(enabled ? 1 : 0, now).run();
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

// ---------------------------------------------------------------------------
// Daily digest
// ---------------------------------------------------------------------------

interface DigestRow {
  kind: string;
  target_slug: string | null;
  reason: string;
  created_at: number;
}

/**
 * Build and send the daily automation digest email. Skips when:
 *   - The digest is disabled in settings.
 *   - We already sent one in the last 18 hours (dedupe).
 *   - There's nothing to report (zero automation actions in the window).
 *
 * Delivered to env.ADMIN_EMAIL via Resend. Logs locally if no Resend
 * key is configured so dev mode stays useful.
 */
export async function maybeSendAutomationDigest(env: Env): Promise<void> {
  const settings = await getAutomationSettings(env);
  if (!settings.dailyDigestEnabled) return;

  const now = Math.floor(Date.now() / 1000);
  if (settings.lastDigestSentAt && now - settings.lastDigestSentAt < 18 * 3600) {
    return; // already sent today
  }

  const since = now - 24 * 3600;

  // Aggregate counts by kind
  const counts = (await env.DB.prepare(
    `SELECT kind, COUNT(*) AS n FROM automation_log WHERE created_at > ? GROUP BY kind ORDER BY n DESC`
  ).bind(since).all<{ kind: string; n: number }>()).results;

  if (counts.length === 0) return; // nothing to report -- don't spam

  const recent = (await env.DB.prepare(
    `SELECT kind, target_slug, reason, created_at FROM automation_log
       WHERE created_at > ?
       ORDER BY created_at DESC
       LIMIT 15`
  ).bind(since).all<DigestRow>()).results;

  const total = counts.reduce((s, c) => s + c.n, 0);
  const subject = `Automation digest: ${total} action${total === 1 ? "" : "s"} in the last 24h`;

  const countsLines = counts.map((c) => `  - ${c.kind.padEnd(28)} ${c.n}`).join("\n");
  const recentLines = recent
    .map((r) => {
      const ago = Math.floor((now - r.created_at) / 3600);
      return `  [${ago}h ago] ${r.kind}${r.target_slug ? ` (${r.target_slug})` : ""}\n    ${r.reason}`;
    })
    .join("\n\n");

  const text = [
    `Your NeverRanked automation layer took ${total} action${total === 1 ? "" : "s"} in the last 24 hours.`,
    ``,
    `Counts by kind:`,
    countsLines,
    ``,
    `Most recent ${recent.length}:`,
    ``,
    recentLines,
    ``,
    `---`,
    `See the full log at https://app.neverranked.com/admin`,
    `Disable this digest at /admin (toggle "Daily digest").`,
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;font-size:14px;line-height:1.6;padding:0 20px">
<p style="margin:0 0 16px;font-size:16px">Your NeverRanked automation layer took <strong>${total}</strong> action${total === 1 ? "" : "s"} in the last 24 hours.</p>

<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#555;margin:24px 0 8px">Counts by kind</h3>
<table style="width:100%;border-collapse:collapse;font-family:'SF Mono',Menlo,monospace;font-size:12px">
${counts.map((c) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${escapeHtml(c.kind)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${c.n}</td></tr>`).join("")}
</table>

<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#555;margin:24px 0 8px">Recent ${recent.length}</h3>
<div style="font-family:'SF Mono',Menlo,monospace;font-size:12px;line-height:1.6">
${recent.map((r) => {
  const ago = Math.floor((now - r.created_at) / 3600);
  return `<div style="padding:8px 0;border-bottom:1px solid #eee"><span style="color:#c8a850">${escapeHtml(r.kind)}</span>${r.target_slug ? ` <span style="color:#999">${escapeHtml(r.target_slug)}</span>` : ""} <span style="color:#999;margin-left:6px">${ago}h ago</span><div style="color:#555;margin-top:4px">${escapeHtml(r.reason)}</div></div>`;
}).join("")}
</div>

<p style="margin:24px 0 6px;font-size:12px;color:#888"><a href="https://app.neverranked.com/admin" style="color:#1a1a1a">See the full log</a> or toggle this digest off at /admin.</p>
</body></html>`;

  const to = env.ADMIN_EMAIL || "lance@neverranked.com";
  if (!env.RESEND_API_KEY) {
    console.log(`[automation-digest] DEV: would send "${subject}" to ${to}\n${text.slice(0, 500)}...`);
    return;
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "NeverRanked <reports@neverranked.com>",
        to: [to],
        subject,
        text,
        html,
      }),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      console.log(`[automation-digest] Resend HTTP ${resp.status}: ${err.slice(0, 200)}`);
      return;
    }
    await env.DB.prepare(
      "UPDATE automation_settings SET last_digest_sent_at = ?, last_updated_at = ? WHERE id = 1"
    ).bind(now, now).run();
  } catch (e) {
    console.log(`[automation-digest] send failed: ${e}`);
  }
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
