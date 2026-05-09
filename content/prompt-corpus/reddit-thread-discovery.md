# Reddit thread discovery -- methodology

Forward-looking discovery of reddit threads likely to be cited by AI
engines for "best X for Y" queries. Companion document to the
`@nr/reddit-tracker` package and the `reddit_threads` table
(migration 0067).

The authoritative source-of-truth is the code in
`tools/reddit-tracker/src/score.mjs` plus its 28-test suite at
`tools/reddit-tracker/test/score.test.mjs`. This document describes
the design rationale and known limitations. When code and doc
disagree, code wins.

## Why reddit dominates AI citations (when it does)

Three structural reasons:

1. **Common Crawl preference.** Reddit is one of the largest
   high-quality public-text corpora on the open web. Most foundation
   models train on it directly via Common Crawl snapshots. Threads
   indexed in 2022-2024 are baked into the weights of every major
   2025-era model.

2. **RLHF scoring patterns.** Human raters consistently prefer
   answers that read like reddit prose: candid, comparative,
   first-person. Models learn that "redditor voice" is the safe-bet
   register for product-comparison answers.

3. **Retrieval-augmented bias.** Perplexity and Gemini lean on
   retrieval at inference time. Reddit threads have stable URLs,
   strong link graphs, and domain authority that ranks well on the
   queries those engines fire. Reddit gets pulled into the context
   window disproportionately often.

**When reddit does NOT dominate citation:** local, brand-name, and
venue-specific queries. AI engines pull from Wikipedia, TripAdvisor,
brand sites, Maps, and press releases for those. Across 695 captured
citation runs for current NeverRanked clients (mostly Hawaii local
businesses) we saw zero reddit citations. The reddit tracker is
strategic infrastructure for SaaS / national / product-comparison customers,
not the current customer mix. Use the broader `@nr/citation-gap`
package for source-agnostic gap analysis on local-business clients.

## Discovery query patterns

The shipped variant builder classifies the input into one of three
shapes and generates sub-queries per shape:

**"best X for Y" / "best X" / "top X":**
- the raw query
- bare nouns (drops "best")
- bare nouns + "recommendations"
- bare nouns + "vs"

**"what X should I take" / "which X is" / "anyone tried X":**
- the raw query
- bare nouns (strips question scaffolding)
- bare nouns + "recommendations"
- "anyone tried" + bare nouns
- "best" + bare nouns

**Bare noun phrase like "podcast hosting":**
- the raw query
- "best" + nouns
- nouns + "recommendations"
- nouns + "vs"

When a region is provided (e.g. "Hawaii"), the orchestrator adds two
region-scoped variants: "<bare> <region>" and "<region> <bare>".

The shipped builder fires `sort=relevance` against reddit search
(not `sort=top`). Reddit's own match-quality filter runs before our
scorer sees results, which suppresses the most common false-positive
class (viral drama threads that incidentally contain query terms).

Bonus patterns worth firing manually for high-value categories:

- `honest opinions on <category>`
- `what <category> do you actually use`

The tool does not auto-generate these. They're for human-led
deep dives.

## Topic relevance: anchor-based gate

The composite scorer's first filter is **topic relevance**, which
returns 0 (kill the thread) when the title isn't on-topic. Soft
scoring only happens once the gate passes.

**Anchor token selection** (`anchorTokens` in score.mjs):

1. **Acronyms (>= 3 chars, mixed-case context only).** "CRM" / "API"
   / "ERP" / "SEO" / "NMLS" -- highly specific to a domain. Acronyms
   shorter than 3 chars (AI / OS / VR / ML) are dropped because they
   match too broadly. Pure-uppercase queries like "BEST CRM TOOL"
   skip acronym detection entirely (every word would look like an
   acronym; falls through to the lowercase pipeline).
2. **Tech terms (containing `+` `.` `#`).** "c++" / "node.js" /
   ".net" / "c#" -- inherently distinctive, anchor regardless of
   length. Deduplicated against bare-acronym matches: ".NET" produces
   anchor [".net"] not ["net", ".net"].
3. **Long tokens (>= 5 chars) after filtering generic type-nouns.**
   "platform" / "tools" / "software" / "service" are kind-of-thing
   words, not category-defining ones. Filtered from anchor candidates
   so "best podcast hosting platform" anchors on ["podcast", "hosting"]
   not ["platform"].
4. **All non-generic tokens** as fallback for short single-word
   categories.

**Anchor satisfaction rule:**
- Single-anchor categories ("best CRM"): require the anchor in title.
- Multi-anchor categories ("best podcast hosting platform"): require
  at least 2 anchors in title.

**Stem matching:**
- Regular tokens use `\b` word-boundary plus optional headline
  suffixes `(?:s|ed|er|ers|ing|ings)`. So anchor "podcast" matches
  "podcasters" in title; anchor "hosting" matches "hostings".
- Tech terms use explicit non-alphanumeric boundaries instead of `\b`
  (because both sides of "++" or "#" are non-word chars). Suffix
  variants are disabled for tech terms (no "c++s").

**One-way limitation:** the stem matcher matches base + suffixes
("hosting" finds "hostings") but not truncations ("hosting" does NOT
match "host"). The reverse-direction stem improvement is Phase 2.

## Scoring formula

Once topic relevance > 0, the composite is:

```
composite = 0.25 * recency + 0.35 * upvote + 0.40 * citation_likelihood
```

### Recency (weight 0.25)

Peaks for threads aged 6 months to 3 years.

- `< 30 days`: 0.20 (too fresh to have been crawled)
- `30 to 180 days`: linear ramp 0.20 -> 1.00
- `180 days to 3 years`: 1.00 (sweet spot)
- `> 3 years`: linear decay 1.00 -> 0.30 across two years

The sweet spot exists because models train on snapshots. A thread
posted last week probably isn't in any 2025 model's training data.
A thread from 2018 is, but it's also competing with five years of
fresher discussion when retrieval engines pick context.

### Upvote (weight 0.35)

Log-scaled upvote score, saturating at 5,000:

```
upvote_score = min(1, log10(ups + 1) / 3.7)
```

Log scaling matters because raw upvote distribution on reddit is
extremely heavy-tailed. A 10k-upvote thread isn't 100x more citeable
than a 100-upvote thread. It's maybe 2x. The log brings the curve
back toward something usable as a feature.

### Citation likelihood (weight 0.40)

Heuristic blend of four signals, with topic-relevance dampening:

1. **Title shape (max +0.42):**
   - Contains "best" / "top" / "recommend" -> +0.18
   - Contains "vs" / "or" / "versus" -> +0.10
   - Contains "anyone tried/used/recommend" -> +0.08
   - Contains "honest" / "opinions" / "review" -> +0.06

2. **Comment density (max +0.20):** `comments / op_score` ratio,
   capped at 1.5. Lively discussions get cited more than upvote-heavy
   single-comment threads.

3. **Self-post bonus (max +0.10):** Threads with structured selftext
   (>= 200 chars) score higher than link aggregators. AI engines pull
   the OP body directly into context windows.

4. **Subreddit prior (max +0.30):** Historical citation rate for the
   subreddit, sourced from the `reddit_citations` table. Defaults to
   0.5 weight when the subreddit is unknown.

The raw likelihood is multiplied by `(0.4 + 0.6 * topic_relevance)`
so a perfectly-shaped title ("Best X vs Y") on an off-topic thread
loses most of its title-shape bonus.

### Hard relevance floor

After all components, if topic_relevance is below 0.20, the composite
collapses to 0. This is a belt-and-suspenders safety net. The anchor
gate handles >99% of off-topic exclusions; the floor catches narrow
cases where the title has 1 token of 5+ tokens with no body match.

## Unicode tokenization

The tokenizer must handle non-English business names without dropping
their letters as token boundaries.

**Two-stage Latin folding:**
1. Hand-mapped table for non-decomposing Latin letters (ø/Ø, æ/Æ,
   ß, ð/Ð, þ/Þ, œ/Œ, ı/İ, ł/Ł). NFKD doesn't decompose these because
   they're base codepoints, not letter+diacritic pairs.
2. NFKD normalization splits precomposed letter+diacritic ("é" ->
   "e" + U+0301) and we strip the combining marks block
   (U+0300..U+036F).

**Tokenization split** preserves `+` `.` `#` inside tokens (so tech
terms survive) but treats every other non-alphanumeric character as
a separator. Post-process trims leading non-`.` chars and trailing
non-`+#` chars to clean up sentence-edge punctuation.

**Length floor** is 3 alphanumeric chars for regular tokens,
relaxed to "at least one letter" for tech terms (so "c#" survives
despite being 2 chars).

## Validation plan

The `reddit_citations` table is ground truth. For every discovered
thread, we eventually observe whether it shows up in a real AI engine
citation. Two metrics drive scoring iteration:

- **Precision@20:** Of the top 20 discovered threads for a query, how
  many show up in `reddit_citations` within 30/60/90 days?
- **Recall@1000:** Of all threads cited for queries in this category
  over the last 90 days, how many appeared in our top-1000 discovery
  set?

Phase 2 wires these into a backtest harness and reports them per
category. Until then, the scoring weights stay frozen and we accept
heuristic precision.

**Current data state:** as of session-end, no current customer's
tracked queries surface reddit citations in `citation_runs`. The
backtest harness has nothing to backtest until either (a) NeverRanked
takes on a SaaS or category-shaped customer, or (b) reddit citations
appear in the existing data set as engines update their retrieval
sources.

## Operational guardrails

- **Rate limit:** unauthed reddit `.json` endpoints are capped at
  ~60 requests/min. The API client enforces a 1.1s polite delay
  between sequential calls and a 10-second per-request timeout via
  AbortController. For large discovery batches, schedule off-hours
  and chunk into ~50-thread fetches. Cross-process rate limiting
  (multiple CLI invocations) is not implemented; outstanding audit
  item.
- **NSFW filter:** `over_18` threads are dropped pre-scoring.
- **Deduplication:** the orchestrator dedupes by canonical URL across
  all query variants for a single discovery run.
- **No DB writes in Phase 1:** the CLI prints JSON / table / markdown
  for human review. Once scoring is validated, Phase 2 wires the
  writer to `reddit_threads`, `reddit_thread_mentions`, and
  `reddit_discovery_queries`.

## Brand voice contract

The brief generator emits prose that goes directly to NeverRanked
customers via the dashboard panel. It satisfies the Hello Momentum
brand voice rules:

- No em dashes
- No semicolons in body copy
- No banned words ("unlock", "leverage", "effortless", "seamless",
  "cutting-edge", "revolutionize", etc.)

The test suite includes voice-related coverage indirectly through
content assertions on inferred angles and tone notes.

## Known limitations (current Phase 1)

- **Stem matcher is one-way.** Anchor "hosting" matches "hostings"
  via suffix variants, but not "host" via truncation. Phase 2.
- **Two-letter acronyms dropped entirely.** AI / OS / VR / ML get
  filtered out because they leak too much. Co-occurrence rules
  ("AI" + "tools" together) could re-include them. Phase 2.
- **Non-Latin scripts unsupported.** Japanese / Korean / Chinese /
  Cyrillic / Arabic queries tokenize to nothing. No customer in the
  current data needs this; if one ever does, that's a separate code
  path.
- **No DB writes.** All output is to stdout / dashboard HTML. The
  `reddit_threads` schema (migration 0067) is ready; Phase 2 wires
  the writer.
- **No backtest harness.** Heuristic weights stay frozen. See
  Validation plan above.
- **Cross-process rate limit.** In-process polite delay only;
  concurrent CLI invocations would each fire requests at the unauthed
  ceiling without coordination. Outstanding audit item, low priority
  (single-user CLI, rare).

## Coordination notes

This methodology owns the discovery side. The dashboard's existing
`reddit_citations` (migration 0047) and `reddit_briefs` (migration
0050) own the post-citation analysis side. The two systems join on
`thread_url`: when a discovered thread shows up in `reddit_citations`,
flip `reddit_threads.observed_in_citations = 1` and timestamp it.
That's the closed loop.

For broader source-type gap analysis (Wikipedia, TripAdvisor,
Google Business Profile, news sources, etc.), see the sister
`@nr/citation-gap` package. The reddit tracker is one source type
within that broader system.

## Design history

This document was originally written before stress-testing exposed
the off-topic-leak class of false positives ("real estate" in
r/AmItheAsshole). The shipped scoring approach above is the v2
result of that stress-test cycle. The original v1 approach used
token coverage with a threshold floor (no anchor concept), which
was insufficient to filter viral drama threads on generic-keyword
categories. The anchor-based gate, multi-anchor rule, stem matching,
and `sort=relevance` change all came from that audit cycle, with
unit tests locking in each behavior change.

Brand voice violations in the brief generators (em dashes,
body-copy semicolons, banned words) were swept in a separate audit
pass. The dashboard panel rendering was added after the CLI was
validated against real production data on Hawaii Theatre and the
NeverRanked-internal-business citation runs.
