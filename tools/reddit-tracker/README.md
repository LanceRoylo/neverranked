# @nr/reddit-tracker

Forward-looking discovery of reddit threads likely to be cited by AI
engines for "best X for Y" queries. Sister tool to the dashboard's
`reddit_citations` (which captures threads AI has *already* cited).
This package surfaces candidates *before* they show up in production
citation logs.

## Why it exists

Perplexity, ChatGPT, and Gemini lean heavily on reddit when answering
product-comparison questions. By the time a thread shows up in
`reddit_citations`, the answer is already being served. If we discover
the same threads ahead of time and a customer is missing from them,
we can prioritize a reply brief before the next training cycle locks
the answer shape in.

## Phase 1 scope (this package)

- Public-endpoint reddit search (no OAuth)
- Composite scoring: recency + upvotes + citation likelihood
- CLI output (no DB writes yet)

Phase 2 will add:
- OAuth client for higher rate limits
- DB writer to `reddit_threads` / `reddit_thread_mentions`
- Backtest harness against `reddit_citations` ground truth
- Mention detection (find client name/domain inside thread + comments)

## Usage

From the repo root:

```bash
node scripts/reddit-thread-search.mjs \
  --category "best CRM for real estate" \
  --region "Hawaii" \
  --limit 20 \
  --format table
```

Output formats: `table` (default), `json`, `markdown`.

## Scoring

```
composite = 0.25 * recency + 0.35 * upvote + 0.40 * citation_likelihood
```

- **Recency** peaks for threads 6mo–3yr old (sweet spot for AI training
  corpora). Falls off for both fresh threads (uncrawled) and stale ones
  (less likely to surface in retrieval-augmented answers).
- **Upvote** is log-scaled, saturating at 5k upvotes.
- **Citation likelihood** is a heuristic blend of:
  - Title shape (presence of "best", "vs", "anyone tried", etc.)
  - Comment density (high-engagement threads get cited more)
  - Self-post bonus (structured selftext > link aggregators)
  - Subreddit prior (if caller passes historical citation rates)

Weights are heuristic in Phase 1. Once we have ~500 observed citations
in `reddit_citations` to backtest against, the weights become a fitted
regression.

## Coordination

This window owns:
- `tools/reddit-tracker/`
- `dashboard/migrations/0067_reddit_threads.sql`
- `scripts/reddit-thread-search.mjs`
- `content/prompt-corpus/reddit-thread-discovery.md`

Do not touch the audit pipeline, blog content, or schema-check tool —
those are owned by another window.
