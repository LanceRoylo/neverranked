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

// Stopwords stripped before computing category tokens. These are
// query-shape words ("best", "for") that match almost any thread on
// reddit and create false positives if used as relevance signals.
const QUERY_STOPWORDS = new Set([
  "a", "an", "and", "any", "anyone", "are", "as", "at", "be", "best",
  "between", "by", "can", "compare", "comparison", "do", "does", "for",
  "from", "good", "great", "has", "have", "in", "is", "it", "of", "on",
  "or", "recommend", "recommendations", "similar", "the", "to", "top",
  "tried", "use", "used", "using", "vs", "versus", "what", "which",
  "with", "your"
]);

/**
 * Extract topical tokens from a category query. Drops stopwords and
 * short noise words. "best CRM for real estate" -> ["crm","real","estate"].
 */
export function categoryTokens(category) {
  return (category || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !QUERY_STOPWORDS.has(w));
}

// Generic type-nouns ("platform", "tools", "software") are the
// kind-of-thing word in a category, not the category-defining word.
// In "best podcast hosting platform" the category is podcast +
// hosting, not platform. Filtering these from anchor candidates
// prevents off-topic threads that mention "platform" / "tools" /
// "software" from passing the relevance gate.
const GENERIC_TYPE_NOUNS = new Set([
  "app", "apps", "platform", "platforms", "software", "tool", "tools",
  "service", "services", "system", "systems", "product", "products",
  "solution", "solutions", "option", "options", "thing", "things",
  "stuff", "kind", "type", "company", "companies", "brand", "brands"
]);

/**
 * Anchor tokens are the most-distinctive nouns in the category --
 * the words that name the THING the thread must be about, not
 * generic qualifiers. Heuristic:
 *   1. Acronyms (3-5 uppercase letters in the ORIGINAL casing) win.
 *      "CRM", "API", "ERP" -- highly specific to a domain. We
 *      require >= 3 chars because 2-letter acronyms ("AI", "OS",
 *      "VR") are too common to anchor reliably and leak off-topic
 *      viral threads.
 *   2. Otherwise, tokens >= 5 chars (the longer category nouns),
 *      with generic type-nouns ("platform", "tools") filtered out.
 *   3. Otherwise, all non-generic tokens.
 *   4. Last resort: all tokens.
 *
 * The relevance gate requires at least one anchor token in the
 * thread title -- which forces topical centrality. A title with
 * "real estate" but no "CRM" doesn't pass for a "best CRM for real
 * estate" query, because the thread isn't about CRMs.
 */
export function anchorTokens(category) {
  if (!category) return [];
  // Acronym detection only kicks in when the surrounding text is
  // mixed-case. If the WHOLE category is uppercase ("BEST CRM TOOL")
  // every word looks like an acronym and we'd anchor on stopwords
  // and generic type-nouns. The lowercase check distinguishes a real
  // acronym ("best CRM tool") from a shouted query.
  const hasLowercaseWord = /[a-z]/.test(category);
  const acronyms = hasLowercaseWord
    ? (category.match(/\b[A-Z]{2,5}\b/g) || [])
        .filter((s) => s.length >= 3)
        .map((s) => s.toLowerCase())
    : [];
  if (acronyms.length) return acronyms;
  const toks = categoryTokens(category);
  const specific = toks.filter((t) => !GENERIC_TYPE_NOUNS.has(t));
  const long = specific.filter((t) => t.length >= 5);
  if (long.length > 0) return long;
  if (specific.length > 0) return specific;
  return toks;
}

/**
 * Topic relevance: blends title-token coverage (weighted 2x) and
 * op_body-token coverage. Returns 0..1.
 *
 * Hard rule: at least one category token must appear in the THREAD
 * TITLE (with word-boundary matching, not substring). A category
 * token buried in op_body of an off-topic thread does not make it
 * on-topic -- titles encode what the thread is ABOUT.
 *
 * Word-boundary matching prevents "real" from matching "really" or
 * "realm" -- a major source of false positives in v1.
 */
/**
 * Stem-aware word-boundary matcher. Matches the token, the token
 * with common suffixes ("hosting" matches "host"), and short common
 * inflections (-s, -ed, -er). Avoids the trap where "host" misses
 * "hosting" due to strict word-boundary matching.
 */
function stemMatcher(tok) {
  const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Allow the base form, plus suffixes commonly attached in headlines.
  // The (?:...)? group keeps the regex anchored at the token start.
  return new RegExp(`\\b${escaped}(?:s|ed|er|ers|ing|ings)?\\b`, "i");
}

/**
 * Anchor satisfaction rule: with one anchor, require it in the
 * title. With two or more, require at least 2 (or all if only 2)
 * to appear in the title. This kills the multi-anchor leak where
 * a thread with one of two specific anchors slipped through (e.g.
 * Spotify-podcast threads passing the "podcast hosting" gate
 * because they had "podcast" but not "hosting").
 */
function anchorTitleHits(anchors, title) {
  let hits = 0;
  for (const a of anchors) {
    if (stemMatcher(a).test(title)) hits++;
  }
  return hits;
}

function requiredAnchorHits(anchorCount) {
  if (anchorCount <= 1) return 1;
  return 2;
}

export function topicRelevance(thread, category) {
  const tokens = categoryTokens(category);
  if (tokens.length === 0) return 1;
  const anchors = anchorTokens(category);
  const title = (thread.title || "").toLowerCase();
  const body = (thread.op_body || "").toLowerCase();
  // Hard gate: enough anchor tokens must appear in the title (with
  // stem matching, so "host" matches "hosting"). Anchors are the
  // category-naming nouns (e.g. "crm", "podcast", "hosting"), not
  // generic qualifiers ("real", "best"). The N-of-M requirement
  // (>= 2 anchors when 2+ exist) prevents tangential threads that
  // mention only one of the category's defining nouns from passing.
  const titleAnchors = anchorTitleHits(anchors, title);
  if (titleAnchors < requiredAnchorHits(anchors.length)) return 0;
  // Soft scoring: blend title and body token coverage. Token-level
  // hits use the same stem-aware matcher as the gate.
  const matchOne = (tok, hay) => stemMatcher(tok).test(hay);
  const titleHits = tokens.filter((t) => matchOne(t, title)).length;
  const bodyHits = tokens.filter((t) => matchOne(t, body)).length;
  const titleFrac = titleHits / tokens.length;
  const bodyFrac = bodyHits / tokens.length;
  return Math.min(1, (2 * titleFrac + bodyFrac) / 3);
}

// Threads scoring below this are off-topic false positives. Hard zero.
// 0.20 because the title-must-have-a-token rule is the primary gate;
// this floor catches edge cases where the title has 1 token of 5+.
const RELEVANCE_FLOOR = 0.20;

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
 *
 * Two changes from the v0 formula:
 *   1. Topic relevance is now a hard gate. Threads with relevance
 *      below RELEVANCE_FLOOR get composite = 0 so off-topic viral
 *      threads can't win on raw upvotes.
 *   2. Topic relevance also enters the composite as a multiplier on
 *      citation_likelihood (which previously ignored topical fit).
 *
 * Composite weights unchanged: 0.25*recency + 0.35*upvote + 0.40*likelihood
 */
export function scoreThread(thread, opts = {}) {
  const recency = recencyScore(thread, opts.nowSec);
  const upvote = upvoteScore(thread);
  const relevance = opts.category ? topicRelevance(thread, opts.category) : 1;
  const likelihoodRaw = citationLikelihood(thread, opts);
  // Likelihood is dampened by relevance: a perfectly-shaped title
  // ("Best X vs Y") on an off-topic thread gets the title-shape
  // bonus reduced to nothing.
  const likelihood = likelihoodRaw * (0.4 + 0.6 * relevance);
  const composite = relevance < RELEVANCE_FLOOR
    ? 0
    : (0.25 * recency + 0.35 * upvote + 0.40 * likelihood);
  return {
    recency_score: round(recency),
    upvote_score: round(upvote),
    topic_relevance: round(relevance),
    citation_likelihood: round(likelihood),
    composite_score: round(composite),
  };
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}
