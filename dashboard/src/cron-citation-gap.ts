/**
 * Cron entry point for the citation-gap roadmap sync.
 *
 * Iterates active clients, computes the citation-gap report for each
 * (last 90 days), and syncs the result against roadmap_items:
 *
 *   - Inserts a new roadmap item for each gap source not already
 *     represented (refresh_source = 'citation_gap').
 *   - Marks done any open citation-gap roadmap items whose source
 *     domain is no longer in the current gap set
 *     (completed_by = 'citation_gap').
 *
 * Per-client failure is non-fatal -- one client's analyzer crash
 * doesn't stop the sweep. Aggregate counts are returned for the cron
 * caller to log.
 */

import type { Env } from "./types";
import { syncRoadmapItemsFromGaps } from "./citation-gap";

export interface CitationGapSweepResult {
  clients: number;
  inserted: number;
  resolved: number;
  errors: number;
}

export async function runCitationGapRoadmapSync(env: Env): Promise<CitationGapSweepResult> {
  // Pull active client + their canonical domain in one shot. The
  // canonical domain feeds the analyzer's client-owned classifier so
  // self-citing URLs don't get flagged as gaps.
  const rows = (
    await env.DB.prepare(
      `SELECT client_slug, MIN(domain) AS domain
       FROM domains
       WHERE active = 1 AND is_competitor = 0
       GROUP BY client_slug
       ORDER BY client_slug`
    ).all<{ client_slug: string; domain: string }>()
  ).results;

  const result: CitationGapSweepResult = { clients: 0, inserted: 0, resolved: 0, errors: 0 };

  for (const r of rows) {
    try {
      const out = await syncRoadmapItemsFromGaps(
        r.client_slug,
        r.domain ? [r.domain] : [],
        env,
      );
      result.clients += 1;
      result.inserted += out.inserted;
      result.resolved += out.resolved;
    } catch (e) {
      result.errors += 1;
      console.log(
        `[citation-gap-sync] client=${r.client_slug} failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return result;
}
