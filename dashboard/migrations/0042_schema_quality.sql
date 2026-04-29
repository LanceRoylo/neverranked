-- Schema quality scoring.
--
-- Backs the empirical-research-driven gate against partial / generic
-- schema (which produces an 18-percentage-point citation penalty per
-- the 730-citation 2026 study). Each schema_injections row gets a
-- score 0-100 and a JSON list of specific issues found. The admin UI
-- surfaces the score + lets us block approval below 60.
--
-- Both columns are nullable; rows graded lazily on next view if NULL.

ALTER TABLE schema_injections ADD COLUMN quality_score INTEGER;
ALTER TABLE schema_injections ADD COLUMN quality_issues TEXT;
ALTER TABLE schema_injections ADD COLUMN quality_graded_at INTEGER;

CREATE INDEX idx_schema_injections_quality ON schema_injections(quality_score);
