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
 *
 * Diacritics are folded so users can write categories with native
 * characters and still match titles that use stripped-down spellings:
 *   "café"   -> "cafe"
 *   "Acción" -> "accion"
 *   "naïve"  -> "naive"
 *
 * This implementation is Latin-script only. Non-Latin scripts
 * (Japanese, Korean, Chinese, Russian, Arabic) are not supported --
 * the resulting tokens would be empty. If a customer ever needs
 * non-Latin matching, that's a separate code path.
 *
 * Known limitation: tokens with embedded technical characters --
 * "C++", "node.js", ".NET", "C#" -- are split or stripped here, and
 * the downstream stem matcher uses \b word-boundaries which can't
 * find them in titles anyway. Phase 2 will need a tech-term-aware
 * matching path. See score.mjs::stemMatcher.
 */
// Scandinavian / Germanic / Icelandic letters that are base codepoints
// (NOT precomposed letter+diacritic) and so don't decompose under
// NFKD. Hand-mapped to their conventional Latin transliterations so
// "Helsingør" -> "helsingor", "Bjørn" -> "bjorn", etc.
const NON_DECOMPOSING_LATIN = {
  "ø": "o", "Ø": "O",
  "æ": "ae", "Æ": "AE",
  "œ": "oe", "Œ": "OE",
  "ß": "ss",
  "ð": "d", "Ð": "D",
  "þ": "th", "Þ": "TH",
  "ı": "i", "İ": "I",
  "ł": "l", "Ł": "L",
};
const NON_DECOMPOSING_RE = new RegExp("[" + Object.keys(NON_DECOMPOSING_LATIN).join("") + "]", "g");

export function categoryTokens(category) {
  if (!category) return [];
  // Three-stage normalize:
  //   1. Replace non-decomposing Latin letters (ø, æ, ß, ...) with
  //      their conventional ASCII transliterations.
  //   2. NFKD splits precomposed letter+diacritic ("é" -> "e" + U+0301)
  //      and we strip the combining marks (U+0300..U+036F).
  //   3. Tokenize on a separator class that preserves `+`, `.`, `#`
  //      inside tokens so tech terms ("c++", "node.js", ".net", "c#")
  //      survive. Post-process trims leading non-alphanumeric except
  //      `.` (preserves ".net") and trailing except `+#` (preserves
  //      "c++", "c#"). Tech-term tokens with at least one letter pass
  //      the filter regardless of length; regular tokens still need
  //      length >= 3.
  const transliterated = category.replace(NON_DECOMPOSING_RE, (ch) => NON_DECOMPOSING_LATIN[ch]);
  const folded = transliterated.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return folded
    .toLowerCase()
    .split(/[^a-z0-9.+#]+/)
    .map((w) => w.replace(/^[^a-z0-9.]+/, "").replace(/[^a-z0-9+#]+$/, ""))
    .filter((w) => {
      if (!w) return false;
      if (QUERY_STOPWORDS.has(w)) return false;
      // Tech term: contains a non-alphanumeric char. Anchor regardless
      // of length but require at least one letter (otherwise "+++" or
      // "..." would survive).
      if (/[.+#]/.test(w)) return /[a-z]/.test(w);
      // Regular token: at least 3 alphanumeric chars.
      return w.length >= 3;
    });
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
  const toks = categoryTokens(category);
  // Tech terms (tokens containing `+`, `.`, or `#`) are inherently
  // distinctive and anchor regardless of length. "c++" / "node.js" /
  // ".net" / "c#" don't pass the >= 5 char floor below, but they're
  // exactly the words that name the category.
  const techTerms = toks.filter((t) => /[.+#]/.test(t));
  // The \b[A-Z]{2,5}\b regex picks up the alphanumeric core of a tech
  // term (e.g. "NET" inside ".NET") and would duplicate the anchor.
  // Drop any bare acronym that's already covered by a tech term.
  const techBases = new Set(techTerms.map((t) => t.replace(/[.+#]+/g, "").toLowerCase()));
  const acronymsDeduped = acronyms.filter((a) => !techBases.has(a));
  const primary = [...new Set([...acronymsDeduped, ...techTerms])];
  if (primary.length) return primary;
  const specific = toks.filter((t) => !GENERIC_TYPE_NOUNS.has(t));
  const long = specific.filter((t) => t.length >= 5);
  if (long.length > 0) return long;
  if (specific.length > 0) return specific;
  return toks;
}

/**
 * Stem-aware boundary matcher. For a regular token "host", the
 * regex matches the base form plus suffix variants ("host", "hosts",
 * "hosting", "hosted", "hostings"). One-way only -- "host" does NOT
 * match a title that just says "hosting" because hosting != host +
 * suffix. The reverse direction (anchor truncation) is a documented
 * Phase 2 stem improvement.
 *
 * For tech-term tokens ("c++", "node.js", ".net", "c#"), the matcher
 * uses explicit non-alphanumeric boundaries instead of \b. The \b
 * boundary fails between "++" and surrounding spaces because both
 * sides are non-word chars, and adding "s" / "ed" suffixes to a
 * tech term ("c++s") makes no sense, so suffix variants are
 * disabled for tech terms.
 */
function stemMatcher(tok) {
  const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // For tech terms (containing `.`, `+`, `#`), \b word-boundary fails
  // because both sides of "++" or "#" are non-word chars. Use explicit
  // non-alphanumeric boundaries instead, and skip suffix variants
  // (no "c++s" / "node.jses").
  const isTechTerm = /[.+#]/.test(tok);
  if (isTechTerm) {
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=[^a-z0-9]|$)`, "i");
  }
  // Regular token: \b word-boundary plus optional headline suffixes.
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

/**
 * Topic relevance: anchor-gated soft scoring. Returns 0..1.
 *
 * Hard gate (returns 0 immediately if it fails): the title must
 * contain at least N anchor tokens, where N = min(2, anchor_count).
 * Single-anchor categories ("best CRM") need 1 hit; multi-anchor
 * categories ("best podcast hosting platform") need 2.
 *
 * Anchor selection is delegated to anchorTokens() -- acronyms
 * (>= 3 chars) for mixed-case input, tech terms (containing `+`,
 * `.`, or `#`), longer non-generic tokens otherwise.
 *
 * Soft scoring once the gate passes: blends title-token coverage
 * (weighted 2x) and op_body-token coverage of ALL category tokens
 * (not just anchors). Token matching uses stemMatcher() so "host"
 * in title matches when "hosting" is a token (suffix variants).
 *
 * Why title-only for the gate: a title with "real estate" but no
 * "CRM" doesn't pass for a "best CRM for real estate" query
 * regardless of body content. Titles encode what the thread is
 * ABOUT; bodies often mention category words tangentially.
 */
export function topicRelevance(thread, category) {
  const tokens = categoryTokens(category);
  if (tokens.length === 0) return 1;
  const anchors = anchorTokens(category);
  const title = (thread.title || "").toLowerCase();
  const body = (thread.op_body || "").toLowerCase();
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

// Belt-and-suspenders floor: applied AFTER the anchor gate inside
// topicRelevance returns a non-zero value. Reachable cases are narrow:
// the relevance formula (2*titleFrac + bodyFrac)/3 only drops below
// 0.20 when titleHits = 1 against a category with >= 5 tokens AND the
// body contributes nothing -- e.g. category "best AI listing tools
// for real estate agents" with a title that has only one token hit.
// In practice the anchor gate handles >99% of off-topic exclusions;
// this constant is a safety net, not the primary mechanism.
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
