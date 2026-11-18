/**
 * memo-unsent-watch.ts: last month's memo is finished, but is it sent?
 *
 * Two readouts slipped through in November 2026, and nothing asked about
 * either one:
 *   - One client's October readout went out as a PDF on 11-05, but its
 *     monthly_memos row stayed an undelivered draft. The dashboard showed only
 *     September. The memo writer kept September as its prior memo and copied
 *     a retired line from it, so the 11-15 preview was refused.
 *   - Another client's October readout was written on 11-05, PDF attached,
 *     and then sat unsent in Gmail Drafts for twelve days.
 *
 * Both have the same shape: the month ended and its memo was never marked
 * delivered. Clients who never sign in get a PDF by email, which bypasses the
 * Deliver button. So from day UNSENT_AFTER_DAY of each month (Hawaii time),
 * this raises one item per client whose PREVIOUS month has no delivered memo,
 * and closes it once that memo is marked delivered.
 *
 * WORDING. It never says the client did not get the readout. It says the
 * memo is not MARKED sent, which is all this database can know. A readout
 * emailed as a PDF and never written back looks exactly like one never sent,
 * and the body says how to tell them apart.
 *
 * KEYED PER CLIENT AND MONTH, unlike invoice-watch (per client). A month held
 * back on purpose (one client's 2026-09 memo was held over a like-for-like problem)
 * gets resolved by hand with a note, and must stay resolved. A per-client key
 * would reopen it the next morning.
 */

import type { Env } from "../types";

/** Day of the month, Hawaii time, from which last month's unsent memo is raised.
 *  Full-month drafts land on the 2nd, so this leaves three days to review and send. */
export const UNSENT_AFTER_DAY = 5;
/** Hawaii is UTC-10 all year (no daylight saving). */
const HST_OFFSET_SEC = 10 * 3600;
/** target_id = yyyymm * KEY_SCALE + customers.rowid, unique per client and month. */
const KEY_SCALE = 100_000;

export interface MemoUnsentResult {
  /** Month checked, YYYY-MM, or null before UNSENT_AFTER_DAY. */
  month: string | null;
  checked: number;
  unsent: string[];
  raised: number;
  resolved: number;
}

interface ClientRow { rid: number; client_slug: string; name: string | null; measurement_start: number | null; }

const monthLabel = (monthKey: string): string => {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};

export const memoUnsentKey = (monthKey: string, rid: number): number =>
  Number(monthKey.replace("-", "")) * KEY_SCALE + rid;

const monthOfKey = (targetId: number): string => {
  const yyyymm = Math.floor(targetId / KEY_SCALE);
  return `${Math.floor(yyyymm / 100)}-${String(yyyymm % 100).padStart(2, "0")}`;
};

/**
 * @param nowSec injectable so the behaviour on a given calendar day is testable.
 */
export async function watchMemosUnsent(env: Env, nowSec?: number): Promise<MemoUnsentResult> {
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  const hst = new Date((now - HST_OFFSET_SEC) * 1000);
  const curStartUtc = Math.floor(Date.UTC(hst.getUTCFullYear(), hst.getUTCMonth(), 1) / 1000);
  const prev = new Date(Date.UTC(hst.getUTCFullYear(), hst.getUTCMonth() - 1, 1));
  const prevKey = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
  const out: MemoUnsentResult = { month: null, checked: 0, unsent: [], raised: 0, resolved: 0 };

  const isDelivered = async (slug: string, monthKey: string): Promise<boolean> =>
    !!(await env.DB.prepare(
      "SELECT 1 AS hit FROM monthly_memos WHERE client_slug = ? AND month_key = ? AND delivered_at IS NOT NULL LIMIT 1",
    ).bind(slug, monthKey).first<{ hit: number }>().catch(() => null));

  // Close what is no longer true, for any month, before raising anything new.
  const open = (await env.DB.prepare(
    "SELECT id, target_id, target_slug FROM admin_inbox WHERE status = 'pending' AND target_type = 'memo_unsent'",
  ).all<{ id: number; target_id: number; target_slug: string }>().catch(() => ({ results: [] }))).results;
  for (const item of open) {
    if (await isDelivered(item.target_slug, monthOfKey(item.target_id))) {
      const res = await env.DB.prepare(
        `UPDATE admin_inbox SET status = 'resolved', resolved_at = ?,
                resolution_note = 'auto: the memo is now marked delivered'
          WHERE id = ? AND status = 'pending'`,
      ).bind(now, item.id).run().catch(() => null);
      out.resolved += res?.meta?.changes ?? 0;
    }
  }

  if (hst.getUTCDate() < UNSENT_AFTER_DAY) return out;
  out.month = prevKey;

  // Clients owed a memo for last month: active or pilot, and measuring before
  // this month began. A client whose measurement starts later owes nothing yet.
  const clients = (await env.DB.prepare(
    `SELECT c.rowid AS rid, c.client_slug, c.name, mr.measurement_start
       FROM customers c
       JOIN measurement_registry mr ON mr.client_slug = c.client_slug
      WHERE c.status IN ('active', 'pilot')
        AND mr.measurement_start IS NOT NULL AND mr.measurement_start < ?
      ORDER BY c.client_slug`,
  ).bind(curStartUtc).all<ClientRow>()).results;

  const { addInboxItem } = await import("../admin-inbox");
  const label = monthLabel(prevKey);
  for (const c of clients) {
    out.checked++;
    if (await isDelivered(c.client_slug, prevKey)) continue;
    out.unsent.push(c.client_slug);
    const who = c.name || c.client_slug;
    await addInboxItem(env, {
      kind: "memo_unsent",
      title: `${who}: ${label} memo not marked sent`,
      body:
        `It is day ${hst.getUTCDate()} of the month and ${who}'s ${label} memo is not marked delivered. ` +
        `This does NOT mean they never got it. It means monthly_memos has no delivered row for ${prevKey}, ` +
        `and a readout emailed as a PDF looks exactly like one never sent.\n\n` +
        `Check Sent mail for it, then:\n` +
        `  - Not sent: finish it in /admin/memos and send it. Check Drafts first, because one waited there twelve days.\n` +
        `  - Sent by email: write the exact text you sent into its monthly_memos row and set delivered_at to the ` +
        `send time (the pattern is the *-DELIVERED-apply.sql files in neverranked-docs). Until then the dashboard ` +
        `hides the month, and the next memo is written against an older one.\n` +
        `  - Held back on purpose: resolve this with a note saying why. It will not reopen for ${label}.`,
      action_url: "https://app.neverranked.com/admin/memos",
      target_type: "memo_unsent",
      target_id: memoUnsentKey(prevKey, c.rid),
      target_slug: c.client_slug,
      urgency: "high",
    });
    out.raised++;
  }
  return out;
}
