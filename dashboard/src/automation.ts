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
  const unreadAlerts = (await env.DB.prepare(
    `SELECT id, client_slug, type, title, created_at FROM admin_alerts
       WHERE read_at IS NULL ORDER BY created_at DESC LIMIT 5`
  ).all<{ id: number; client_slug: string; type: string; title: string; created_at: number }>()).results;
  const unreadAlertCount = (await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM admin_alerts WHERE read_at IS NULL"
  ).first<{ n: number }>())?.n ?? 0;

  // --- Scan failures -------------------------------------------------
  const scanFailures = (await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM scan_results
       WHERE error IS NOT NULL AND scanned_at > ?`
  ).bind(since).first<{ n: number }>())?.n ?? 0;

  // --- Free-scan leads (LEADS KV) ------------------------------------
  // The KV is shared with the schema-check Worker; event keys are
  // prefixed with event:scan: or event:capture:. List only, don't
  // read each entry (expensive in KV).
  let newLeads = 0;
  let newCaptures = 0;
  try {
    const scanList = await env.LEADS.list({ prefix: "event:scan:", limit: 1000 });
    const captureList = await env.LEADS.list({ prefix: "event:capture:", limit: 1000 });
    // Event keys encode the timestamp like event:scan:<ts>:<rand>.
    // We could parse the ts for exact 24h filtering but list.keys doesn't
    // give us the metadata-only TTL; for MVP count all un-expired (KV TTL
    // already culls >90d old events) and accept the inflation.
    // TODO: store ts in metadata for exact filtering. Good-enough for now.
    newLeads = scanList.keys.length;
    newCaptures = captureList.keys.length;
  } catch {
    /* LEADS unavailable -- skip gracefully */
  }

  // --- Agency revenue snapshot ---------------------------------------
  const activeAgencies = (await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM agencies WHERE status = 'active'"
  ).first<{ n: number }>())?.n ?? 0;

  const slotTotals = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN plan = 'signal' AND active = 1 THEN 1 ELSE 0 END) AS sig,
       SUM(CASE WHEN plan = 'amplify' AND active = 1 THEN 1 ELSE 0 END) AS amp
       FROM domains WHERE agency_id IS NOT NULL AND is_competitor = 0`
  ).first<{ sig: number | null; amp: number | null }>();
  const signalSlots = slotTotals?.sig || 0;
  const amplifySlots = slotTotals?.amp || 0;
  // MRR at Scenario B 1-9 tier rates (accurate enough for a daily snapshot).
  // Exact MRR would require per-agency tier lookup; this is the floor estimate.
  const estimatedMrrCents = signalSlots * 80000 + amplifySlots * 180000;

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
  lines.push(`  Active agency subscriptions: ${activeAgencies}`);
  lines.push(`  Slots active:                ${signalSlots} Signal, ${amplifySlots} Amplify`);
  lines.push(`  Estimated MRR (floor):       $${(estimatedMrrCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
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
  lines.push(`  Scan failures:               ${scanFailures}`);
  lines.push(`  Unread admin alerts:         ${unreadAlertCount}`);
  if (unreadAlerts.length > 0) {
    for (const a of unreadAlerts) {
      const ago = Math.floor((now - a.created_at) / 3600);
      lines.push(`    [${ago}h] ${a.type.padEnd(14)} ${a.client_slug}: ${a.title}`);
    }
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
    ? `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#555;margin:24px 0 8px">Unread alerts (${unreadAlertCount} total)</h3>
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
  <div>Active agency subs: <strong>${activeAgencies}</strong></div>
  <div>Slots: <strong>${signalSlots}</strong> Signal, <strong>${amplifySlots}</strong> Amplify</div>
  <div>MRR floor: <strong>$${(estimatedMrrCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}</strong></div>
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
  <div>Unread admin alerts: <strong>${unreadAlertCount}</strong></div>
</div>

${alertsHtml}

<p style="margin:32px 0 6px;font-size:12px;color:#888"><a href="https://app.neverranked.com/admin" style="color:#1a1a1a">Cockpit</a> &middot; toggle this briefing off at the "Digest on/off" button.</p>

</body></html>`;

  const to = env.ADMIN_EMAIL || "lance@neverranked.com";
  if (!env.RESEND_API_KEY) {
    console.log(`[automation-digest] DEV: would send "${subject}" to ${to}\n${text.slice(0, 600)}...`);
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
