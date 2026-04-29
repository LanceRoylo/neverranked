-- Phase 5: Reddit citation tracking
--
-- Reddit threads are one of the heaviest non-corporate citation
-- sources in Perplexity / ChatGPT / Gemini answers, especially for
-- product-comparison and "best X for Y" queries. We already capture
-- every cited URL in citation_runs.cited_urls -- this table extracts
-- the reddit-specific subset and joins it to client + competitor
-- presence so the dashboard can surface "competitors are getting
-- cited via r/X but you aren't."

CREATE TABLE IF NOT EXISTS reddit_citations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug   TEXT NOT NULL,
  keyword_id    INTEGER NOT NULL,
  engine        TEXT NOT NULL,            -- perplexity, openai, gemini, anthropic
  subreddit     TEXT NOT NULL,            -- lowercase, no /r/ prefix (e.g. "saas")
  thread_url    TEXT NOT NULL,            -- canonical reddit thread URL
  client_cited  INTEGER NOT NULL DEFAULT 0, -- 1 if the client was named in the same response
  run_id        INTEGER NOT NULL,         -- citation_runs.id this came from
  run_at        INTEGER NOT NULL,         -- denorm of citation_runs.run_at for fast windowed queries
  UNIQUE(run_id, thread_url)              -- one extracted thread per run
);

CREATE INDEX IF NOT EXISTS idx_reddit_citations_client ON reddit_citations(client_slug, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_reddit_citations_subreddit ON reddit_citations(client_slug, subreddit);
CREATE INDEX IF NOT EXISTS idx_reddit_citations_keyword ON reddit_citations(keyword_id);
