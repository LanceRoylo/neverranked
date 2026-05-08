/**
 * Reddit thread discovery -- orchestrator.
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
 * Detect the surface shape of the query so the variant builder
 * generates appropriately-shaped sub-queries. Three patterns we
 * distinguish:
 *   - "best" pattern: "best X for Y" / "best X" / "top X"
 *   - "question" pattern: "what X should I", "which X is", etc.
 *   - "noun" pattern: bare category like "podcast hosting"
 */
function classifyQueryShape(category) {
  const c = category.trim().toLowerCase();
  if (/^(best|top|favorite)\b/.test(c)) return "best";
  if (/^(what|which|how|where|why|anyone|has\s+anyone)\b/.test(c)) return "question";
  return "noun";
}

/**
 * Strip leading shape words ("best", "what", "anyone tried", etc.)
 * to extract the bare category nouns. Used to build noun-only
 * variants that catch threads phrased differently than the input.
 */
function bareCategory(category) {
  return category
    .trim()
    .replace(/^(best|top|favorite)\s+/i, "")
    .replace(/^(what|which|how)\s+(is|are|should\s+i|do\s+you)?\s*/i, "")
    .replace(/^(anyone|has\s+anyone)\s+(tried|used|recommend|use[ds]?)\s+/i, "")
    .replace(/\s+should\s+i\s+(take|use|try|get|buy|pick|choose)\s*\??$/i, "")
    .replace(/\s+(is\s+best|are\s+best|do\s+you\s+(use|recommend))\s*\??$/i, "")
    .replace(/[?.!]+$/, "")
    .trim();
}

/**
 * Build the variant queries we'll fire for a given category. AI engines
 * surface threads with varied surface forms; we cast a wider net than
 * the raw user query to catch them all.
 *
 * Variant patterns generated depend on the query shape:
 *
 * "best X for Y" / "best X":
 *   - the raw query
 *   - bare nouns (drops "best")
 *   - bare nouns + "recommendations"
 *   - bare nouns + "vs"
 *
 * "what X should I take" / "which X is best":
 *   - the raw query
 *   - bare nouns
 *   - bare nouns + "recommendations"
 *   - "anyone tried" + bare nouns
 *
 * Bare noun phrases like "podcast hosting":
 *   - the raw query
 *   - "best" + nouns
 *   - nouns + "recommendations"
 *   - nouns + "vs"
 */
export function buildQueryVariants(category, region = null) {
  const raw = category.trim();
  const shape = classifyQueryShape(raw);
  const bare = bareCategory(raw);
  const variants = new Set([raw]);

  // The bare-nouns form is useful for every shape -- it strips
  // shape words ("best", "what", "anyone tried") and surfaces
  // threads that title themselves with the nouns directly.
  if (bare && bare.toLowerCase() !== raw.toLowerCase()) variants.add(bare);

  // Universal: nouns + "recommendations" (a common reddit framing)
  if (bare) variants.add(`${bare} recommendations`);

  if (shape === "best") {
    if (bare) variants.add(`${bare} vs`);
  } else if (shape === "question") {
    if (bare) {
      variants.add(`anyone tried ${bare}`);
      variants.add(`best ${bare}`);
    }
  } else {
    // bare-noun shape -> add "best" framing and comparison framing
    variants.add(`best ${bare || raw}`);
    variants.add(`${bare || raw} vs`);
  }

  // Region-scoped variants. Same shape rules but scoped to the region.
  if (region) {
    const r = region.trim();
    variants.add(`${bare || raw} ${r}`);
    variants.add(`${r} ${bare || raw}`);
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
