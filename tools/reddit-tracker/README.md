# @nr/reddit-tracker

Forward-looking discovery of reddit threads likely to be cited by AI
engines for "best X for Y" queries. Sister tool to the dashboard's
`reddit_citations` table (which captures threads AI has already
cited). This package surfaces candidates *before* they show up in
production citation logs.

For non-reddit citation sources (Wikipedia, TripAdvisor, Google
Business Profile, press wires, review aggregators), see the broader
`@nr/citation-gap` package which applies the same gap-analysis
pattern to all source types using real D1 citation data.

## Why it exists

Perplexity, ChatGPT, and Gemini lean heavily on reddit when answering
product-comparison questions. By the time a thread shows up in
`reddit_citations`, the answer is already being served. If we
discover the same threads ahead of time and a customer is missing
from them, we can prioritize a reply brief before the next training
cycle locks the answer shape in.

## What's built

Three composable CLIs, each does one thing:

```bash
# 1. Discover candidate threads for a category
node scripts/reddit-thread-search.mjs \
  --category "best CRM for real estate" \
  --region "Hawaii" \
  --limit 20 \
  --format markdown

# 2. Scan a single thread for client + competitor mentions
node scripts/reddit-mention-scan.mjs \
  --thread "https://www.reddit.com/r/CRM/comments/<id>/" \
  --client-slug "test-client" \
  --client-names "Acme CRM,Acme" \
  --client-domains "acmecrm.com" \
  --competitors "Follow Up Boss,LionDesk,Salesforce"

# 3. End-to-end: discover + scan + brief, prioritized by gap
node scripts/reddit-brief-generate.mjs \
  --category "best CRM for real estate" \
  --client-slug "test-client" \
  --client-names "Acme CRM" \
  --competitors "Follow Up Boss,LionDesk,Salesforce" \
  --top 5
```

Output formats: `table` (search), `summary` (scan), `markdown`
(briefs). All three CLIs accept `--format json` for downstream
piping. All use reddit's public `.json` endpoints with a 1.1s polite
delay (under the unauthenticated 60/min ceiling). No OAuth required.

## Discovery scoring

```
composite = 0.25 * recency + 0.35 * upvote + 0.40 * citation_likelihood
```

Components, all 0..1:

- **Recency** peaks for threads 6 months to 3 years old (sweet spot
  for AI training corpora). Falls off for both fresh threads
  (uncrawled) and stale ones (less likely to surface in retrieval).
- **Upvote** is log-scaled, saturating at 5k upvotes. A 10k-upvote
  thread isn't 100x more citeable than a 100-upvote thread.
- **Citation likelihood** blends title shape (best / vs / anyone
  tried), comment density, self-post bonus, and an optional
  subreddit prior.

The composite is hard-gated by **topic relevance**: the category's
anchor token (the most-distinctive noun, e.g. "CRM" for "best CRM
for real estate") must appear in the thread title. With multiple
anchors, at least 2 must appear. Stem matching handles "host" vs
"hosting", "list" vs "listing".

Weights are heuristic in Phase 1. Once we have observed citations
in `reddit_citations` to backtest against, the weights become a
fitted regression. See `content/prompt-corpus/reddit-thread-discovery.md`
for the full methodology.

## Mention detection

Given a thread URL plus a client identity (names, domains, aliases),
`scanThreadForMentions` fetches the thread + top comments and
reports:

- Where the client is named (title / op_body / comment) with 200-char
  context excerpts and heuristic sentiment classification
- Which competitors are named, with mention counts and sentiments
- A gap signal phrased for downstream brief generation:
  "client absent; N competitor(s) named" or
  "client mentioned Nx (X+ / Y-)"

Output JSON shape matches the eventual `reddit_thread_mentions`
schema (migration 0067) so Phase 2 can wire the writer with no
remapping.

## Brief generation

Given a thread + a mention scan + a category, the brief generator
produces a structured skeleton: gap, angle, tone notes, don't-do
list, draft hooks, and an evidence panel. No LLM call -- the
structure carries most of the value. The skeleton is portable
(paste into Claude / a Notion doc and it stays useful).

The angle inferrer branches on title shape (comparison / recommend /
anyone-tried / best-of). The tone notes pull from a hand-curated
subreddit-culture library (r/realtors, r/CRM, r/SaaS, r/podcasting,
r/marketing, r/SEO, etc.) with a default for unknown subs. The
eventual source of truth for tone is the dashboard's `subreddit_norms`
table (migration 0050).

## Phase 2 backlog

Not built yet, ordered by impact:

1. **Backtest harness** -- join discovered threads against
   `reddit_citations` ground truth as it accumulates. Fit scoring
   weights from observed precision@20 and recall@1000.
2. **DB writer** -- populate `reddit_threads`,
   `reddit_thread_mentions`, `reddit_discovery_queries` per migration
   0067 once scoring is validated.
3. **OAuth client** -- 600 req/min instead of 60. Needed for batch
   discovery across many clients.
4. **Tech-term-aware matching** -- "C++", "node.js", ".NET" tokens
   are currently split or stripped, and the stem matcher's `\b`
   word-boundaries can't find them in titles even if preserved.
   Audit finding H3.
5. **Question-pattern variants** -- builder handles "best X for Y"
   and natural-language questions, but coverage is uneven across
   shapes.
6. **Deeper comment traversal** -- mention scanner only reads
   top-level comments. Nested replies often carry the strongest
   recommendations.
7. **LLM-grade sentiment** -- current sentiment classifier is a
   keyword-lookup heuristic. High-stakes mentions deserve a real
   pass.

## Known limitations (current Phase 1)

- **Latin-script only.** Non-Latin scripts (Japanese, Korean,
  Chinese, Russian, Arabic) tokenize to nothing.
- **No tech-term acronyms with embedded special chars.** "C++",
  "node.js", ".NET" are stripped by tokenization.
- **No DB writes.** All output goes to stdout. Validate scoring
  against real data before persisting.
- **Reddit unauthed rate limit.** 60 req/min. The 1.1s polite delay
  enforces this in-process but not across concurrent invocations.
