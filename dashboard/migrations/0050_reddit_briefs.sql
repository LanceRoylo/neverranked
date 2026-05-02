-- Phase 5B: Reddit reply briefs
--
-- For Amplify-tier clients, we generate a structured brief (gap, angle,
-- tone notes, don't-do list) for any reddit thread surfaced on the
-- /reddit/<slug> dashboard. The brief is explicitly NOT a draft -- it
-- guides the human practitioner who writes their own reply.
--
-- One brief per (client, thread) is cached so repeat clicks are free.
-- Re-generating overwrites in place via the UNIQUE constraint.

CREATE TABLE IF NOT EXISTS reddit_briefs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug       TEXT NOT NULL,
  thread_url        TEXT NOT NULL,            -- canonical reddit thread URL (matches reddit_citations.thread_url)
  subreddit         TEXT NOT NULL,            -- denorm for fast filtering
  brief_json        TEXT NOT NULL,            -- {gap, angle, tone_notes[], dont_do[]}
  thread_snapshot   TEXT NOT NULL,            -- {op_title, op_body, top_comments[]} captured at gen time
  model             TEXT NOT NULL,            -- e.g. claude-sonnet-4-5
  generated_by      INTEGER,                  -- users.id of who clicked Generate
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  UNIQUE(client_slug, thread_url)
);

CREATE INDEX IF NOT EXISTS idx_reddit_briefs_client ON reddit_briefs(client_slug, created_at DESC);

-- Tiny per-subreddit cache of community norms (sidebar description +
-- public rules). Saves a Reddit API call per brief once primed; refreshed
-- when older than 7 days. Keyed by lowercase subreddit name.
CREATE TABLE IF NOT EXISTS subreddit_norms (
  subreddit         TEXT PRIMARY KEY,
  description       TEXT,
  rules_json        TEXT,                     -- JSON array of {short_name, description}
  fetched_at        INTEGER NOT NULL
);
