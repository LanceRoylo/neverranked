/**
 * Reddit citation tracking (Phase 5).
 *
 * Reddit threads are one of the most-cited non-corporate sources in
 * Perplexity / ChatGPT / Gemini responses. This module:
 *
 *   1. Extracts reddit.com thread URLs from citation_runs.cited_urls
 *      and writes a reddit_citations row per (run_id, thread_url).
 *   2. Tags each row with whether the client was ALSO cited in the
 *      same response (client_cited) -- so we can compute "presence
 *      gap" per subreddit.
 *   3. Generates roadmap items for high-signal subreddits where
 *      competitors get cited but the client doesn't.
 *
 * Designed to be called both inline (after each citation_runs insert)
 * AND as a backfill pass over historical runs. Idempotent via the
 * UNIQUE(run_id, thread_url) constraint.
 */

import type { Env } from "./types";

interface ParsedThread {
  subreddit: string;
  thread_url: string;
}

/** Pull reddit thread URLs out of a cited_urls array. We canonicalize
 *  to the bare thread URL (no query, no fragment) so the same thread
 *  cited by different responses dedupes nicely on subreddit-level
 *  rollups. */
export function parseRedditThreads(urls: unknown): ParsedThread[] {
  if (!Array.isArray(urls)) return [];
  const out: ParsedThread[] = [];
  const seen = new Set<string>();
  for (const u of urls) {
    if (typeof u !== "string") continue;
    let parsed: URL;
    try { parsed = new URL(u); } catch { continue; }
    if (!/(?:^|\.)reddit\.com$/i.test(parsed.hostname)) continue;
    // Match /r/<sub>/comments/<id>/... -- the canonical thread form.
    const m = parsed.pathname.match(/^\/r\/([^/]+)\/comments\/([^/]+)/i);
    if (!m) continue;
    const subreddit = m[1].toLowerCase();
    const thread_url = `https://www.reddit.com/r/${subreddit}/comments/${m[2]}/`;
    if (seen.has(thread_url)) continue;
    seen.add(thread_url);
    out.push({ subreddit, thread_url });
  }
  return out;
}

/** Insert reddit_citations rows for one citation_runs row. Safe to
 *  call repeatedly thanks to UNIQUE(run_id, thread_url). */
export async function ingestRedditFromRun(
  env: Env,
  params: {
    runId: number;
    clientSlug: string;
    keywordId: number;
    engine: string;
    runAt: number;
    citedUrls: unknown;
    clientCited: boolean;
  },
): Promise<number> {
  const threads = parseRedditThreads(params.citedUrls);
  if (threads.length === 0) return 0;
  const cited = params.clientCited ? 1 : 0;
  let inserted = 0;
  for (const t of threads) {
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO reddit_citations
         (client_slug, keyword_id, engine, subreddit, thread_url, client_cited, run_id, run_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      params.clientSlug, params.keywordId, params.engine,
      t.subreddit, t.thread_url, cited, params.runId, params.runAt,
    ).run();
    if (result.meta?.changes && result.meta.changes > 0) inserted++;
  }
  return inserted;
}

/** Backfill reddit_citations from the last N days of citation_runs.
 *  Used once on first deploy and then occasionally as a self-heal. */
export async function backfillRedditCitations(
  clientSlug: string,
  windowDays: number,
  env: Env,
): Promise<{ runsProcessed: number; threadsInserted: number }> {
  const since = Math.floor(Date.now() / 1000) - windowDays * 86400;
  const runs = (await env.DB.prepare(
    `SELECT cr.id, cr.keyword_id, cr.engine, cr.run_at, cr.cited_urls, cr.client_cited
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       WHERE ck.client_slug = ? AND cr.run_at >= ?`
  ).bind(clientSlug, since).all<{
    id: number; keyword_id: number; engine: string; run_at: number;
    cited_urls: string; client_cited: number;
  }>()).results;

  let runsProcessed = 0;
  let threadsInserted = 0;
  for (const r of runs) {
    let urls: unknown = [];
    try { urls = JSON.parse(r.cited_urls || "[]"); } catch { /* skip */ }
    const inserted = await ingestRedditFromRun(env, {
      runId: r.id,
      clientSlug,
      keywordId: r.keyword_id,
      engine: r.engine,
      runAt: r.run_at,
      citedUrls: urls,
      clientCited: r.client_cited === 1,
    });
    threadsInserted += inserted;
    runsProcessed++;
  }
  return { runsProcessed, threadsInserted };
}

export interface RedditSubredditStat {
  subreddit: string;
  total_citations: number;
  client_present_count: number;
  threads: { thread_url: string; engine: string; client_cited: number; run_at: number }[];
}

/** Per-subreddit roll-up over the last N days. Sorted by where the
 *  presence gap is widest (lots of citations, low client presence). */
export async function getRedditSummary(
  clientSlug: string,
  windowDays: number,
  env: Env,
): Promise<{
  totalCitations: number;
  clientPresentCount: number;
  subreddits: RedditSubredditStat[];
}> {
  const since = Math.floor(Date.now() / 1000) - windowDays * 86400;
  const rows = (await env.DB.prepare(
    `SELECT subreddit, thread_url, engine, client_cited, run_at
       FROM reddit_citations
       WHERE client_slug = ? AND run_at >= ?
       ORDER BY run_at DESC`
  ).bind(clientSlug, since).all<{
    subreddit: string; thread_url: string; engine: string; client_cited: number; run_at: number;
  }>()).results;

  const map = new Map<string, RedditSubredditStat>();
  let totalCitations = 0;
  let clientPresentCount = 0;
  for (const r of rows) {
    if (!map.has(r.subreddit)) {
      map.set(r.subreddit, { subreddit: r.subreddit, total_citations: 0, client_present_count: 0, threads: [] });
    }
    const s = map.get(r.subreddit)!;
    s.total_citations++;
    if (r.client_cited === 1) s.client_present_count++;
    s.threads.push({ thread_url: r.thread_url, engine: r.engine, client_cited: r.client_cited, run_at: r.run_at });
    totalCitations++;
    if (r.client_cited === 1) clientPresentCount++;
  }

  const subreddits = [...map.values()].sort((a, b) => {
    // Prioritize biggest absence gap: most citations, lowest client presence ratio.
    const gapA = a.total_citations - a.client_present_count;
    const gapB = b.total_citations - b.client_present_count;
    if (gapB !== gapA) return gapB - gapA;
    return b.total_citations - a.total_citations;
  });

  return { totalCitations, clientPresentCount, subreddits };
}

/** Add roadmap items for the top absence-gap subreddits. Gated to
 *  >=10 total reddit citations for the client (signal floor) and to
 *  subreddits with >=3 citations and zero client presence. Cap at
 *  5 new items per call so we don't spam. Idempotent by exact title. */
export async function maybeAddRedditRoadmapItems(
  clientSlug: string,
  env: Env,
): Promise<number> {
  const summary = await getRedditSummary(clientSlug, 90, env);
  if (summary.totalCitations < 10) return 0;

  const candidates = summary.subreddits
    .filter(s => s.total_citations >= 3 && s.client_present_count === 0)
    .slice(0, 5);

  if (candidates.length === 0) return 0;

  const now = Math.floor(Date.now() / 1000);
  let added = 0;
  for (const s of candidates) {
    const title = `Establish presence in r/${s.subreddit}`;
    const existing = await env.DB.prepare(
      "SELECT id FROM roadmap_items WHERE client_slug = ? AND title = ? LIMIT 1"
    ).bind(clientSlug, title).first<{ id: number }>();
    if (existing) continue;

    const desc = `AI engines have cited threads in r/${s.subreddit} ${s.total_citations} time${s.total_citations === 1 ? "" : "s"} in the last 90 days for queries you're tracking, and you weren't named in any of them. Reddit is one of the heaviest non-corporate citation sources for Perplexity / ChatGPT / Gemini. Read the cited threads (linked in /reddit/${clientSlug}), find the ones where a substantive comment from your team would actually help the question-asker, and reply -- not as a marketer, as a practitioner.`;

    await env.DB.prepare(
      `INSERT INTO roadmap_items (
         client_slug, phase_id, title, description, category, status,
         sort_order, refresh_source, stale, created_at, updated_at
       ) VALUES (?, NULL, ?, ?, 'authority', 'pending', 1200, 'reddit', 0, ?, ?)`
    ).bind(clientSlug, title, desc, now, now).run();
    added++;
  }
  return added;
}
