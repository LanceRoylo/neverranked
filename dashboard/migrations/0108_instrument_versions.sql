-- Daily record of which model version each AI surface ACTUALLY served.
--
-- WHY (2026-08-29): the engines change models without notice, and that is
-- the entire premise of repeated measurement. Twice in August a surface
-- changed instrument under us (gpt-4o-mini-search-preview 404'd 08-21;
-- Perplexity Sonar retires 09-27). Every API response already reports the
-- exact dated model that served it (verified live: requesting
-- "gpt-5-search-api" returns model "gpt-5-search-api-2025-10-14"), and the
-- runner discards it. This table is that serial number, one row per engine
-- per day, written by the daily instrument probe in lib/instrument-check.ts.
--
-- A change between consecutive recorded versions raises an
-- `instrument_change` admin alert, and the table doubles as the raw data for
-- the methodology changelog: which months compare cleanly, and which
-- comparison crosses an instrument boundary.

CREATE TABLE IF NOT EXISTS instrument_versions (
  day           TEXT NOT NULL,             -- YYYY-MM-DD (UTC)
  engine        TEXT NOT NULL,             -- matches citation_runs.engine
  model_version TEXT NOT NULL,             -- exactly as the API reported it
  checked_at    INTEGER NOT NULL,          -- unixepoch
  PRIMARY KEY (day, engine)
);
