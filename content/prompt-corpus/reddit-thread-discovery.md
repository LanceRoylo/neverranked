# Reddit thread discovery -- methodology

Forward-looking discovery of reddit threads likely to be cited by AI
engines for "best X for Y" queries. Companion document to the
`@nr/reddit-tracker` package and the `reddit_threads` table
(migration 0067).

## Why reddit dominates AI citations

Three structural reasons:

1. **Common Crawl preference.** Reddit is one of the largest
   high-quality public-text corpora on the open web. Most foundation
   models train on it directly via Common Crawl snapshots. Threads
   indexed in 2022–2024 are baked into the weights of every major
   2025-era model.

2. **RLHF scoring patterns.** Human raters consistently prefer
   answers that read like reddit prose: candid, comparative,
   first-person. Models learn that "redditor voice" is the safe-bet
   register for product-comparison answers.

3. **Retrieval-augmented bias.** Perplexity and Gemini lean on
   retrieval at inference time. Reddit threads have stable URLs,
   strong link graphs (cross-thread mentions), and domain authority
   that ranks well on the queries those engines fire. Reddit gets
   pulled into the context window disproportionately often.

The downstream effect: when a customer is missing from the canonical
reddit thread for their category, AI engines confidently recommend
their competitors and never mention them. The thread is the choke
point.

## Discovery query patterns

For any category, fire these query shapes against reddit search:

- `best <category>` -- the canonical recommendation thread
- `<category>` -- broader recall (drops the "best" qualifier)
- `<category> recommendations` -- explicit ask threads
- `<category> vs` -- comparison threads
- `<category> <region>` -- local recommendation threads
- `<region> <category>` -- region-led variants

Bonus patterns worth firing manually for high-value categories:

- `anyone tried <product/category>`
- `honest opinions on <category>`
- `what <category> do you actually use`

The tool fires the first six automatically. The bonus patterns are
for human-led deep dives.

## Scoring formula

```
composite = 0.25 * recency + 0.35 * upvote + 0.40 * citation_likelihood
```

### Recency (weight 0.25)

Peaks for threads aged 6 months to 3 years.

- `< 30 days`: 0.20 (too fresh to have been crawled)
- `30 to 180 days`: linear ramp 0.20 → 1.00
- `180 days to 3 years`: 1.00 (sweet spot)
- `> 3 years`: linear decay 1.00 → 0.30 across two years

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

Heuristic blend of four signals:

1. **Title shape (max +0.42):**
   - Contains "best" / "top" / "recommend" → +0.18
   - Contains "vs" / "or" / "versus" → +0.10
   - Contains "anyone tried/used/recommend" → +0.08
   - Contains "honest" / "opinions" / "review" → +0.06

2. **Comment density (max +0.20):** `comments / op_score` ratio,
   capped at 1.5. Lively discussions get cited more than upvote-heavy
   single-comment threads.

3. **Self-post bonus (max +0.10):** Threads with structured selftext
   (≥ 200 chars) score higher than link aggregators. AI engines pull
   the OP body directly into context windows.

4. **Subreddit prior (max +0.30):** Historical citation rate for the
   subreddit, sourced from the `reddit_citations` table. Defaults to
   0.5 weight when the subreddit is unknown.

The weights are heuristic in Phase 1. Once we have ~500 observed
citations in `reddit_citations` to backtest against, we fit a
regression and replace these constants with learned coefficients.

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

## Operational guardrails

- **Rate limit:** unauthed reddit `.json` endpoints are capped at
  ~60 requests/min. The API client adds a 1.1s polite delay between
  sequential calls. For large discovery batches, schedule them
  off-hours and chunk into ~50-thread fetches.
- **NSFW filter:** `over_18` threads are dropped pre-scoring.
- **Deduplication:** the orchestrator dedupes by canonical URL
  across all query variants for a single discovery run.
- **No DB writes in Phase 1:** the CLI prints JSON / table / markdown
  for human review. Once scoring is validated, Phase 2 wires the
  writer to `reddit_threads` and `reddit_thread_mentions`.

## Coordination notes

This methodology owns the discovery side. The dashboard's existing
`reddit_citations` (migration 0047) and `reddit_briefs` (migration
0050) own the post-citation analysis side. The two systems join on
`thread_url`: when a discovered thread shows up in `reddit_citations`,
flip `reddit_threads.observed_in_citations = 1` and timestamp it.
That's the closed loop.

---

## Updates since publication

The original methodology above describes the v1 scoring approach.
The shipped Phase 1 implementation extends it materially based on
stress-testing and audit findings. Authoritative source-of-truth is
the code (`tools/reddit-tracker/src/score.mjs`); the deltas worth
calling out:

**Anchor-based topic relevance gate.** v1 relied on token coverage
across title and op_body, with a threshold floor. Real-world testing
revealed two false-positive classes:

1. Reddit `sort=top` returned viral drama threads that incidentally
   contained query terms ("real estate" appearing in the body of an
   r/AmItheAsshole thread).
2. Generic qualifier words ("platform", "tools") leaked off-topic
   threads through the gate.

The shipped fix:
- Identifies an *anchor token* per category -- the most-distinctive
  noun (acronym >= 3 chars, otherwise tokens >= 5 chars after
  filtering generic type-nouns).
- Requires the anchor in the thread title (not just op_body).
- For multi-anchor categories, requires at least 2 anchors in title.
- Stem matching ("host" matches "hosting", "list" matches "listing").
- Uses `sort=relevance` instead of `sort=top` so reddit's own match
  filter runs first.

**Acronym handling.** v1 treated any uppercase 2-5 letter run as an
acronym. Shipped version:
- Requires acronym length >= 3 (AI / OS / VR are too common).
- Skips acronym detection entirely if the input is all-uppercase
  (otherwise every word looks like an acronym).

**Query-shape variants.** v1 only handled "best X for Y" patterns.
The shipped variant builder classifies query shape (best /
question / noun) and generates appropriate sub-queries per shape.
"What NMLS course should I take" expands to "NMLS course",
"NMLS course recommendations", "anyone tried NMLS course",
"best NMLS course".

**Unicode tokenization.** v1's split regex treated every non-ASCII
letter as a token boundary, dropping diacritics and Scandinavian
letters entirely ("café" -> "caf"). Shipped version normalizes via
NFKD plus a hand-mapped table for non-decomposing Latin letters
(ø/æ/ß/ð/þ/œ/ı/ł). Latin-script only. Non-Latin scripts are
documented as not supported.

**Brand voice sweep.** Brief generator output goes to customers and
must satisfy the Hello Momentum brand voice rules: no em dashes, no
semicolons in body copy, no banned words ("unlock", "leverage",
"effortless", etc.). The brief-generation prose in
`tools/reddit-tracker/src/brief.mjs` and
`tools/citation-gap/src/brief.mjs` was swept and is enforced by
audit.

**Known limitations to revisit in Phase 2:**
- Tech-term acronyms with embedded special chars ("C++", "node.js",
  ".NET", "C#") are still split or stripped by the tokenizer. The
  `\b` word-boundary stem matcher can't find them in titles even if
  preserved. Real fix needs a tech-term-aware matching path.
- Two-letter acronyms (AI, OS, VR, ML) are dropped entirely because
  they leak too much. Co-occurrence rules could re-include them.
- Question-pattern variants don't yet fully handle "anyone tried X"
  shapes that the original methodology lists as bonus patterns.
