/**
 * Reddit thread discovery — orchestrator.
 *
 * Given a category query (and optional region), runs reddit search,
 * scores each result, dedupes, and returns the top N ranked threads
 * with full scoring breakdown.
 *
 * Phase 1: read-only. No DB writes. Once scoring is validated against
 * reddit_citations ground truth, Phase 2 wires the writer.
 */

import { searchThreads } from "./reddit-api.mjs";
import { scoreThread } from "./score.mjs";

/**
 * Build the variant queries we'll fire for a given category. AI engines
 * surface threads with varied surface forms; we cast a wider net than
 * the raw user query to catch them all.
 *
 * Example: category "best CRM for real estate" expands to:
 *   - best CRM for real estate
 *   - CRM real estate recommendations
 *   - CRM for realtors
 *   - real estate CRM vs
 */
export function buildQueryVariants(category, region = null) {
  const c = category.trim();
  const variants = new Set([c]);

  // Drop leading "best" qualifier for broader recall
  variants.add(c.replace(/^best\s+/i, "").trim());

  // Add "recommend" / "recommendations" variant
  variants.add(`${c} recommendations`);

  // Add "vs" framing for comparison threads
  variants.add(`${c} vs`);

  // Region-scoped variants
  if (region) {
    variants.add(`${c} ${region}`);
    variants.add(`${region} ${c.replace(/^best\s+/i, "")}`);
  }

  return Array.from(variants).filter(Boolean);
}

/**
 * Run discovery for a category. Returns up to `limit` ranked threads.
 *
 * @param {object} opts
 * @param {string} opts.category - e.g. "best CRM for real estate"
 * @param {string} [opts.region] - e.g. "Hawaii"
 * @param {number} [opts.limit=20] - top-N to return
 * @param {object} [opts.subredditPrior] - { [sub]: 0..1 } historical citation rate
 * @param {function} [opts.onProgress] - (msg) => void for CLI streaming
 */
export async function discoverThreads({
  category,
  region = null,
  limit = 20,
  subredditPrior = {},
  onProgress = () => {},
}) {
  if (!category || typeof category !== "string") {
    throw new Error("discoverThreads: `category` is required");
  }

  const variants = buildQueryVariants(category, region);
  onProgress(`Discovery for "${category}"${region ? ` in ${region}` : ""}: ${variants.length} query variants`);

  // Fetch all variants. Reddit caps unauthed search at 100 results;
  // we ask for 50 per variant and dedupe across them.
  const seen = new Map(); // url -> thread
  for (const q of variants) {
    onProgress(`  → query: ${q}`);
    try {
      const results = await searchThreads({ query: q, limit: 50, sort: "relevance", t: "year" });
      for (const t of results) {
        if (!t.url || t.over_18) continue;
        if (!seen.has(t.url)) seen.set(t.url, t);
      }
    } catch (err) {
      onProgress(`    ! search failed: ${err.message}`);
    }
  }

  onProgress(`Collected ${seen.size} unique threads. Scoring...`);

  // Score everything, then drop relevance-floor zeros and sort by
  // composite descending. Passing `category` into scoreThread enables
  // the topic-relevance gate -- threads whose title+body don't match
  // the category get composite = 0 and never surface.
  const scored = [];
  const nowSec = Math.floor(Date.now() / 1000);
  for (const t of seen.values()) {
    const scores = scoreThread(t, { subredditPrior, nowSec, category });
    if (scores.composite_score === 0) continue;
    scored.push({ ...t, ...scores });
  }
  scored.sort((a, b) => b.composite_score - a.composite_score);

  onProgress(`Kept ${scored.length} on-topic threads after relevance gate`);

  return scored.slice(0, limit);
}
