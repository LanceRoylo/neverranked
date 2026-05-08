/**
 * Citation-gap analyzer.
 *
 * Input: an array of citation_runs records (joined to citation_keywords
 * for client_slug + keyword) with cited_urls already JSON-parsed.
 *
 * Output: a per-source gap report -- which sources AI engines cite
 * for this client's category, how often, whether the client appears
 * via their own URLs, whether the client was named in the response,
 * and a gap signal that drives the brief generator.
 */

import { classifyUrl, isClientOwnedUrl } from "./source-types.mjs";

/**
 * @typedef {object} CitationRun
 * @property {string} client_slug
 * @property {string} keyword
 * @property {string} engine
 * @property {number} client_cited        - 1 if client was named in response_text
 * @property {string[]|string} cited_urls - already parsed array OR JSON string
 * @property {number} run_at              - unix seconds
 */

/**
 * @typedef {object} ClientIdentity
 * @property {string} slug
 * @property {string[]} [domains] - canonical domains (e.g. ["andscenehawaii.com"])
 */

/**
 * Aggregate citation runs into a per-source gap report.
 *
 * Per source (domain), we track:
 *   - total_runs: how many runs cited this source
 *   - total_keywords: distinct keywords this source appears for
 *   - engines: set of engines that cited it
 *   - client_named_runs: how many of those runs ALSO named the client
 *     in response text (regardless of which URL was cited)
 *   - client_owned_url: did the client's OWN domain ever appear here
 *     (only true for source = "self" / brand-owned domain)
 *   - gap_score: 0..1, higher = bigger gap
 *
 * Gap score formula:
 *   - source_type = "other" or unclassified                 -> 0   (skip)
 *   - source is the client's own domain                     -> 0   (already won)
 *   - client_named_runs / total_runs >= 0.8                 -> low (.0..0.2)
 *   - client_named_runs / total_runs in (0.4, 0.8)          -> mid (0.3..0.5)
 *   - client_named_runs / total_runs <= 0.4                 -> high (0.6..1.0)
 *   - + bonus for total_runs >= 3 (signal weight)
 */
export function analyzeCitationGaps(runs, client) {
  if (!Array.isArray(runs)) throw new Error("analyzeCitationGaps: runs must be an array");
  if (!client || !client.slug) throw new Error("analyzeCitationGaps: client.slug is required");

  // Normalize cited_urls field (might be JSON string or array depending on caller)
  const normalized = runs.map((r) => {
    let urls = r.cited_urls;
    if (typeof urls === "string") {
      try { urls = JSON.parse(urls); } catch { urls = []; }
    }
    return { ...r, cited_urls: Array.isArray(urls) ? urls : [] };
  });

  // For each unique URL across all runs, classify the source type.
  // Then aggregate by (domain, source_type).
  const sourceMap = new Map(); // key: domain  ->  aggregate

  const clientDomains = client.domains || [];
  for (const run of normalized) {
    for (const url of run.cited_urls) {
      const cls = classifyUrl(url, clientDomains);
      if (!cls.domain) continue;
      const key = cls.domain;
      let agg = sourceMap.get(key);
      if (!agg) {
        agg = {
          domain: cls.domain,
          source_type: cls.type,
          source_label: cls.label,
          action: cls.action,
          total_runs: 0,
          total_urls: new Set(),
          engines: new Set(),
          keywords: new Set(),
          client_named_runs: 0,
          is_client_owned: isClientOwnedUrl(url, client.domains || []),
          example_urls: [],
        };
        sourceMap.set(key, agg);
      }
      agg.total_runs += 1;
      agg.total_urls.add(url);
      agg.engines.add(run.engine);
      agg.keywords.add(run.keyword);
      if (run.client_cited === 1) agg.client_named_runs += 1;
      if (agg.example_urls.length < 5 && !agg.example_urls.includes(url)) {
        agg.example_urls.push(url);
      }
    }
  }

  // Compute gap score per source. Sets -> arrays for the JSON-friendly output.
  const sources = [];
  for (const agg of sourceMap.values()) {
    const named = agg.client_named_runs;
    const total = agg.total_runs;
    const ratio = total > 0 ? named / total : 0;

    let gap = 0;
    if (agg.source_type === "other") gap = 0;
    else if (agg.is_client_owned) gap = 0;
    else if (ratio >= 0.8) gap = 0.1;
    else if (ratio >= 0.4) gap = 0.4;
    else gap = 0.8;

    // Signal weight: more runs = more confident the gap is real.
    if (total >= 3) gap = Math.min(1, gap + 0.1);
    if (total >= 10) gap = Math.min(1, gap + 0.1);

    sources.push({
      domain: agg.domain,
      source_type: agg.source_type,
      source_label: agg.source_label,
      action: agg.action,
      total_runs: total,
      unique_urls: agg.total_urls.size,
      engines: Array.from(agg.engines).sort(),
      keywords: Array.from(agg.keywords),
      client_named_runs: named,
      client_named_ratio: round(ratio),
      is_client_owned: agg.is_client_owned,
      gap_score: round(gap),
      example_urls: agg.example_urls,
    });
  }

  // Sort: highest gap first, then highest signal (run count) as tiebreaker.
  sources.sort((a, b) => {
    if (b.gap_score !== a.gap_score) return b.gap_score - a.gap_score;
    return b.total_runs - a.total_runs;
  });

  // Top-line summary.
  const totalRuns = normalized.length;
  const totalCitedRuns = normalized.filter((r) => r.client_cited === 1).length;
  const sourcesWithGap = sources.filter((s) => s.gap_score > 0.3 && !s.is_client_owned);

  return {
    client_slug: client.slug,
    summary: {
      total_runs: totalRuns,
      total_runs_naming_client: totalCitedRuns,
      runs_naming_client_ratio: round(totalRuns > 0 ? totalCitedRuns / totalRuns : 0),
      unique_sources: sources.length,
      sources_with_meaningful_gap: sourcesWithGap.length,
      top_keywords: topKeywords(normalized),
    },
    sources,
    sources_with_gap: sourcesWithGap,
  };
}

function topKeywords(runs, limit = 5) {
  const counts = new Map();
  for (const r of runs) counts.set(r.keyword, (counts.get(r.keyword) || 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword, n]) => ({ keyword, runs: n }));
}

function round(n) { return Math.round(n * 1000) / 1000; }
