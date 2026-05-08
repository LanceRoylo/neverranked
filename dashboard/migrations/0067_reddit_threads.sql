-- Phase 1: Reddit thread discovery (forward-looking)
--
-- Distinct from reddit_citations (0047) which extracts reddit URLs
-- from AI engine answers we've ALREADY captured. This set tracks
-- threads we've DISCOVERED ahead of citation -- the "what's likely
-- to be cited next" pipeline. Once a discovered thread shows up in
-- reddit_citations, we have ground-truth precision feedback for the
-- scoring model.
--
-- Three tables:
--   reddit_threads             -- canonical thread metadata
--   reddit_thread_mentions     -- per-client mention occurrences
--   reddit_discovery_queries   -- which "best X for Y" surfaced what

CREATE TABLE IF NOT EXISTS reddit_threads (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_url            TEXT NOT NULL UNIQUE,       -- canonical https://www.reddit.com/r/<sub>/comments/<id>/...
  reddit_id             TEXT NOT NULL,              -- short id (the <id> segment); useful for API calls
  subreddit             TEXT NOT NULL,              -- lowercase, no /r/ prefix
  title                 TEXT NOT NULL,
  op_body               TEXT,                       -- selftext; null for link posts
  op_score              INTEGER NOT NULL DEFAULT 0,
  comment_count         INTEGER NOT NULL DEFAULT 0,
  posted_at             INTEGER NOT NULL,           -- unix seconds, from reddit's created_utc
  fetched_at            INTEGER NOT NULL,           -- when we last refreshed this row
  -- Composite scoring inputs, stored so we can recompute without
  -- re-fetching when the formula changes.
  recency_score         REAL NOT NULL DEFAULT 0,    -- 0..1
  upvote_score          REAL NOT NULL DEFAULT 0,    -- 0..1
  citation_likelihood   REAL NOT NULL DEFAULT 0,    -- 0..1, blend of thread shape + subreddit history
  composite_score       REAL NOT NULL DEFAULT 0,    -- 0..1, the ranked output
  -- Once this thread shows up in reddit_citations, flip this for
  -- precision/recall measurement against the discovery model.
  observed_in_citations INTEGER NOT NULL DEFAULT 0,
  observed_at           INTEGER,
  created_at            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reddit_threads_subreddit ON reddit_threads(subreddit);
CREATE INDEX IF NOT EXISTS idx_reddit_threads_score ON reddit_threads(composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_reddit_threads_observed ON reddit_threads(observed_in_citations, composite_score DESC);

-- Per-client mention occurrences inside a discovered thread. A thread
-- can mention zero or many clients; this table is the join.
CREATE TABLE IF NOT EXISTS reddit_thread_mentions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id         INTEGER NOT NULL,
  client_slug       TEXT NOT NULL,
  mention_type      TEXT NOT NULL,                  -- 'title' | 'op_body' | 'comment'
  mention_context   TEXT,                           -- 200-char surrounding excerpt
  comment_id        TEXT,                           -- when mention_type='comment'
  comment_score     INTEGER,                        -- when mention_type='comment'
  detected_at       INTEGER NOT NULL,
  FOREIGN KEY(thread_id) REFERENCES reddit_threads(id) ON DELETE CASCADE,
  UNIQUE(thread_id, client_slug, mention_type, comment_id)
);

CREATE INDEX IF NOT EXISTS idx_reddit_mentions_client ON reddit_thread_mentions(client_slug, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_reddit_mentions_thread ON reddit_thread_mentions(thread_id);

-- Provenance: which discovery query surfaced which thread. Lets us
-- backtest scoring per query and reproduce a discovery run.
CREATE TABLE IF NOT EXISTS reddit_discovery_queries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  query_text    TEXT NOT NULL,                      -- "best CRM for real estate"
  category      TEXT,                               -- normalized category tag
  region        TEXT,                               -- optional region filter ("Hawaii", "US", ...)
  thread_id     INTEGER NOT NULL,
  rank          INTEGER NOT NULL,                   -- this thread's position in the query result set
  run_at        INTEGER NOT NULL,
  FOREIGN KEY(thread_id) REFERENCES reddit_threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reddit_dq_query ON reddit_discovery_queries(query_text, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_reddit_dq_thread ON reddit_discovery_queries(thread_id);
