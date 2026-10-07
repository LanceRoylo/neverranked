/**
 * Reads the free-check rows the briefing and the admin page count. One D1
 * round trip (a batch of three reads), so the briefing's subrequest budget
 * barely notices it. Counting is in free-check-counts.ts, which is pure.
 */

import type { Env } from "../types";
import type { FcEventRow, FcLeadRow } from "./free-check-counts";

export interface FreeCheckRows {
  events: FcEventRow[];
  leads: FcLeadRow[];
  /** created_at of the first row the check page tagged with a session id. */
  countingFrom: number | null;
}

export async function loadFreeCheckRows(env: Env, sinceSec: number): Promise<FreeCheckRows> {
  const [first, ev, ld] = await env.DB.batch([
    env.DB.prepare(
      "SELECT MIN(created_at) AS t FROM free_check_events WHERE source = 'page' AND session_id IS NOT NULL",
    ),
    env.DB.prepare(
      `SELECT type, source, is_internal, is_bot, session_id, ip_hash, domain, created_at
         FROM free_check_events WHERE created_at >= ? ORDER BY created_at ASC LIMIT 20000`,
    ).bind(sinceSec),
    env.DB.prepare(
      `SELECT id, email, domain, score, grade, source, is_internal, utm_source, utm_medium, utm_campaign,
              utm_content, referrer, consent_version, created_at
         FROM free_check_leads WHERE created_at >= ? ORDER BY created_at DESC LIMIT 2000`,
    ).bind(sinceSec),
  ]);
  const t = (first.results?.[0] as { t: number | null } | undefined)?.t ?? null;
  return {
    events: (ev.results ?? []) as unknown as FcEventRow[],
    leads: (ld.results ?? []) as unknown as FcLeadRow[],
    countingFrom: typeof t === "number" ? t : null,
  };
}
