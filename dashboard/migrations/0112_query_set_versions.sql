-- 0112: make "the question set is locked" checkable instead of aspirational.
--
-- WHY. The published methodology page said customer question sets were frozen
-- and hash-locked. They were neither. Hash-locking is real in the dryrun
-- research runners and absent from the standing customer measurement, and
-- because nothing enforced it, sets were edited mid-engagement:
--
--   prince-waikiki  18 questions on 2026-08-19, measurement opened 09-01,
--                   12 more added 09-02 (a 67% expansion on day two)
--   hawaii-theatre  34 questions ran in the August window, 16 deactivated
--                   before September
--
-- Worse than the drift itself: it left NO RECORD. citation_keywords has
-- created_at but no updated_at and no log, so a deactivation erases itself.
-- Reconstructing the two facts above took a join against run data, and it
-- would be impossible for a month whose runs have aged out.
--
-- This table is append-only and records a new row ONLY when the active set's
-- hash changes. That gives three things the audit needed and could not get:
--   1. the hash the methodology page promises
--   2. what the set actually was in any past month
--   3. a dated diff of every change, so a comparability break is visible
--      rather than inferred
--
-- See neverranked-docs/CLAIMS-VS-CODE-AUDIT-2026-09-06.md finding 1.

CREATE TABLE IF NOT EXISTS query_set_versions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug    TEXT NOT NULL,
  -- SHA-256 over the active keyword strings, sorted, newline-joined. Same
  -- input shape as the dryrun runners so the two sides are comparable.
  set_hash       TEXT NOT NULL,
  question_count INTEGER NOT NULL,
  -- The full set, so a past month can be reconstructed without the runs.
  keywords_json  TEXT NOT NULL,
  observed_at    INTEGER NOT NULL,
  -- NULL on a client's first observation. Non-null rows are changes.
  prev_hash      TEXT,
  added_json     TEXT NOT NULL DEFAULT '[]',
  removed_json   TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_query_set_versions_client
  ON query_set_versions (client_slug, observed_at DESC);
