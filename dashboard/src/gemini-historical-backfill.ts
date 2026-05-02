/**
 * Daily-cron driven historical backfill for the Gemini grounding-redirect
 * resolver shipped 2026-05-01.
 *
 * The resolver wired into citations.ts handles every NEW Gemini run
 * automatically. But every existing citation_runs row from before that
 * date still has opaque vertexaisearch.cloud.google.com URLs in
 * cited_urls -- this walks each active client once, resolves them, and
 * re-runs reddit extraction to surface any reddit threads previously
 * hidden behind those tokens.
 *
 * Per-client one-shot: marks an automation_log row with
 * kind='gemini_historical_backfill' once a client is processed, then
 * never touches that client again. Microsecond no-op once every active
 * client is flagged.
 *
 * Bounded to MAX_PER_RUN clients per cron invocation as a defensive
 * cap -- prevents one bad day's run from chewing through every client
 * sequentially. With <= 3 active clients today, everything finishes on
 * the first morning. New clients get processed the next morning after
 * they're added.
 *
 * Manual override: /admin/gemini-resolve/<slug> still works on demand.
 * Delete the relevant automation_log row first if you want to re-fire.
 */

import type { Env } from "./types";
import { resolveGroundingUrls, isGroundingRedirect } from "./gemini-resolver";
import { backfillRedditCitations, maybeAddRedditRoadmapItems } from "./reddit-citations";

const FLAG_KIND = "gemini_historical_backfill";
const MAX_PER_RUN = 3;
const WINDOW_DAYS = 90;

interface PerClientResult {
  runsScanned: number;
  runsUpdated: number;
  urlsResolved: number;
  redditThreadsInserted: number;
  roadmapItemsAdded: number;
}

async function backfillOneClient(env: Env, clientSlug: string): Promise<PerClientResult> {
  const since = Math.floor(Date.now() / 1000) - WINDOW_DAYS * 86400;

  const runs = (await env.DB.prepare(
    `SELECT cr.id, cr.cited_urls
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       WHERE ck.client_slug = ? AND cr.engine = 'gemini' AND cr.run_at >= ?`,
  ).bind(clientSlug, since).all<{ id: number; cited_urls: string }>()).results;

  let runsScanned = 0;
  let runsUpdated = 0;
  let urlsResolved = 0;
  for (const r of runs) {
    runsScanned++;
    let raw: unknown = [];
    try { raw = JSON.parse(r.cited_urls || "[]"); } catch { continue; }
    if (!Array.isArray(raw)) continue;
    const before = (raw as unknown[]).filter((u): u is string => typeof u === "string");
    if (!before.some(isGroundingRedirect)) continue;
    const after = await resolveGroundingUrls(before);
    const changed = after.some((u, i) => u !== before[i]);
    if (!changed) continue;
    urlsResolved += after.filter((u, i) => u !== before[i]).length;
    await env.DB.prepare(
      "UPDATE citation_runs SET cited_urls = ? WHERE id = ?",
    ).bind(JSON.stringify(after), r.id).run();
    runsUpdated++;
  }

  // Re-run reddit extraction so newly-visible reddit URLs land in
  // reddit_citations + roadmap_items. Both are idempotent.
  const reddit = await backfillRedditCitations(clientSlug, WINDOW_DAYS, env);
  const roadmapItemsAdded = await maybeAddRedditRoadmapItems(clientSlug, env);

  return {
    runsScanned,
    runsUpdated,
    urlsResolved,
    redditThreadsInserted: reddit.threadsInserted,
    roadmapItemsAdded,
  };
}

/**
 * Daily-cron entry point. Walks up to MAX_PER_RUN active clients that
 * haven't been backfilled yet, processes them, marks each in
 * automation_log. No-op once every active client is flagged.
 */
export async function maybeBackfillGeminiHistorical(env: Env): Promise<void> {
  // Active clients minus already-flagged. SQLite NOT EXISTS subquery
  // keeps this single-roundtrip and lets the index on
  // automation_log(kind, created_at) do the heavy lifting.
  const candidates = (await env.DB.prepare(
    `SELECT DISTINCT d.client_slug
       FROM domains d
       WHERE d.active = 1
         AND NOT EXISTS (
           SELECT 1 FROM automation_log al
            WHERE al.kind = ? AND al.target_slug = d.client_slug
         )
       ORDER BY d.client_slug
       LIMIT ?`,
  ).bind(FLAG_KIND, MAX_PER_RUN).all<{ client_slug: string }>()).results;

  if (candidates.length === 0) return;

  const now = Math.floor(Date.now() / 1000);
  for (const c of candidates) {
    try {
      const result = await backfillOneClient(env, c.client_slug);
      await env.DB.prepare(
        `INSERT INTO automation_log (kind, target_type, target_id, target_slug, reason, detail, created_at)
           VALUES (?, 'client', NULL, ?, ?, ?, ?)`,
      ).bind(
        FLAG_KIND,
        c.client_slug,
        `Gemini historical backfill complete for ${c.client_slug}`,
        JSON.stringify(result),
        now,
      ).run();
      console.log(`[gemini-historical-backfill] ${c.client_slug}: ${JSON.stringify(result)}`);
    } catch (e) {
      // Don't flag on failure -- next cron run will retry. Log so we
      // notice persistent failures.
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`[gemini-historical-backfill] ${c.client_slug} FAILED: ${msg}`);
    }
  }
}
