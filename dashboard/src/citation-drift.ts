/**
 * Citation drift detection.
 *
 * Compares a client's current citation landscape vs their landscape
 * from N days ago. The CMU GEO research showed AEO strategies need
 * refreshing every 60-90 days as AI models retrain and competitor
 * citation patterns shift. This module surfaces those shifts so the
 * roadmap-refresh engine can act on them.
 *
 * Drift signals computed:
 *   1. NEW COMPETITORS: brands now appearing in citations that
 *      weren't N days ago. Each one is a potential roadmap item:
 *      "Compete with X on the queries they're winning."
 *   2. LOST CITATIONS: queries the client used to be cited for but
 *      no longer is. Each one is a high-priority roadmap item to
 *      regain ground.
 *   3. EMERGING KEYWORDS: queries where competitors now have
 *      citation share but the client doesn't. Surfaces content gaps
 *      that emerged inside the window.
 *
 * Scope: works at the citation_runs level, aggregating across all
 * engines + keywords for the client's slug. Returns null when there's
 * not enough data on either side of the window (need >=20 runs each).
 */

import type { Env } from "./types";

export interface DriftCompetitor {
  name: string;
  citationsNow: number;
  citationsBefore: number;
  /** Positive = competitor gained ground vs window start. */
  delta: number;
}

export interface DriftKeyword {
  keyword: string;
  keywordId: number;
  /** True if client was cited in 'before' window for this keyword. */
  citedBefore: boolean;
  /** True if client is cited in 'after' window for this keyword. */
  citedNow: boolean;
}

export interface CitationDrift {
  hasEnoughData: boolean;
  windowDays: number;
  beforeRuns: number;
  afterRuns: number;
  /** Competitors with the largest citation gain vs N days ago. */
  newCompetitors: DriftCompetitor[];
  /** Keywords where the client lost their citation. */
  lostKeywords: DriftKeyword[];
  /** Keywords where the client never had a citation but a
   *  competitor's emerged. */
  emergingGaps: DriftKeyword[];
  /** Anything to act on at all. */
  driftDetected: boolean;
}

/** Look back N days and compute drift signals. */
export async function detectCitationDrift(
  clientSlug: string,
  windowDays: number,
  env: Env,
): Promise<CitationDrift> {
  const now = Math.floor(Date.now() / 1000);
  const windowSec = windowDays * 86400;
  const beforeStart = now - 2 * windowSec;
  const beforeEnd = now - windowSec;
  const afterStart = now - windowSec;

  // Run-count gate. With <20 runs per side the signal is too noisy
  // to drive new roadmap items. Better to wait for more data than
  // generate items based on randomness.
  const counts = await env.DB.prepare(
    `SELECT
        SUM(CASE WHEN cr.run_at BETWEEN ? AND ? THEN 1 ELSE 0 END) AS before_n,
        SUM(CASE WHEN cr.run_at >= ? THEN 1 ELSE 0 END) AS after_n
      FROM citation_runs cr
      JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ?`
  ).bind(beforeStart, beforeEnd, afterStart, clientSlug).first<{
    before_n: number; after_n: number;
  }>();

  const beforeRuns = counts?.before_n ?? 0;
  const afterRuns = counts?.after_n ?? 0;

  if (beforeRuns < 20 || afterRuns < 20) {
    return {
      hasEnoughData: false,
      windowDays, beforeRuns, afterRuns,
      newCompetitors: [], lostKeywords: [], emergingGaps: [],
      driftDetected: false,
    };
  }

  // 1. Competitor citations: parse cited_entities JSON to count
  //    competitor mentions in each window. The cited_entities column
  //    holds an array of { name, url, context } per run. We aggregate
  //    by name (lowercased).
  const beforeRows = (await env.DB.prepare(
    `SELECT cr.cited_entities FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       WHERE ck.client_slug = ?
         AND cr.run_at BETWEEN ? AND ?`
  ).bind(clientSlug, beforeStart, beforeEnd).all<{ cited_entities: string }>()).results;

  const afterRows = (await env.DB.prepare(
    `SELECT cr.cited_entities FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       WHERE ck.client_slug = ?
         AND cr.run_at >= ?`
  ).bind(clientSlug, afterStart).all<{ cited_entities: string }>()).results;

  const countNames = (rows: { cited_entities: string }[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const r of rows) {
      try {
        const arr = JSON.parse(r.cited_entities || "[]") as { name: string }[];
        for (const e of arr) {
          if (!e.name) continue;
          const k = e.name.toLowerCase().trim();
          if (k.length < 2) continue;
          m.set(k, (m.get(k) || 0) + 1);
        }
      } catch { /* skip malformed rows */ }
    }
    return m;
  };

  const beforeCounts = countNames(beforeRows);
  const afterCounts = countNames(afterRows);

  // Competitor gainers: name in afterCounts, with delta >= 2 or
  // delta >= 50% relative to before. Keeps the noise floor sensible.
  const newCompetitors: DriftCompetitor[] = [];
  for (const [name, after] of afterCounts) {
    const before = beforeCounts.get(name) || 0;
    const delta = after - before;
    const relative = before > 0 ? after / before : Infinity;
    if (delta >= 2 || relative >= 1.5) {
      newCompetitors.push({ name, citationsNow: after, citationsBefore: before, delta });
    }
  }
  newCompetitors.sort((a, b) => b.delta - a.delta);

  // 2. Per-keyword "client was cited then but not now" detection.
  //    For each keyword id, look at any cr.client_cited=1 in before
  //    and any in after. Lost = before yes, after no.
  const beforeCited = new Set<number>(
    ((await env.DB.prepare(
      `SELECT DISTINCT cr.keyword_id FROM citation_runs cr
         JOIN citation_keywords ck ON ck.id = cr.keyword_id
         WHERE ck.client_slug = ? AND cr.client_cited = 1
           AND cr.run_at BETWEEN ? AND ?`
    ).bind(clientSlug, beforeStart, beforeEnd).all<{ keyword_id: number }>()).results)
      .map(r => r.keyword_id)
  );
  const afterCitedRows = ((await env.DB.prepare(
    `SELECT DISTINCT cr.keyword_id FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       WHERE ck.client_slug = ? AND cr.client_cited = 1
         AND cr.run_at >= ?`
  ).bind(clientSlug, afterStart).all<{ keyword_id: number }>()).results);
  const afterCited = new Set<number>(afterCitedRows.map(r => r.keyword_id));

  const lostIds = [...beforeCited].filter(id => !afterCited.has(id));
  const emergingIds = [...afterCitedRows].filter(r => !beforeCited.has(r.keyword_id)).map(r => r.keyword_id);

  // Resolve keyword text for the IDs we surface.
  const allIds = [...new Set([...lostIds, ...emergingIds])];
  let keywordMap = new Map<number, string>();
  if (allIds.length > 0) {
    const placeholders = allIds.map(() => "?").join(",");
    const kws = ((await env.DB.prepare(
      `SELECT id, keyword FROM citation_keywords WHERE id IN (${placeholders})`
    ).bind(...allIds).all<{ id: number; keyword: string }>()).results);
    keywordMap = new Map(kws.map(k => [k.id, k.keyword]));
  }

  const lostKeywords: DriftKeyword[] = lostIds.map(id => ({
    keyword: keywordMap.get(id) || "unknown",
    keywordId: id,
    citedBefore: true,
    citedNow: false,
  }));

  // Emerging gaps surface keywords where SOMEONE got cited in the
  // after window but the client did not. We re-use the per-keyword
  // run data: pick keywords where there's been at least one run in
  // the after window but the client wasn't in any of them.
  const allAfterKeywords = ((await env.DB.prepare(
    `SELECT DISTINCT cr.keyword_id, ck.keyword FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       WHERE ck.client_slug = ? AND cr.run_at >= ?`
  ).bind(clientSlug, afterStart).all<{ keyword_id: number; keyword: string }>()).results);
  const emergingGaps: DriftKeyword[] = allAfterKeywords
    .filter(k => !afterCited.has(k.keyword_id) && !beforeCited.has(k.keyword_id))
    .slice(0, 20)
    .map(k => ({
      keyword: k.keyword,
      keywordId: k.keyword_id,
      citedBefore: false,
      citedNow: false,
    }));

  return {
    hasEnoughData: true,
    windowDays, beforeRuns, afterRuns,
    newCompetitors: newCompetitors.slice(0, 10),
    lostKeywords,
    emergingGaps,
    driftDetected: newCompetitors.length > 0 || lostKeywords.length > 0 || emergingGaps.length > 0,
  };
}
