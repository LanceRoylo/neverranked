/**
 * compare-loader.ts — the database half of compare-periods.ts.
 *
 * compare-periods is pure on purpose: every case it must get right is a set of
 * counts whose answer is known by hand. This file is the part that talks to D1
 * and builds those counts, so that wiring a comparison into a deliverable is a
 * call, not a query someone writes from scratch under a deadline.
 *
 * Built 2026-10-01 for the first paid month-over-month comparison, generating
 * 2026-10-24, whose basis was decided that day: the stable core. Nothing here
 * decides a basis. The caller picks one and this file builds counts that
 * honour it.
 */

import type { Env } from "../types";
import { stableCore, type InstrumentEvent, type SurfaceCounts } from "./compare-periods";

export interface Window {
  start: number;
  end: number;
}

export interface StableCoreCounts {
  /** The questions in the core. Their count is ComparisonInput.sharedKeywords. */
  keywordIds: number[];
  /** Questions the client had runs for in either window but that fell outside the core. */
  excludedKeywordIds: number[];
  /** Days, across both windows, on which anything at all was measured for this client. */
  measuredDays: number;
  perSurface: SurfaceCounts[];
}

/**
 * Counts for one client over its stable core: the questions measured on every
 * day that anything was measured, across both windows.
 *
 * Assumes prev.end <= cur.start. Pass the result to computeComparison() with
 * basis: "stable_core" and sharedKeywords: keywordIds.length. Declaring that
 * basis over counts built any other way would be a false statement the pure
 * module cannot detect, which is why the selection and the counting live in
 * one function here rather than in the caller.
 */
export async function loadStableCoreCounts(
  env: Env,
  clientSlug: string,
  prev: Window,
  cur: Window,
): Promise<StableCoreCounts> {
  const dayRows = (await env.DB.prepare(
    `SELECT cr.keyword_id AS keyword_id, date(cr.run_at, 'unixepoch') AS day
       FROM citation_runs cr
       JOIN citation_keywords k ON k.id = cr.keyword_id
      WHERE k.client_slug = ?1
        AND ((cr.run_at >= ?2 AND cr.run_at < ?3) OR (cr.run_at >= ?4 AND cr.run_at < ?5))
      GROUP BY cr.keyword_id, day`,
  ).bind(clientSlug, prev.start, prev.end, cur.start, cur.end)
   .all<{ keyword_id: number; day: string }>()).results;

  const daysByKeyword = new Map<number, Set<string>>();
  const allDays = new Set<string>();
  for (const r of dayRows) {
    let s = daysByKeyword.get(r.keyword_id);
    if (!s) daysByKeyword.set(r.keyword_id, (s = new Set()));
    s.add(r.day);
    allDays.add(r.day);
  }

  // A question measured in only ONE window would pass stableCore() if the
  // other window measured nothing at all, which is not a comparison. Require
  // both windows to have measured something before any core exists.
  const prevDay = (d: string) => Date.parse(`${d}T00:00:00Z`) / 1000 < prev.end;
  const bothWindows = [...allDays].some(prevDay) && [...allDays].some((d) => !prevDay(d));

  const keywordIds = bothWindows ? stableCore(daysByKeyword).sort((a, b) => a - b) : [];
  const inCore = new Set(keywordIds);
  const excludedKeywordIds = [...daysByKeyword.keys()].filter((k) => !inCore.has(k)).sort((a, b) => a - b);

  if (keywordIds.length === 0) {
    return { keywordIds, excludedKeywordIds, measuredDays: allDays.size, perSurface: [] };
  }

  const perSurface = (await env.DB.prepare(
    `SELECT engine,
            SUM(CASE WHEN run_at <  ?3 THEN 1 ELSE 0 END) AS prev_runs,
            SUM(CASE WHEN run_at <  ?3 AND client_cited = 1 THEN 1 ELSE 0 END) AS prev_hits,
            SUM(CASE WHEN run_at >= ?4 THEN 1 ELSE 0 END) AS cur_runs,
            SUM(CASE WHEN run_at >= ?4 AND client_cited = 1 THEN 1 ELSE 0 END) AS cur_hits
       FROM citation_runs
      WHERE keyword_id IN (SELECT value FROM json_each(?1))
        AND ((run_at >= ?2 AND run_at < ?3) OR (run_at >= ?4 AND run_at < ?5))
      GROUP BY engine
      ORDER BY engine`,
  ).bind(JSON.stringify(keywordIds), prev.start, prev.end, cur.start, cur.end)
   .all<{ engine: string; prev_runs: number; prev_hits: number; cur_runs: number; cur_hits: number }>()).results
   .map((r) => ({
     engine: r.engine,
     prevRuns: r.prev_runs,
     prevHits: r.prev_hits,
     curRuns: r.cur_runs,
     curHits: r.cur_hits,
   }));

  return { keywordIds, excludedKeywordIds, measuredDays: allDays.size, perSurface };
}

/**
 * Instrument events that overlap the span from prev.start to cur.end.
 *
 * With a clientSlug: global events, engine events that are not tied to some
 * OTHER client (the step detector writes engine events per client), and this
 * client's own events. Without one, for a fleet-wide comparison such as the
 * weekly brief: everything, because a step in any client's numbers is inside
 * a fleet figure.
 *
 * Returns every overlapping event. Deciding which ones bear on the comparison
 * is compare-periods' job, and it reports the rest in setAside rather than
 * dropping them, so this deliberately does not pre-filter by kind.
 */
export async function loadInstrumentEvents(
  env: Env,
  prev: Window,
  cur: Window,
  clientSlug?: string | null,
): Promise<InstrumentEvent[]> {
  const rows = (await env.DB.prepare(
    `SELECT occurred_at, kind, scope, engine, client_slug, detail
       FROM instrument_events
      WHERE occurred_at >= ?1 AND occurred_at < ?2
        AND (?3 IS NULL OR client_slug IS NULL OR client_slug = ?3)
      ORDER BY occurred_at, id`,
  ).bind(prev.start, cur.end, clientSlug ?? null)
   .all<{ occurred_at: number; kind: string; scope: string; engine: string | null; client_slug: string | null; detail: string }>()).results;

  return rows.map((r) => ({
    occurred_at: r.occurred_at,
    kind: r.kind,
    // An unrecognised scope is treated as global: the widest reading, so an
    // event nobody classified can only make a comparison more cautious.
    scope: r.scope === "engine" || r.scope === "client" ? r.scope : "global",
    engine: r.engine,
    client_slug: r.client_slug,
    detail: r.detail,
  }));
}
