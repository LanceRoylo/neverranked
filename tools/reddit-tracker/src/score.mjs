/**
 * Composite scoring for discovered reddit threads.
 *
 * Goal: predict which threads AI engines (Perplexity, ChatGPT,
 * Gemini) are likely to cite when answering "best X for Y" queries,
 * before they show up in our reddit_citations ground-truth table.
 *
 * Composite:
 *   composite = 0.25 * recency + 0.35 * upvote + 0.40 * citation_likelihood
 *
 * Each component returns 0..1. Weights chosen heuristically; once we
 * have ~500 observed citations to backtest against, the weights
 * become a fitted regression. Phase 1 keeps them transparent and
 * adjustable.
 */

// "Sweet spot" age band for AI training corpora. Threads younger than
// 6 months are unlikely to be in current training data; threads older
// than 3 years tend to surface less in retrieval-augmented answers.
const SWEET_SPOT_MIN_DAYS = 180;
const SWEET_SPOT_MAX_DAYS = 1095;

/**
 * Recency score. Peaks inside the sweet-spot age band, falls off
 * outside. Returns 0..1.
 */
export function recencyScore(thread, nowSec = Math.floor(Date.now() / 1000)) {
  const ageDays = Math.max(0, (nowSec - (thread.posted_at || 0)) / 86400);
  if (ageDays < 30) return 0.2; // too fresh to have been crawled
  if (ageDays >= SWEET_SPOT_MIN_DAYS && ageDays <= SWEET_SPOT_MAX_DAYS) return 1.0;
  if (ageDays < SWEET_SPOT_MIN_DAYS) {
    // ramp 0.2 -> 1.0 across (30, SWEET_SPOT_MIN_DAYS)
    return 0.2 + 0.8 * ((ageDays - 30) / (SWEET_SPOT_MIN_DAYS - 30));
  }
  // ramp 1.0 -> 0.3 across (SWEET_SPOT_MAX_DAYS, SWEET_SPOT_MAX_DAYS + 730)
  const decay = Math.min(1, (ageDays - SWEET_SPOT_MAX_DAYS) / 730);
  return Math.max(0.3, 1.0 - 0.7 * decay);
}

/**
 * Upvote score. Log-scaled so a 10k-upvote thread isn't 100x a 100-upvote
 * thread, but still meaningfully ahead. Returns 0..1, saturating at 5k.
 */
export function upvoteScore(thread) {
  const ups = Math.max(0, thread.op_score || 0);
  if (ups <= 0) return 0;
  // log10(5000) ≈ 3.7
  return Math.min(1, Math.log10(ups + 1) / 3.7);
}

/**
 * Citation likelihood. Phase 1 blend of:
 *   - Title shape: matches "best", "vs", "anyone tried", numbered lists
 *   - Comment density: comment_count / op_score ratio (high engagement)
 *   - Self-post bonus: structured selftext is more citeable than link posts
 *   - Subreddit prior: caller can pass a map of historical citation rates
 *
 * Returns 0..1.
 */
export function citationLikelihood(thread, { subredditPrior = {} } = {}) {
  let score = 0;

  // Title shape (max +0.4)
  const t = (thread.title || "").toLowerCase();
  if (/\b(best|top|favorite|recommend|recommendations?)\b/.test(t)) score += 0.18;
  if (/\bvs\.?\b|\bversus\b|\bor\b.*\?$/.test(t)) score += 0.10;
  if (/\banyone\s+(tried|use[ds]?|recommend)\b/.test(t)) score += 0.08;
  if (/\bhonest\b|\bopinions?\b|\breview\b/.test(t)) score += 0.06;

  // Comment density (max +0.20). Comment_count / op_score > 0.5 = lively
  // discussion. Cap at 1.5 to avoid runaway from low-upvote brigaded threads.
  if (thread.op_score > 5) {
    const density = Math.min(1.5, (thread.comment_count || 0) / thread.op_score);
    score += 0.20 * Math.min(1, density / 1.5);
  }

  // Self-post bonus (max +0.10). AI engines preferentially cite threads
  // with structured OP body content over link aggregators.
  if (thread.is_self && (thread.op_body || "").length > 200) score += 0.10;

  // Subreddit prior (max +0.30). Passed in by caller from observed
  // citation rates. Default 0.5 weight when prior is unknown.
  const sub = (thread.subreddit || "").toLowerCase();
  const prior = typeof subredditPrior[sub] === "number" ? subredditPrior[sub] : 0.5;
  score += 0.30 * prior;

  return Math.min(1, score);
}

/**
 * Compute the full composite score and return all components for
 * transparency in CLI output and DB storage.
 */
export function scoreThread(thread, opts = {}) {
  const recency = recencyScore(thread, opts.nowSec);
  const upvote = upvoteScore(thread);
  const likelihood = citationLikelihood(thread, opts);
  const composite = 0.25 * recency + 0.35 * upvote + 0.40 * likelihood;
  return {
    recency_score: round(recency),
    upvote_score: round(upvote),
    citation_likelihood: round(likelihood),
    composite_score: round(composite),
  };
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}
