/**
 * Share-of-voice computation.
 *
 * Distinct from citation_share. citation_share = % of YOUR queries
 * where YOU were cited. Share-of-voice = % of all business mentions in
 * YOUR queries that went to YOU vs competitors.
 *
 * Example: 100 queries -> AI mentions businesses 250 times total ->
 * you're named 30 times -> citation_share = 30%, share-of-voice = 12%.
 *
 * Source data: citation_runs.cited_entities (JSON array of {name, url,
 * context}). The extractor stores entities as bare domain names
 * (no www, lowercased), so matching is straightforward and dedup is
 * already done per citation_run.
 *
 * This module is pure read-side aggregation -- no migration, no ingest
 * change. Safe everywhere it's called.
 */

import type { Env } from "./types";

export interface VoiceShareEntry {
  name: string;          // domain or normalized business name
  mentions: number;      // total mentions across the window
  share: number;         // 0..1 fraction of total mentions
  isClient: boolean;     // true if this row is the client (highlight in UI)
  isCompetitor: boolean; // true if this row matches a tracked competitor domain
}

export interface VoiceShareResult {
  totalMentions: number;     // sum of all entity mentions in the window
  totalRuns: number;         // citation_runs counted
  entries: VoiceShareEntry[]; // ordered by mentions desc
  clientRank: number | null; // 1-indexed; null if client never appeared
}

interface RawEntity { name?: unknown; url?: unknown; context?: unknown }

function normalizeName(raw: string): string {
  return raw.toLowerCase().replace(/^www\./, "").trim();
}

async function loadClientDomains(env: Env, clientSlug: string): Promise<{
  primary: string[];
  competitors: string[];
}> {
  const rows = (await env.DB.prepare(
    `SELECT domain, is_competitor FROM domains WHERE client_slug = ? AND active = 1`,
  ).bind(clientSlug).all<{ domain: string; is_competitor: number }>()).results;
  return {
    primary: rows.filter(r => !r.is_competitor).map(r => normalizeName(r.domain)),
    competitors: rows.filter(r => !!r.is_competitor).map(r => normalizeName(r.domain)),
  };
}

/**
 * Top-line share-of-voice over the last `days` days. Uses cited_entities
 * from every citation_run on the client's tracked keywords, regardless
 * of whether the client was cited in that specific run -- the goal is
 * to see who else AI keeps mentioning in your category.
 */
export async function computeShareOfVoice(
  env: Env,
  clientSlug: string,
  days = 90,
): Promise<VoiceShareResult> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  const runs = (await env.DB.prepare(
    `SELECT cr.cited_entities
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       WHERE ck.client_slug = ? AND cr.run_at >= ?`,
  ).bind(clientSlug, since).all<{ cited_entities: string }>()).results;

  const counts = new Map<string, number>();
  let totalMentions = 0;
  for (const r of runs) {
    let parsed: unknown = [];
    try { parsed = JSON.parse(r.cited_entities || "[]"); } catch { continue; }
    if (!Array.isArray(parsed)) continue;
    // Per-run dedup so a single AI response naming the same domain twice
    // counts as one mention. Mirrors how Profound counts "appearances."
    const seen = new Set<string>();
    for (const e of parsed as RawEntity[]) {
      const n = typeof e.name === "string" ? normalizeName(e.name) : "";
      if (!n || seen.has(n)) continue;
      seen.add(n);
      counts.set(n, (counts.get(n) ?? 0) + 1);
      totalMentions++;
    }
  }

  const { primary, competitors } = await loadClientDomains(env, clientSlug);
  const primarySet = new Set(primary);
  const competitorSet = new Set(competitors);

  const entries: VoiceShareEntry[] = [...counts.entries()]
    .map(([name, mentions]) => ({
      name,
      mentions,
      share: totalMentions > 0 ? mentions / totalMentions : 0,
      isClient: primarySet.has(name),
      isCompetitor: competitorSet.has(name),
    }))
    .sort((a, b) => b.mentions - a.mentions);

  const clientIndex = entries.findIndex(e => e.isClient);
  return {
    totalMentions,
    totalRuns: runs.length,
    entries,
    clientRank: clientIndex >= 0 ? clientIndex + 1 : null,
  };
}

// ---------- Trend computation ----------

export interface VoiceShareTrendBucket {
  weekStart: number;          // unix ts of bucket start (UTC midnight Mon)
  totalMentions: number;
  perEntity: Record<string, number>; // mentions per name in this bucket
}

export interface VoiceShareTrend {
  topNames: string[];         // top 5 names across the full window (for legend)
  buckets: VoiceShareTrendBucket[]; // chronological, oldest first
}

/**
 * Weekly buckets for the trend chart. Returns top-5 entities by total
 * mentions in the window plus the client (always included if cited at
 * all in the window). Bucket boundary = UTC Monday 00:00.
 */
export async function computeShareOfVoiceTrend(
  env: Env,
  clientSlug: string,
  weeks = 12,
): Promise<VoiceShareTrend> {
  const days = weeks * 7;
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  const runs = (await env.DB.prepare(
    `SELECT cr.cited_entities, cr.run_at
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       WHERE ck.client_slug = ? AND cr.run_at >= ?
       ORDER BY cr.run_at ASC`,
  ).bind(clientSlug, since).all<{ cited_entities: string; run_at: number }>()).results;

  // First pass: total mentions per entity to pick top names.
  const totals = new Map<string, number>();
  for (const r of runs) {
    let parsed: unknown = [];
    try { parsed = JSON.parse(r.cited_entities || "[]"); } catch { continue; }
    if (!Array.isArray(parsed)) continue;
    const seen = new Set<string>();
    for (const e of parsed as RawEntity[]) {
      const n = typeof e.name === "string" ? normalizeName(e.name) : "";
      if (!n || seen.has(n)) continue;
      seen.add(n);
      totals.set(n, (totals.get(n) ?? 0) + 1);
    }
  }

  const { primary } = await loadClientDomains(env, clientSlug);
  const clientName = primary[0] ?? null;

  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  let topNames = ranked.slice(0, 5).map(([n]) => n);
  if (clientName && !topNames.includes(clientName) && totals.has(clientName)) {
    topNames.push(clientName);
  }
  topNames = topNames.slice(0, 6);

  // Second pass: bucket by week.
  const weekMs = 7 * 86400 * 1000;
  // Snap "since" forward to the next UTC Monday so buckets line up
  // cleanly. Convenient for chart x-axis labels.
  const sinceDate = new Date(since * 1000);
  sinceDate.setUTCHours(0, 0, 0, 0);
  // Day of week in UTC, with 1 = Monday. Snap forward.
  const dayOffset = (1 - sinceDate.getUTCDay() + 7) % 7;
  sinceDate.setUTCDate(sinceDate.getUTCDate() + dayOffset);
  const firstBucketTs = Math.floor(sinceDate.getTime() / 1000);

  const numBuckets = Math.max(1, weeks);
  const buckets: VoiceShareTrendBucket[] = [];
  for (let i = 0; i < numBuckets; i++) {
    const start = firstBucketTs + i * 7 * 86400;
    buckets.push({ weekStart: start, totalMentions: 0, perEntity: {} });
  }
  const lastBucketEnd = firstBucketTs + numBuckets * 7 * 86400;

  for (const r of runs) {
    if (r.run_at < firstBucketTs || r.run_at >= lastBucketEnd) continue;
    const bucketIdx = Math.floor((r.run_at - firstBucketTs) / (7 * 86400));
    const bucket = buckets[bucketIdx];
    if (!bucket) continue;
    let parsed: unknown = [];
    try { parsed = JSON.parse(r.cited_entities || "[]"); } catch { continue; }
    if (!Array.isArray(parsed)) continue;
    const seen = new Set<string>();
    for (const e of parsed as RawEntity[]) {
      const n = typeof e.name === "string" ? normalizeName(e.name) : "";
      if (!n || seen.has(n)) continue;
      seen.add(n);
      bucket.totalMentions++;
      if (topNames.includes(n)) {
        bucket.perEntity[n] = (bucket.perEntity[n] ?? 0) + 1;
      }
    }
  }

  return { topNames, buckets };
}
