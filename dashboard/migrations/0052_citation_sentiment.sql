-- Sentiment tracking on AI citations.
--
-- For every citation_run where the client was named (client_cited = 1),
-- we score how the AI described them: positive / neutral / negative,
-- plus a one-sentence reason. Negative mentions land in admin_inbox so
-- Lance sees them immediately. The dashboard rolls up the distribution
-- across recent runs.
--
-- All three columns are nullable. NULL sentiment_scored_at means the
-- row hasn't been scored yet (rows from before this migration, or runs
-- where client_cited = 0). The daily cron processes 100 unscored rows
-- per pass to backfill history.
--
-- Cost: Claude Haiku 4.5 single call per row, ~$0.001 each. With ~700
-- runs/week per client and only client_cited=1 rows scored, real cost
-- is well under $1/month per client.

ALTER TABLE citation_runs ADD COLUMN sentiment TEXT;
ALTER TABLE citation_runs ADD COLUMN sentiment_reason TEXT;
ALTER TABLE citation_runs ADD COLUMN sentiment_scored_at INTEGER;

-- Partial index on unscored rows speeds up the daily-cron backfill query.
CREATE INDEX IF NOT EXISTS idx_citation_runs_unscored
  ON citation_runs(run_at DESC)
  WHERE sentiment_scored_at IS NULL AND client_cited = 1;

-- Index for the dashboard rollup ("show me sentiment distribution for
-- this client in the last 90 days").
CREATE INDEX IF NOT EXISTS idx_citation_runs_sentiment
  ON citation_runs(keyword_id, sentiment, run_at DESC)
  WHERE sentiment IS NOT NULL;
