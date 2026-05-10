/**
 * Tests for tools/reddit-tracker/src/score.mjs
 *
 * Coverage:
 *   - categoryTokens: unicode folding, Latin diacritic + Scandinavian
 *     handling, ASCII baseline, edge cases, documented limitations
 *   - anchorTokens: acronym rules (>=3 char, mixed-case requirement),
 *     generic-noun filter, all-caps query fix
 *   - topicRelevance: anchor gate (single + multi), stem matching,
 *     soft scoring blend
 *   - recencyScore / upvoteScore / citationLikelihood: shape checks
 *   - scoreThread: integration of components, relevance floor
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  categoryTokens,
  anchorTokens,
  topicRelevance,
  recencyScore,
  upvoteScore,
  citationLikelihood,
  scoreThread,
  autoRequiredTokens,
} from "../src/score.mjs";

// ---------------------------------------------------------------------
// categoryTokens -- tokenization with unicode folding
// ---------------------------------------------------------------------

test("categoryTokens returns empty for null / empty / whitespace", () => {
  assert.deepEqual(categoryTokens(null), []);
  assert.deepEqual(categoryTokens(""), []);
  assert.deepEqual(categoryTokens("   "), []);
});

test("categoryTokens drops stopwords and short noise", () => {
  // "best", "for" are stopwords; "to" is too short anyway
  assert.deepEqual(categoryTokens("best CRM for real estate"), ["crm", "real", "estate"]);
});

test("categoryTokens folds Latin diacritics via NFKD", () => {
  assert.deepEqual(categoryTokens("best café for éspresso"), ["cafe", "espresso"]);
  assert.deepEqual(categoryTokens("naïve approach to seo"), ["naive", "approach", "seo"]);
  assert.deepEqual(categoryTokens("Raúl property management"), ["raul", "property", "management"]);
  // Note: "tool" is a generic type-noun but only anchorTokens filters
  // those; categoryTokens keeps everything that survives the stopword
  // + length filter.
  assert.deepEqual(categoryTokens("Acción Marketing tool"), ["accion", "marketing", "tool"]);
});

test("categoryTokens maps non-decomposing Latin letters", () => {
  // ø, æ, ß, ð, þ, œ, ı, ł aren't decomposed by NFKD; the explicit
  // map handles them.
  assert.deepEqual(categoryTokens("best brewery in Helsingør"), ["brewery", "helsingor"]);
  assert.deepEqual(categoryTokens("Bjørn Æsir Erlendsson naïveté"), ["bjorn", "aesir", "erlendsson", "naivete"]);
  assert.deepEqual(categoryTokens("beste Straße Schloß"), ["beste", "strasse", "schloss"]);
});

test("categoryTokens drops non-Latin scripts (documented limitation)", () => {
  // CJK / Cyrillic / Arabic don't survive NFKD + Latin map.
  assert.deepEqual(categoryTokens("東京 best app"), ["app"]);
});

test("categoryTokens preserves tech terms with embedded special chars (audit H3 fix)", () => {
  // Tech terms (containing `+`, `.`, `#`) are preserved in tokens
  // and anchor regardless of length. The tokenizer trims leading
  // non-`.` and trailing non-`+#` chars so end-of-sentence periods
  // don't pollute the token.
  assert.deepEqual(categoryTokens("best C++ framework"), ["c++", "framework"]);
  assert.deepEqual(categoryTokens("best node.js library"), ["node.js", "library"]);
  assert.deepEqual(categoryTokens("C# vs Java performance"), ["c#", "java", "performance"]);
  assert.deepEqual(categoryTokens(".NET migration tips"), [".net", "migration", "tips"]);
  assert.deepEqual(categoryTokens("Use C++. End of sentence."), ["c++", "end", "sentence"]);
});

test("categoryTokens drops degenerate punctuation-only tokens", () => {
  // "+++" or "..." with no letters should not survive.
  assert.deepEqual(categoryTokens("+++ best ..."), []);
});

test("anchorTokens picks tech terms as primary anchors", () => {
  assert.deepEqual(anchorTokens("best C++ framework"), ["c++"]);
  assert.deepEqual(anchorTokens("learn node.js for free"), ["node.js"]);
  assert.deepEqual(anchorTokens(".NET migration tips"), [".net"]);
  assert.deepEqual(anchorTokens("C# tutorials"), ["c#"]);
});

test("anchorTokens dedupes tech terms vs their bare-acronym form", () => {
  // \b[A-Z]{2,5}\b matches "NET" inside ".NET". Without dedup, the
  // anchor list would contain both "net" and ".net". Lock in dedup.
  assert.deepEqual(anchorTokens(".NET migration tips"), [".net"]);
});

test("anchorTokens combines tech-term + acronym when both distinct", () => {
  // CRM anchor and node.js anchor are independent; both should appear.
  const a = anchorTokens("best CRM and node.js for startups");
  assert.ok(a.includes("crm"));
  assert.ok(a.includes("node.js"));
});

test("topicRelevance with tech-term anchors uses non-word boundaries", () => {
  // "C++" in title with surrounding non-word chars matches.
  const t1 = mkThread({ title: "Best C++ framework for embedded systems" });
  assert.ok(topicRelevance(t1, "best C++ framework") > 0);

  // "C++Builder" is a different identifier; trailing alphanumeric
  // means anchor "c++" should NOT match.
  const t2 = mkThread({ title: "C++Builder is great for legacy code" });
  assert.equal(topicRelevance(t2, "best C++ framework"), 0);

  // node.js anchor matches "Node.js" in title (case insensitive).
  const t3 = mkThread({ title: "Best Node.js library for SSR" });
  assert.ok(topicRelevance(t3, "best node.js library") > 0);

  // Strict matching: "asp.net" does NOT match anchor ".net" because
  // "p" precedes the dot. Documented strictness, not a bug.
  const t4 = mkThread({ title: "asp.net core tutorial" });
  assert.equal(topicRelevance(t4, "best .NET framework"), 0);
});

// ---------------------------------------------------------------------
// anchorTokens -- acronyms, generics, all-caps fix
// ---------------------------------------------------------------------

test("anchorTokens prefers acronyms when context is mixed-case", () => {
  assert.deepEqual(anchorTokens("best CRM for real estate"), ["crm"]);
  assert.deepEqual(anchorTokens("best CRM software"), ["crm"]);
  assert.deepEqual(anchorTokens("best local SEO software"), ["seo"]);
});

test("anchorTokens requires acronyms >= 3 chars (drops AI / OS / VR)", () => {
  // 2-letter acronyms are too common to anchor reliably.
  assert.deepEqual(anchorTokens("best AI listing tools for realtors"), ["listing", "realtors"]);
});

test("anchorTokens does NOT treat all-caps queries as acronym sets", () => {
  // The fix for audit H1: "BEST CRM TOOL" used to return all words;
  // now falls through to the lowercase pipeline where stopwords
  // and generic type-nouns get filtered.
  assert.deepEqual(anchorTokens("BEST CRM TOOL"), ["crm"]);
  assert.deepEqual(anchorTokens("best CRM tool"), ["crm"]);
});

test("anchorTokens filters generic type-nouns from candidates", () => {
  // "platform" / "tool" / "software" etc. are kind-of-thing words,
  // not category-defining nouns.
  assert.deepEqual(anchorTokens("best podcast hosting platform"), ["podcast", "hosting"]);
  assert.deepEqual(anchorTokens("best podcast hosting tool"), ["podcast", "hosting"]);
});

test("anchorTokens falls through to short tokens when no long ones", () => {
  // Single-word category, no acronym, length < 5: return the token.
  assert.deepEqual(anchorTokens("CRM"), ["crm"]);
});

test("anchorTokens returns [] for null / empty", () => {
  assert.deepEqual(anchorTokens(null), []);
  assert.deepEqual(anchorTokens(""), []);
});

// ---------------------------------------------------------------------
// topicRelevance -- anchor gate + soft scoring
// ---------------------------------------------------------------------

const mkThread = (overrides = {}) => ({
  title: "",
  op_body: "",
  op_score: 100,
  comment_count: 50,
  posted_at: Math.floor(Date.now() / 1000) - 86400 * 365,
  is_self: true,
  subreddit: "test",
  ...overrides,
});

test("topicRelevance hard-zeros when no anchor in title", () => {
  // For "best CRM for real estate", anchor is "crm". A title with
  // "real estate" but no "crm" is off-topic.
  const t = mkThread({ title: "Best real estate tips for new agents" });
  assert.equal(topicRelevance(t, "best CRM for real estate"), 0);
});

test("topicRelevance passes when single anchor present in title", () => {
  const t = mkThread({ title: "What CRM are you using these days" });
  const r = topicRelevance(t, "best CRM for real estate");
  assert.ok(r > 0, `relevance should be > 0, got ${r}`);
});

test("topicRelevance applies multi-anchor rule (>= 2 in title)", () => {
  // For "best podcast hosting platform", anchors are ["podcast", "hosting"].
  // A title with only "podcast" should fail (1 of 2 needed = 2).
  const single = mkThread({ title: "Spotify pulls white nationalist podcast" });
  assert.equal(topicRelevance(single, "best podcast hosting platform"), 0);

  // Title with both passes.
  const both = mkThread({ title: "Best podcast hosting platform for new shows" });
  assert.ok(topicRelevance(both, "best podcast hosting platform") > 0);
});

test("topicRelevance stem-matches anchors via suffix variants (hosting -> hostings, podcast -> podcasters)", () => {
  // Stem matcher adds suffixes to the anchor: "podcast" matches
  // "podcasters" in title. Direction is anchor + (s|ed|er|ers|ing|ings),
  // not anchor truncation. So "hosting" anchor matches "hostings" but
  // not "host". Lock in this behavior; the tighter direction (anchor
  // truncation) is a documented Phase 2 stem improvement.
  const stems = mkThread({ title: "Best podcast hosting recommendations" });
  assert.ok(topicRelevance(stems, "best podcast hosting platform") > 0);

  // Anchor stems match suffix variants in the title (selfhosting works
  // because "hosting" is the literal substring after the dash).
  const selfHosting = mkThread({ title: "Why are so few podcasters self-hosting" });
  assert.ok(topicRelevance(selfHosting, "best podcast hosting platform") > 0);

  // Documented limitation: title with bare "host" (truncated form)
  // does NOT match anchor "hosting". Lock in.
  const truncated = mkThread({ title: "Best podcast host for indie shows" });
  assert.equal(topicRelevance(truncated, "best podcast hosting platform"), 0);
});

test("topicRelevance returns 1 when category has no usable tokens", () => {
  const t = mkThread({ title: "anything" });
  assert.equal(topicRelevance(t, ""), 1);
  assert.equal(topicRelevance(t, "   "), 1);
});

// ---------------------------------------------------------------------
// recencyScore -- sweet-spot age band
// ---------------------------------------------------------------------

test("recencyScore peaks in 6mo-3yr window", () => {
  const now = Math.floor(Date.now() / 1000);
  // 1 year old
  const t = { posted_at: now - 86400 * 365 };
  assert.equal(recencyScore(t, now), 1);
});

test("recencyScore is low for very fresh threads (< 30 days)", () => {
  const now = Math.floor(Date.now() / 1000);
  const t = { posted_at: now - 86400 * 10 };
  assert.equal(recencyScore(t, now), 0.2);
});

test("recencyScore decays for very old threads (> 3 years)", () => {
  const now = Math.floor(Date.now() / 1000);
  // 5 years old
  const t = { posted_at: now - 86400 * 365 * 5 };
  const r = recencyScore(t, now);
  assert.ok(r < 1 && r >= 0.3, `expected decay, got ${r}`);
});

// ---------------------------------------------------------------------
// upvoteScore -- log-scaled
// ---------------------------------------------------------------------

test("upvoteScore is 0 for zero or negative upvotes", () => {
  assert.equal(upvoteScore({ op_score: 0 }), 0);
  assert.equal(upvoteScore({ op_score: -5 }), 0);
  assert.equal(upvoteScore({}), 0);
});

test("upvoteScore saturates near 1 for very high upvotes", () => {
  assert.ok(upvoteScore({ op_score: 50000 }) >= 1);
  assert.ok(upvoteScore({ op_score: 5000 }) > 0.9);
});

test("upvoteScore is log-scaled (10x upvotes ≠ 10x score)", () => {
  const a = upvoteScore({ op_score: 100 });
  const b = upvoteScore({ op_score: 1000 });
  // 1000 should be higher than 100 but not 10x
  assert.ok(b > a);
  assert.ok(b < a * 5);
});

// ---------------------------------------------------------------------
// citationLikelihood -- title shape blend
// ---------------------------------------------------------------------

test("citationLikelihood rewards 'best' / 'vs' title shapes", () => {
  const plain = citationLikelihood({ title: "my dog is cute", op_score: 100 });
  const best = citationLikelihood({ title: "best CRM for real estate", op_score: 100 });
  assert.ok(best > plain);
});

test("citationLikelihood uses subredditPrior when provided", () => {
  const noPrior = citationLikelihood({ title: "test", subreddit: "unknown_sub", op_score: 100 });
  const withPrior = citationLikelihood({ title: "test", subreddit: "known_sub", op_score: 100 }, {
    subredditPrior: { known_sub: 1.0 },
  });
  assert.ok(withPrior > noPrior);
});

// ---------------------------------------------------------------------
// scoreThread -- integration
// ---------------------------------------------------------------------

test("scoreThread returns all components", () => {
  const t = mkThread({ title: "Best CRM for real estate? Anyone tried Follow Up Boss" });
  const s = scoreThread(t, { category: "best CRM for real estate" });
  assert.ok("recency_score" in s);
  assert.ok("upvote_score" in s);
  assert.ok("topic_relevance" in s);
  assert.ok("citation_likelihood" in s);
  assert.ok("composite_score" in s);
});

test("scoreThread zeros composite when off-topic", () => {
  const t = mkThread({ title: "AITA for selling my real estate" });
  const s = scoreThread(t, { category: "best CRM for real estate" });
  assert.equal(s.composite_score, 0);
  assert.equal(s.topic_relevance, 0);
});

test("scoreThread produces positive composite for on-topic high-quality thread", () => {
  const t = mkThread({
    title: "Best CRM for real estate? Anyone tried Follow Up Boss vs LionDesk",
    op_body: "a".repeat(500),
    op_score: 850,
    comment_count: 320,
  });
  const s = scoreThread(t, { category: "best CRM for real estate" });
  assert.ok(s.composite_score > 0.5, `expected high composite, got ${s.composite_score}`);
  // topic_relevance = (2 * titleFrac + bodyFrac) / 3. With all 3
  // tokens in title and 0 in body: (2*1 + 0)/3 = 0.667. Lock in.
  assert.ok(s.topic_relevance >= 0.6, `expected high relevance, got ${s.topic_relevance}`);
});

// ---------------------------------------------------------------------
// autoRequiredTokens + region-token enforcement
// ---------------------------------------------------------------------
//
// Real audit case: 2026-05-09 ASB Reddit probe. The query
// "best small business bank Hawaii" let through r/montreal, r/ottawa,
// and r/pittsburgh threads about small business owners that did not
// mention Hawaii or banks. Cause: anchor gate matched on
// "small" + "business" without requiring the discriminating region
// token. Fix: any token that is a known region/locale must appear in
// the title, in addition to whatever the anchor gate requires.

test("autoRequiredTokens picks up Hawaii from the category", () => {
  assert.deepEqual(autoRequiredTokens("best small business bank Hawaii"), ["hawaii"]);
  assert.deepEqual(autoRequiredTokens("best bank in Honolulu"), ["honolulu"]);
  assert.deepEqual(autoRequiredTokens("dentists in Kailua, Oahu"), ["kailua", "oahu"]);
});

test("autoRequiredTokens returns empty for non-regional categories", () => {
  assert.deepEqual(autoRequiredTokens("best CRM for real estate"), []);
  assert.deepEqual(autoRequiredTokens("how to get cited by ChatGPT"), []);
});

test("topicRelevance kills the Montreal-noise case from the ASB audit", () => {
  // The actual title r/montreal returned for "best small business bank Hawaii"
  const t = mkThread({
    title: "I'm a small business owner in Montreal I'm scared",
    op_body: "no Hawaii or banking content",
  });
  assert.equal(topicRelevance(t, "best small business bank Hawaii"), 0);
  // Same enforcement via scoreThread integration:
  assert.equal(scoreThread(t, { category: "best small business bank Hawaii" }).composite_score, 0);
});

test("topicRelevance still passes legitimate Hawaii-titled threads", () => {
  // The actual high-priority finding from the ASB audit
  const t = mkThread({
    title: "First Hawaiian Bank continues to shock me",
    op_body: "long body about banking experience",
  });
  // "First Hawaiian Bank" contains both "Hawaii" (via Hawaiian stem) and "Bank"
  assert.ok(topicRelevance(t, "best community bank in Hawaii") > 0);
});

test("topicRelevance enforces caller-supplied requiredTokens", () => {
  const t = mkThread({ title: "best CRM for small businesses" });
  // No region in category, but caller demands a specific token
  assert.equal(topicRelevance(t, "best CRM", { requiredTokens: ["enterprise"] }), 0);
  assert.ok(topicRelevance(t, "best CRM", { requiredTokens: ["small"] }) > 0);
});

test("scoreThread threads requiredTokens through opts", () => {
  const t = mkThread({
    title: "Best CRM tools 2024",
    op_body: "general SaaS recommendations",
    op_score: 500,
  });
  // Without requiredTokens, this passes
  assert.ok(scoreThread(t, { category: "best CRM" }).composite_score > 0);
  // With requiredTokens demanding "real" (not in title), this fails
  assert.equal(
    scoreThread(t, { category: "best CRM", requiredTokens: ["real", "estate"] }).composite_score,
    0
  );
});
