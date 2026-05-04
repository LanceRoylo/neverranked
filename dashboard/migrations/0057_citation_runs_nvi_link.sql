-- Link citation_runs to the NVI report they were collected for.
--
-- A given monthly NVI report runs ~40 (Lite) to ~400 (Full) citation
-- queries. Each is stored in citation_runs as it is today, with the
-- new nvi_report_id stamped so we can:
--   - re-aggregate any past report from raw data (idempotent)
--   - exclude NVI-driven runs from the regular weekly citation
--     dashboards if we want a clean separation later
--   - keep the existing weekly cron's citation_runs writes unaffected
--     (nvi_report_id stays NULL for those)
--
-- Nullable on purpose. Not all citation_runs are tied to an NVI
-- report -- the weekly cron's runs aren't.

ALTER TABLE citation_runs ADD COLUMN nvi_report_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_citation_runs_nvi_report
  ON citation_runs(nvi_report_id) WHERE nvi_report_id IS NOT NULL;
