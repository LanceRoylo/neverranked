/**
 * The ONE loader for free-check rows. The morning briefing, the
 * /admin/free-check page and the cockpit all read through it, so they count
 * from the same rows and cannot disagree. Counting is in free-check-counts.ts,
 * which is pure.
 *
 * Events are bounded by time and read NEWEST first. An earlier version read
 * them oldest first with a row cap, which on a busy week would have dropped
 * exactly the last 24 hours, the window the briefing leads with.
 *
 * One D1 round trip (a batch of three reads).
 */

import type { Env } from "../types";
import type { FcEventRow, FcLeadRow } from "./free-check-counts";

export interface FcLeadDetail extends FcLeadRow {
  internal_reason: string | null;
  followup_ok: number;
  ai_run_id: number | null;
  outreach_prospect_id: number | null;
  followup_hold_reason: string | null;
  unsubscribed_at: number | null;
  report_email_status: string | null;
}

export interface FreeCheckRows {
  events: FcEventRow[];
  leads: FcLeadDetail[];
  /** created_at of the first row the check page tagged with a session id. */
  countingFrom: number | null;
  /** True when the event cap was hit, so the oldest part of the window is
   *  missing. The newest rows are always present. */
  eventsTruncated: boolean;
}

export const EVENT_CAP = 20_000;

export async function loadFreeCheckRows(
  env: Env,
  opts: { sinceSec: number; leadsSinceSec?: number; leadLimit?: number },
): Promise<FreeCheckRows> {
  const leadsSince = opts.leadsSinceSec ?? opts.sinceSec;
  const [first, ev, ld] = await env.DB.batch([
    env.DB.prepare(
      "SELECT MIN(created_at) AS t FROM free_check_events WHERE source = 'page' AND session_id IS NOT NULL",
    ),
    env.DB.prepare(
      `SELECT type, source, is_internal, is_bot, session_id, domain, user_agent, utm_source, utm_campaign, referrer, created_at
         FROM free_check_events WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?`,
    ).bind(opts.sinceSec, EVENT_CAP),
    env.DB.prepare(
      `SELECT id, email, domain, score, grade, source, is_internal, internal_reason, session_id, utm_source, utm_medium,
              utm_campaign, utm_content, referrer, consent_version, followup_ok, ai_run_id, outreach_prospect_id,
              followup_hold_reason, unsubscribed_at, report_email_status, created_at
         FROM free_check_leads WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?`,
    ).bind(leadsSince, opts.leadLimit ?? 2000),
  ]);
  const t = (first.results?.[0] as { t: number | null } | undefined)?.t ?? null;
  const events = (ev.results ?? []) as unknown as FcEventRow[];
  return {
    events,
    leads: (ld.results ?? []) as unknown as FcLeadDetail[],
    countingFrom: typeof t === "number" ? t : null,
    eventsTruncated: events.length >= EVENT_CAP,
  };
}
