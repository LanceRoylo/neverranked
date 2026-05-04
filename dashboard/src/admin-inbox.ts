/**
 * Admin inbox: the founder's single surface for "what needs my
 * attention." Producers write rows when something needs human review
 * or approval. The /admin/inbox page + daily 7am Pacific email surface
 * them. Items resolve via approve/reject/snooze actions.
 *
 * Producer ergonomics:
 *   - addInboxItem() is idempotent via UNIQUE(kind, target_type, target_id)
 *     so a producer can be called repeatedly without creating duplicates
 *   - urgency='high' triggers an immediate email to ADMIN_EMAIL on top of
 *     the daily summary
 *
 * Resolver ergonomics:
 *   - resolveInboxItem() is the single mutation -- approve/reject/resolve
 *     all flow through it. snoozeInboxItem() is separate because it
 *     re-surfaces later instead of closing the row.
 */

import type { Env, AdminInboxItem, InboxStatus, InboxUrgency } from "./types";

export interface AddInboxParams {
  kind: string;
  title: string;
  body?: string;
  action_url?: string;
  target_type?: string;
  target_id?: number;
  target_slug?: string;
  urgency?: InboxUrgency;
}

/**
 * Idempotent producer write. If a row already exists for the same
 * (kind, target_type, target_id), updates title/body/action_url/urgency
 * in place but preserves status -- so a previously-resolved item won't
 * silently re-open. To re-open a resolved item, the producer must
 * delete it first (rare; usually create a new kind instead).
 */
export async function addInboxItem(env: Env, params: AddInboxParams): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const urgency = params.urgency ?? "normal";

  const result = await env.DB.prepare(
    `INSERT INTO admin_inbox
       (kind, title, body, action_url, target_type, target_id, target_slug, urgency, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
     ON CONFLICT(kind, target_type, target_id) DO UPDATE SET
       title = excluded.title,
       body = excluded.body,
       action_url = excluded.action_url,
       urgency = excluded.urgency
     RETURNING id`,
  ).bind(
    params.kind,
    params.title,
    params.body ?? null,
    params.action_url ?? null,
    params.target_type ?? null,
    params.target_id ?? null,
    params.target_slug ?? null,
    urgency,
    now,
  ).first<{ id: number }>();

  const id = result?.id ?? 0;

  if (urgency === "high") {
    // Fire immediate email; don't await -- caller shouldn't block on
    // email infrastructure. Errors logged in the sender.
    notifyInboxImmediate(env, { ...params, id, created_at: now }).catch((e) => {
      console.log(`[admin-inbox] immediate notify failed for id=${id}: ${e instanceof Error ? e.message : e}`);
    });
  }

  return id;
}

/**
 * Pending inbox: status='pending' OR (status='snoozed' AND past
 * snoozed_until). Sorted by urgency desc (high first), then oldest
 * first within urgency tier.
 */
export async function getPendingInbox(env: Env, limit = 50): Promise<AdminInboxItem[]> {
  const now = Math.floor(Date.now() / 1000);
  const rows = (await env.DB.prepare(
    `SELECT * FROM admin_inbox
       WHERE status = 'pending'
          OR (status = 'snoozed' AND snoozed_until IS NOT NULL AND snoozed_until <= ?)
       ORDER BY CASE urgency WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
                created_at ASC
       LIMIT ?`,
  ).bind(now, limit).all<AdminInboxItem>()).results;
  return rows;
}

export async function getResolvedInbox(env: Env, limit = 50): Promise<AdminInboxItem[]> {
  const rows = (await env.DB.prepare(
    `SELECT * FROM admin_inbox
       WHERE status IN ('approved', 'rejected', 'resolved')
       ORDER BY resolved_at DESC
       LIMIT ?`,
  ).bind(limit).all<AdminInboxItem>()).results;
  return rows;
}

export async function getInboxItem(env: Env, id: number): Promise<AdminInboxItem | null> {
  return (await env.DB.prepare("SELECT * FROM admin_inbox WHERE id = ?").bind(id).first<AdminInboxItem>()) ?? null;
}

export async function resolveInboxItem(
  env: Env,
  id: number,
  status: Exclude<InboxStatus, "pending" | "snoozed">,
  userId: number | null,
  note?: string,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const r = await env.DB.prepare(
    `UPDATE admin_inbox SET status = ?, resolved_at = ?, resolved_by = ?, resolution_note = ?
       WHERE id = ? AND status IN ('pending', 'snoozed')`,
  ).bind(status, now, userId, note ?? null, id).run();
  return (r.meta?.changes ?? 0) > 0;
}

export async function snoozeInboxItem(
  env: Env,
  id: number,
  days: number,
  userId: number | null,
): Promise<boolean> {
  const safeDays = Math.max(1, Math.min(30, Math.floor(days)));
  const until = Math.floor(Date.now() / 1000) + safeDays * 86400;
  const r = await env.DB.prepare(
    `UPDATE admin_inbox SET status = 'snoozed', snoozed_until = ?, resolved_by = ?
       WHERE id = ? AND status = 'pending'`,
  ).bind(until, userId, id).run();
  return (r.meta?.changes ?? 0) > 0;
}

export interface InboxStats {
  pending_total: number;
  pending_high: number;
  pending_normal: number;
  pending_low: number;
  snoozed: number;
  oldest_pending_age_seconds: number | null;
}

export async function getInboxStats(env: Env): Promise<InboxStats> {
  const now = Math.floor(Date.now() / 1000);
  const counts = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_total,
       SUM(CASE WHEN status = 'pending' AND urgency = 'high' THEN 1 ELSE 0 END) AS pending_high,
       SUM(CASE WHEN status = 'pending' AND urgency = 'normal' THEN 1 ELSE 0 END) AS pending_normal,
       SUM(CASE WHEN status = 'pending' AND urgency = 'low' THEN 1 ELSE 0 END) AS pending_low,
       SUM(CASE WHEN status = 'snoozed' THEN 1 ELSE 0 END) AS snoozed,
       MIN(CASE WHEN status = 'pending' THEN created_at END) AS oldest_pending_at
       FROM admin_inbox`,
  ).first<{
    pending_total: number; pending_high: number; pending_normal: number; pending_low: number;
    snoozed: number; oldest_pending_at: number | null;
  }>();

  return {
    pending_total: counts?.pending_total ?? 0,
    pending_high: counts?.pending_high ?? 0,
    pending_normal: counts?.pending_normal ?? 0,
    pending_low: counts?.pending_low ?? 0,
    snoozed: counts?.snoozed ?? 0,
    oldest_pending_age_seconds: counts?.oldest_pending_at ? now - counts.oldest_pending_at : null,
  };
}

// ---------- Email channel ----------

const INBOX_BASE = "https://app.neverranked.com/admin/inbox";

function fmtAge(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

async function sendAdminEmail(env: Env, subject: string, text: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[admin-inbox] no RESEND_API_KEY (dev mode)\n${subject}\n${text}`);
    return true;
  }
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "NeverRanked <reports@neverranked.com>",
      to: [env.ADMIN_EMAIL],
      subject,
      text,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    console.log(`[admin-inbox] email failed ${resp.status}: ${err.slice(0, 300)}`);
    return false;
  }
  return true;
}

interface ImmediateNotifyParams extends AddInboxParams {
  id: number;
  created_at: number;
}

async function notifyInboxImmediate(env: Env, item: ImmediateNotifyParams): Promise<void> {
  const subject = `[NeverRanked] Action: ${item.title}`;
  const lines = [
    `${item.title}`,
    "",
    item.body ? item.body : "(no additional context)",
    "",
    `Open: ${INBOX_BASE}/${item.id}`,
    item.action_url ? `Direct link: https://app.neverranked.com${item.action_url.startsWith("/") ? "" : "/"}${item.action_url}` : "",
    "",
    `Inbox: ${INBOX_BASE}`,
  ].filter(Boolean);
  await sendAdminEmail(env, subject, lines.join("\n"));
}

/**
 * Daily morning summary. Fires from cron at 17:00 UTC = 7am Pacific/Honolulu.
 * No-op if no pending items. Always sends to ADMIN_EMAIL when there are.
 */
export async function sendInboxMorningSummary(env: Env): Promise<void> {
  const items = await getPendingInbox(env, 25);
  const stats = await getInboxStats(env);

  // Always send, even on empty days. Silence reads as "either nothing
  // happened or the system is broken" -- both bad. An empty-state
  // email is a positive signal: inbox zero, system alive, nothing
  // requires you today.
  if (items.length === 0) {
    const subject = "[NeverRanked] Inbox zero this morning";
    const text = [
      "Nothing pending in your admin inbox right now.",
      "",
      "Things that would have appeared here:",
      "  - NVI reports awaiting your approval before customer delivery",
      "  - Content drafts in 'in_review' status",
      "  - Tone-guard failures and voice-fingerprint mismatches",
      "  - Schema deploy issues that need a human call",
      "  - High-urgency snippet sweep failures",
      "",
      "Inbox: " + INBOX_BASE,
    ].join("\n");
    await sendAdminEmail(env, subject, text);
    return;
  }

  const subject = `[NeverRanked] ${stats.pending_total} item${stats.pending_total === 1 ? "" : "s"} need your attention`;
  const lines: string[] = [
    `You have ${stats.pending_total} pending item${stats.pending_total === 1 ? "" : "s"} in your admin inbox.`,
    "",
  ];
  if (stats.pending_high > 0) lines.push(`  HIGH urgency:   ${stats.pending_high}`);
  lines.push(`  Normal:         ${stats.pending_normal}`);
  if (stats.pending_low > 0) lines.push(`  Low:            ${stats.pending_low}`);
  if (stats.snoozed > 0) lines.push(`  Snoozed:        ${stats.snoozed}`);
  lines.push("");
  lines.push("Top items (oldest high-urgency first):");
  lines.push("");
  const now = Math.floor(Date.now() / 1000);
  for (const item of items.slice(0, 10)) {
    const age = fmtAge(now - item.created_at);
    const tag = item.urgency === "high" ? "[HIGH]" : item.urgency === "low" ? "[low]" : "";
    const slug = item.target_slug ? ` (${item.target_slug})` : "";
    lines.push(`  ${tag} ${item.title}${slug} — ${age} old`);
    lines.push(`    ${INBOX_BASE}/${item.id}`);
  }
  lines.push("");
  lines.push(`All items: ${INBOX_BASE}`);

  await sendAdminEmail(env, subject, lines.join("\n"));
}

/**
 * Backfill in-review content drafts into the inbox. One-time on first
 * cron run after deploy; subsequent runs are no-ops via the UNIQUE
 * constraint on (kind, target_type, target_id). Safe to call repeatedly.
 */
export async function backfillContentDraftsToInbox(env: Env): Promise<number> {
  const drafts = (await env.DB.prepare(
    `SELECT id, client_slug, title FROM content_drafts WHERE status = 'in_review'`,
  ).all<{ id: number; client_slug: string; title: string }>()).results;

  let added = 0;
  for (const d of drafts) {
    await addInboxItem(env, {
      kind: "content_draft_review",
      title: `Content draft awaiting review: ${d.title}`,
      body: `Draft for client \`${d.client_slug}\`. Open the draft to review and approve, request changes, or reject.`,
      action_url: `/drafts/${d.client_slug}/${d.id}`,
      target_type: "content_draft",
      target_id: d.id,
      target_slug: d.client_slug,
      urgency: "normal",
    });
    added++;
  }
  return added;
}
