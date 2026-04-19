-- NPS responses
--
-- Standard 0-10 NPS scale. We ask paying users every 90 days, with
-- a "user has been around for 30+ days" floor so we don't ask
-- brand-new users who haven't formed an opinion yet.
--
-- Categorization:
--   0-6  -> detractor (red flag)
--   7-8  -> passive
--   9-10 -> promoter
--
-- We don't compute NPS server-side; the admin view does it from raw
-- counts. follow_up is the optional free-text "why?" answer.
--
-- dismissed=1 records an explicit dismiss without a score, so we
-- still know to wait the full 90 days before asking again.

CREATE TABLE nps_responses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  user_email      TEXT NOT NULL,
  score           INTEGER,        -- 0-10, null when dismissed
  follow_up       TEXT,           -- free-text "why?"
  dismissed       INTEGER NOT NULL DEFAULT 0,
  client_slug     TEXT,
  agency_id       INTEGER REFERENCES agencies(id),
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_nps_user_created ON nps_responses(user_id, created_at DESC);
CREATE INDEX idx_nps_score_created ON nps_responses(score, created_at DESC);
