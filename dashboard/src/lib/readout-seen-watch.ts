/**
 * readout-seen-watch.ts — a delivered readout nobody opened is not delivered.
 *
 * Prince Waikiki's September memo was released on 2026-09-25 and nobody at
 * the client saw it for ten days. "Deliver" in /admin/memos only makes the
 * memo visible in the client's dashboard: it never emails the client, by
 * design. Neither client login had ever signed in. Nothing in the system
 * noticed, because nothing asked whether a released readout had been opened.
 *
 * Two halves:
 *   1. notifyOnDeliver(): releasing a memo raises a high inbox item, "tell the
 *      client it is ready", which stays in the daily briefing until resolved.
 *   2. watchReadoutsSeen(): daily, for each client's latest released memo,
 *      resolves that item once a client login has opened the readout, and
 *      raises "not opened" if no visit is recorded three days after release.
 *
 * WORDING. Like invoice-watch, this never says the client did not look. It
 * says no visit is RECORDED, which is what the page_views table can know. The
 * insert that writes it swallows its own errors, so an absence there can be
 * ours.
 */

import type { Env } from "../types";

/** Days after release before an unopened readout is raised. */
export const UNSEEN_AFTER_DAYS = 3;
/** Only the recent past matters: an old memo is not a live delivery. */
export const WATCH_WINDOW_DAYS = 45;

const monthLabel = (monthKey: string): string => {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};

export async function notifyOnDeliver(env: Env, memoId: number): Promise<void> {
  const m = await env.DB.prepare(
    `SELECT mm.client_slug, mm.month_key, c.name FROM monthly_memos mm
       LEFT JOIN customers c ON c.client_slug = mm.client_slug
      WHERE mm.id = ?`,
  ).bind(memoId).first<{ client_slug: string; month_key: string; name: string | null }>();
  if (!m) return;
  const who = m.name || m.client_slug;
  const url = `https://app.neverranked.com/c/${m.client_slug}/readouts/${m.month_key}`;
  const { addInboxItem } = await import("../admin-inbox");
  await addInboxItem(env, {
    kind: "readout_notify_client",
    title: `Tell ${who} their ${monthLabel(m.month_key)} readout is ready`,
    body:
      `The ${monthLabel(m.month_key)} memo was just released. Releasing it does not email ${who}: ` +
      `it only becomes visible in their dashboard, so until someone tells them, nobody there knows it exists.\n\n` +
      `Send them the link and how to sign in:\n  ${url}\n  Sign in at app.neverranked.com/login with their work address.\n\n` +
      `This closes on its own once one of their logins opens the readout, or resolve it when you have sent the note.`,
    action_url: url,
    target_type: "memo_notify",
    target_id: memoId,
    target_slug: m.client_slug,
    urgency: "high",
  });
}

interface DeliveredRow { id: number; client_slug: string; month_key: string; delivered_at: number; name: string | null; }

export interface SeenWatchResult { checked: number; seen: number; unseen: string[]; resolved: number; }

export async function watchReadoutsSeen(env: Env, nowSec?: number): Promise<SeenWatchResult> {
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  const out: SeenWatchResult = { checked: 0, seen: 0, unseen: [], resolved: 0 };

  // The latest released memo per client, inside the window.
  const rows = (await env.DB.prepare(
    `SELECT mm.id, mm.client_slug, mm.month_key, mm.delivered_at, c.name
       FROM monthly_memos mm
       LEFT JOIN customers c ON c.client_slug = mm.client_slug
      WHERE mm.delivered_at IS NOT NULL AND mm.delivered_at >= ?
        AND mm.delivered_at = (SELECT MAX(delivered_at) FROM monthly_memos x
                                WHERE x.client_slug = mm.client_slug AND x.delivered_at IS NOT NULL)`,
  ).bind(now - WATCH_WINDOW_DAYS * 86400).all<DeliveredRow>()).results;

  const { addInboxItem } = await import("../admin-inbox");
  for (const r of rows) {
    out.checked++;
    // A visit by one of THIS client's own logins, to this readout, after release.
    const visit = await env.DB.prepare(
      `SELECT 1 AS hit FROM page_views pv
         JOIN users u ON u.id = pv.user_id
        WHERE u.client_slug = ? AND u.role = 'client'
          AND pv.path LIKE ? AND pv.created_at >= ?
        LIMIT 1`,
    ).bind(r.client_slug, `/c/${r.client_slug}/readouts/${r.month_key}%`, r.delivered_at)
     .first<{ hit: number }>().catch(() => null);

    if (visit) {
      out.seen++;
      const res = await env.DB.prepare(
        `UPDATE admin_inbox SET status = 'resolved', resolved_at = ?,
                resolution_note = 'auto: a client login opened the readout'
          WHERE status = 'pending' AND target_type IN ('memo_notify', 'memo_unseen') AND target_id = ?`,
      ).bind(now, r.id).run().catch(() => null);
      out.resolved += res?.meta?.changes ?? 0;
      continue;
    }

    const days = Math.floor((now - r.delivered_at) / 86400);
    if (days < UNSEEN_AFTER_DAYS) continue;
    const who = r.name || r.client_slug;
    out.unseen.push(r.client_slug);
    await addInboxItem(env, {
      kind: "readout_unseen",
      title: `${who}: ${monthLabel(r.month_key)} readout released ${days}d ago, no visit recorded`,
      body:
        `No visit to the ${monthLabel(r.month_key)} readout by a ${who} login is recorded since it was released ${days} days ago. ` +
        `This does NOT prove nobody looked: it means page_views holds no visit, and that insert can fail silently. ` +
        `If they have not been told it is ready, tell them, with the link and how to sign in.`,
      action_url: `https://app.neverranked.com/c/${r.client_slug}/readouts/${r.month_key}`,
      target_type: "memo_unseen",
      target_id: r.id,
      target_slug: r.client_slug,
      urgency: "high",
    });
  }
  return out;
}
