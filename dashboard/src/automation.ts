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
import { assessPeerHealth, summarizePeerHealth } from "./lib/engine-peer-health";
import { sendViaResend } from "./email";

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
 * Build and send the daily morning ops briefing. Includes:
 *   - Automation actions in the last 24h (counts + top 10)
 *   - Unread admin alerts (count + top 5)
 *   - New free-scan leads from LEADS KV (count)
 *   - Scan failures in last 24h (count)
 *   - Active agency subscriptions + MRR
 *
 * Skips when:
 *   - The digest is disabled in settings.
 *   - We already sent one in the last 18 hours (dedupe).
 *   - There's genuinely nothing worth reporting (no actions AND no alerts).
 */
export async function maybeSendAutomationDigest(env: Env): Promise<void> {
  const settings = await getAutomationSettings(env);
  if (!settings.dailyDigestEnabled) return;

  const now = Math.floor(Date.now() / 1000);
  if (settings.lastDigestSentAt && now - settings.lastDigestSentAt < 18 * 3600) {
    return; // already sent today
  }

  const since = now - 24 * 3600;

  // --- Automation ----------------------------------------------------
  const counts = (await env.DB.prepare(
    `SELECT kind, COUNT(*) AS n FROM automation_log WHERE created_at > ? GROUP BY kind ORDER BY n DESC`
  ).bind(since).all<{ kind: string; n: number }>()).results;
  const recent = (await env.DB.prepare(
    `SELECT kind, target_slug, reason, created_at FROM automation_log
       WHERE created_at > ? ORDER BY created_at DESC LIMIT 10`
  ).bind(since).all<DigestRow>()).results;
  const automationTotal = counts.reduce((s, c) => s + c.n, 0);

  // --- Admin alerts (unread) -----------------------------------------
  // Alerts are chosen by TRIAGE LANE, not recency.
  //
  // This used to be `ORDER BY created_at DESC LIMIT 5`. auto_completed fires
  // nightly for every client, so those five slots were permanently occupied by
  // routine good-news rows and a real concern could never appear once it was a
  // day old. Observed 2026-09-07: the briefing showed one anomaly plus four
  // auto_completed while the oldest unread alert was 336 hours (14 days) old
  // and invisible. The triage lanes existed and only the web page used them.
  //
  // Pull a wider window, classify, and show what needs a human first.
  const alertPool = (await env.DB.prepare(
    `SELECT id, client_slug, type, title, created_at FROM admin_alerts
       WHERE read_at IS NULL ORDER BY created_at DESC LIMIT 200`
  ).all<{ id: number; client_slug: string; type: string; title: string; created_at: number }>()).results;
  const { classifyAlert, severityRank } = await import("./lib/alert-triage");
  const triagedPool = alertPool.map((a) => ({ a, t: classifyAlert(a.type) }));
  const needsYou = triagedPool.filter((x) => x.t.lane === "needs_you");
  // Severity first, then OLDEST first: a concern that has been ignored for two
  // weeks is more urgent than one raised an hour ago, and recency ordering is
  // exactly what buried it.
  needsYou.sort((x, y) =>
    severityRank(x.t.severity) - severityRank(y.t.severity) || x.a.created_at - y.a.created_at
  );
  const unreadAlerts = needsYou.slice(0, 5).map((x) => x.a);
  const needsYouCount = needsYou.length;
  const routineCount = triagedPool.length - needsYou.length;
  const unreadAlertCount = (await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM admin_alerts WHERE read_at IS NULL"
  ).first<{ n: number }>())?.n ?? 0;

  // --- Surface health --------------------------------------------------
  // "Scan failures: 0" is true and misleading on its own: a surface that
  // quietly returns FEWER rows throws nothing. On 2026-08-30 this block read
  // "Scan failures: 0" directly above two openai row-drop alerts. Same
  // computation the peer-drop alert fires on, so the digest and the alert can
  // never disagree.
  let peerHealthLine = "not assessed";
  try {
    peerHealthLine = summarizePeerHealth(await assessPeerHealth(env, since));
  } catch (e) {
    peerHealthLine = `not assessed (${e instanceof Error ? e.message : "error"})`;
  }

  // --- Scan failures -------------------------------------------------
  const scanFailures = (await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM scan_results
       WHERE error IS NOT NULL AND scanned_at > ?`
  ).bind(since).first<{ n: number }>())?.n ?? 0;

  // --- Free-scan leads (LEADS KV) ------------------------------------
  // KV shared with schema-check Worker. Event keys prefixed with
  // event:scan: or event:capture:. Paginate via lib/kv-paginate so
  // counts reflect ALL un-expired keys, not just the oldest 1000.
  // KV TTL (90d) already culls old events. The single-page-list bug
  // that caused stale numbers here is documented in lib/kv-paginate.ts.
  let newLeads = 0;
  let newCaptures = 0;
  try {
    const { countKeys } = await import("./lib/kv-paginate");
    newLeads = await countKeys(env.LEADS, "event:scan:");
    newCaptures = await countKeys(env.LEADS, "event:capture:");
  } catch {
    /* LEADS unavailable -- skip gracefully */
  }

  // --- Revenue snapshot -----------------------------------------------
  //
  // REWRITTEN 2026-09-10. Every number in this block was wrong, and the
  // shape of the wrongness is why it went unnoticed for five weeks.
  //
  // MRR was computed as signalSlots * $800 + amplifySlots * $1,800. Signal
  // and Amplify were archived 2026-08-03 when the two-tier ladder replaced
  // all eight old SKUs, so the products priced here do not exist. The line
  // reported "$0" every morning while the company had a paying client, and
  // a metric that always reads zero cannot tell you that revenue just went
  // to zero. That is the same failure as an engine health check judging a
  // rate over rows that only exist when the call already succeeded.
  //
  // The slot count was wrong twice over: two domains DO carry
  // plan='amplify', but the query also required agency_id IS NOT NULL and
  // theirs are null, so even the retired number was under-reported.
  //
  // "Active agency subs" counted agencies.status='active', which is two
  // rows named "Pilot Test" and "E2E Test Agency". Test fixtures reported
  // as customers.
  //
  // Now: one source, customers.mrr_cents, which is what email.ts and
  // weekly-extras.ts already use to decide whether a client is paying.
  const rev = await env.DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN status != 'churned' THEN mrr_cents ELSE 0 END), 0) AS mrr,
       SUM(CASE WHEN status != 'churned' AND mrr_cents > 0 THEN 1 ELSE 0 END) AS paying,
       SUM(CASE WHEN status != 'churned' AND mrr_cents = 0 THEN 1 ELSE 0 END) AS unpaid
       FROM customers`
  ).first<{ mrr: number | null; paying: number | null; unpaid: number | null }>();
  const mrrCents = rev?.mrr || 0;
  const payingClients = rev?.paying || 0;
  const unpaidClients = rev?.unpaid || 0;

  // --- Short-circuit if truly nothing to say -------------------------
  if (automationTotal === 0 && unreadAlertCount === 0 && scanFailures === 0) {
    return;
  }

  // --- Compose --------------------------------------------------------
  const subject = `Briefing: ${automationTotal} auto-action${automationTotal === 1 ? "" : "s"}` +
    (unreadAlertCount > 0 ? `, ${unreadAlertCount} alert${unreadAlertCount === 1 ? "" : "s"}` : "") +
    (scanFailures > 0 ? `, ${scanFailures} scan fail${scanFailures === 1 ? "" : "s"}` : "");

  const lines: string[] = [`NeverRanked morning briefing (last 24h).`, ``];

  lines.push(`BUSINESS`);
  lines.push(`  MRR:             $${(mrrCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}/mo`);
  lines.push(`  Paying clients:  ${payingClients}${unpaidClients > 0 ? `  (plus ${unpaidClients} unpaid pilot${unpaidClients === 1 ? "" : "s"})` : ""}`);
  lines.push(``);

  lines.push(`TRAFFIC`);
  lines.push(`  Free-scan events recorded:   ${newLeads}`);
  lines.push(`  Email captures recorded:     ${newCaptures}`);
  lines.push(``);

  lines.push(`AUTOMATION (${automationTotal} action${automationTotal === 1 ? "" : "s"})`);
  if (counts.length === 0) lines.push(`  (nothing auto-ran in this window)`);
  else for (const c of counts) lines.push(`  - ${c.kind.padEnd(28)} ${c.n}`);
  lines.push(``);

  if (recent.length > 0) {
    lines.push(`RECENT ACTIONS`);
    for (const r of recent) {
      const ago = Math.floor((now - r.created_at) / 3600);
      lines.push(`  [${ago}h ago] ${r.kind}${r.target_slug ? ` (${r.target_slug})` : ""}`);
      lines.push(`    ${r.reason}`);
    }
    lines.push(``);
  }

  lines.push(`HEALTH`);
  lines.push(`  Surfaces degraded:           ${peerHealthLine}`);
  lines.push(`  Scan failures:               ${scanFailures}`);
  // Two honest numbers instead of one misleading one. "30 unread" reads as a
  // chore; "3 need you, 27 routine" is actionable.
  lines.push(`  Alerts needing you:          ${needsYouCount}${routineCount ? ` (+${routineCount} routine)` : ""}`);
  if (unreadAlerts.length > 0) {
    for (const a of unreadAlerts) {
      const ago = Math.floor((now - a.created_at) / 3600);
      const age = ago >= 72 ? `${Math.floor(ago / 24)}d` : `${ago}h`;
      lines.push(`    [${age}] ${a.type.padEnd(20)} ${a.client_slug}: ${a.title}`);
    }
  } else if (unreadAlertCount > 0) {
    lines.push(`    nothing needs you; ${unreadAlertCount} routine`);
  }
  lines.push(``);

  lines.push(`---`);
  lines.push(`Cockpit: https://app.neverranked.com/admin`);
  lines.push(`Toggle this briefing off at the cockpit "Digest on" button.`);

  const text = lines.join("\n");

  // HTML version -- same content, lightly styled
  const countsTable = counts.length > 0
    ? `<table style="width:100%;border-collapse:collapse;font-family:'SF Mono',Menlo,monospace;font-size:12px;margin:0 0 12px">
        ${counts.map((c) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${escapeHtml(c.kind)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${c.n}</td></tr>`).join("")}
      </table>`
    : `<p style="font-family:'SF Mono',Menlo,monospace;font-size:12px;color:#888;margin:0 0 12px">(nothing auto-ran in this window)</p>`;

  const recentHtml = recent.length > 0
    ? `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#555;margin:24px 0 8px">Recent actions</h3>
       <div style="font-family:'SF Mono',Menlo,monospace;font-size:12px;line-height:1.6">
         ${recent.map((r) => {
           const ago = Math.floor((now - r.created_at) / 3600);
           return `<div style="padding:8px 0;border-bottom:1px solid #eee"><span style="color:#c8a850">${escapeHtml(r.kind)}</span>${r.target_slug ? ` <span style="color:#999">${escapeHtml(r.target_slug)}</span>` : ""} <span style="color:#999;margin-left:6px">${ago}h ago</span><div style="color:#555;margin-top:4px">${escapeHtml(r.reason)}</div></div>`;
         }).join("")}
       </div>`
    : "";

  const alertsHtml = unreadAlerts.length > 0
    ? `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#555;margin:24px 0 8px">Needs you (${needsYouCount}${routineCount ? `, ${routineCount} routine hidden` : ""})</h3>
       <div style="font-family:'SF Mono',Menlo,monospace;font-size:12px;line-height:1.6">
         ${unreadAlerts.map((a) => {
           const ago = Math.floor((now - a.created_at) / 3600);
           return `<div style="padding:6px 0;border-bottom:1px solid #eee"><span style="color:#f59e0b;font-weight:600">${escapeHtml(a.type)}</span> <span style="color:#999;margin-left:4px">${ago}h</span><div style="color:#333;margin-top:2px">${escapeHtml(a.client_slug)}: ${escapeHtml(a.title)}</div></div>`;
         }).join("")}
       </div>`
    : "";

  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:580px;margin:0 auto;color:#1a1a1a;font-size:14px;line-height:1.6;padding:0 20px">

<h2 style="margin:0 0 6px;font-size:18px">NeverRanked morning briefing</h2>
<p style="margin:0 0 20px;color:#888;font-size:12px">Last 24 hours &middot; ${new Date(now * 1000).toUTCString()}</p>

<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#555;margin:24px 0 8px">Business</h3>
<div style="font-family:'SF Mono',Menlo,monospace;font-size:12px;line-height:1.8">
  <div>MRR: <strong>$${(mrrCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}</strong>/mo</div>
  <div>Paying clients: <strong>${payingClients}</strong>${unpaidClients > 0 ? ` &middot; unpaid pilots: <strong>${unpaidClients}</strong>` : ""}</div>
</div>

<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#555;margin:24px 0 8px">Traffic (KV)</h3>
<div style="font-family:'SF Mono',Menlo,monospace;font-size:12px;line-height:1.8">
  <div>Free-scan events: <strong>${newLeads}</strong></div>
  <div>Email captures: <strong>${newCaptures}</strong></div>
</div>

<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#555;margin:24px 0 8px">Automation (${automationTotal} action${automationTotal === 1 ? "" : "s"})</h3>
${countsTable}

${recentHtml}

<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#555;margin:24px 0 8px">Health</h3>
<div style="font-family:'SF Mono',Menlo,monospace;font-size:12px;line-height:1.8">
  <div>Scan failures (24h): <strong>${scanFailures}</strong></div>
  <div>Alerts needing you: <strong>${needsYouCount}</strong>${routineCount ? ` <span style="color:#999">(+${routineCount} routine)</span>` : ""}</div>
</div>

${alertsHtml}

<p style="margin:32px 0 6px;font-size:12px;color:#888"><a href="https://app.neverranked.com/admin" style="color:#1a1a1a">Cockpit</a> &middot; toggle this briefing off at the "Digest on/off" button.</p>

</body></html>`;

  const to = env.ADMIN_EMAIL || "lance@hi.neverranked.com";
  if (!env.RESEND_API_KEY) {
    console.log(`[automation-digest] DEV: would send "${subject}" to ${to}\n${text.slice(0, 600)}...`);
    return;
  }

  try {
    const resp = await sendViaResend(env, {
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
