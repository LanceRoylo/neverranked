-- Conversation depth: how AI describes the client beyond bare sentiment.
--
-- Sentiment (0052) tells us positive/neutral/negative. Depth tells us:
--   * framing: how AI categorizes the brand (value, premium, specialist,
--     established, niche, budget, balanced) -- the brand-positioning
--     dimension that signals to a customer what AI thinks the brand IS,
--     not just whether AI likes it
--   * framing_phrase: the actual descriptive phrase AI used ("the cheap
--     option", "an established Honolulu agency", "a boutique studio")
--   * competitive_position: when AI lists alternatives, is the client
--     primary (first/main recommendation), secondary (mentioned but not
--     featured), tertiary (in a list), or sole (only one mentioned)
--   * competitors_mentioned: JSON array of other brands AI named alongside
--   * prominence_class: recommended (active recommendation), listed
--     (named in a list of options), footnote (mentioned in passing or
--     as caveat)
--   * depth_reason: one-sentence model explanation
--   * depth_scored_at: scoring timestamp for backfill bookkeeping
--
-- This is the layer that turns "we got cited" into "we got cited as the
-- premium option, primary recommendation, alongside Smith and Jones." That
-- is the actionable signal: framing tells the customer how AI sees their
-- positioning vs. how they want to be seen, and counter-positioning vs.
-- the competitors named gives the diff to fix.
--
-- All columns nullable; pre-migration rows score on backfill. Same daily
-- cron pattern as sentiment, separate Haiku call (so failure on one
-- doesn't block the other).

ALTER TABLE citation_runs ADD COLUMN framing TEXT;
ALTER TABLE citation_runs ADD COLUMN framing_phrase TEXT;
ALTER TABLE citation_runs ADD COLUMN competitive_position TEXT;
ALTER TABLE citation_runs ADD COLUMN competitors_mentioned TEXT;
ALTER TABLE citation_runs ADD COLUMN prominence_class TEXT;
ALTER TABLE citation_runs ADD COLUMN depth_reason TEXT;
ALTER TABLE citation_runs ADD COLUMN depth_scored_at INTEGER;

-- Partial index on unscored client-cited rows for the backfill cron.
CREATE INDEX IF NOT EXISTS idx_citation_runs_undeep
  ON citation_runs(run_at DESC)
  WHERE depth_scored_at IS NULL AND client_cited = 1;

-- Rollup index for dashboard queries: "how was the client framed across
-- the last 90 days, by engine and framing class."
CREATE INDEX IF NOT EXISTS idx_citation_runs_framing
  ON citation_runs(keyword_id, framing, run_at DESC)
  WHERE framing IS NOT NULL;
