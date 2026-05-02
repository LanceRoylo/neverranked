-- Weekly AEO brief: aggregated, anonymized weekly observation feed
-- across all NeverRanked clients.
--
-- One row per week. Generated Thursday morning from the prior 7 days
-- of citation_runs / reddit_citations / share_of_voice / bot_hits /
-- sentiment data. Lance reviews + approves before publish, then it
-- appears at /weekly/<slug> as a public, indexable archive.
--
-- The data_snapshot column captures the numbers we showed Claude when
-- generating, so future-Lance can verify the brief against source
-- without re-running queries on potentially-rolled data.
--
-- slug is YYYY-WW form (week-of-2026-05-01) so URLs are stable +
-- archive lists chronologically by string sort.

CREATE TABLE IF NOT EXISTS weekly_briefs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,
  week_starts_at  INTEGER NOT NULL,           -- Monday UTC of the week analyzed
  title           TEXT NOT NULL,
  summary         TEXT NOT NULL,              -- 1-2 sentences, used as meta description
  body_markdown   TEXT NOT NULL,
  data_snapshot   TEXT,                       -- JSON of stats fed to generator
  status          TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'published' | 'rejected'
  approved_by     INTEGER,
  approved_at     INTEGER,
  published_at    INTEGER,
  generated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weekly_briefs_status
  ON weekly_briefs(status, published_at DESC);
