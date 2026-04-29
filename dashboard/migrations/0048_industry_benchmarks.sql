-- Phase 6A: Industry benchmarks
--
-- A client's AEO score (e.g. 72) is contextless without an industry
-- baseline. We tag clients with an industry (manual admin field, no
-- auto-classification in v1) and compute weekly rollups so the
-- dashboard can show "you're in the 78th percentile for SaaS".
--
-- The rollup table is recomputed by a daily cron task; we keep
-- ONE row per industry holding median + p25/p75/p90 plus citation
-- share statistics + sample_size. Stats with sample_size < 5 are
-- hidden in the dashboard (too noisy to show).

ALTER TABLE client_settings ADD COLUMN industry TEXT;

CREATE TABLE IF NOT EXISTS industry_benchmarks (
  industry             TEXT PRIMARY KEY,
  sample_size          INTEGER NOT NULL,
  -- AEO score distribution (latest scan_results per client)
  aeo_p25              REAL NOT NULL,
  aeo_median           REAL NOT NULL,
  aeo_p75              REAL NOT NULL,
  aeo_p90              REAL NOT NULL,
  -- Citation share distribution (latest citation_snapshot per client)
  citation_p25         REAL,
  citation_median      REAL,
  citation_p75         REAL,
  citation_p90         REAL,
  -- Schema coverage (% of CRITICAL_SCHEMAS present, mean across clients)
  schema_coverage_mean REAL,
  computed_at          INTEGER NOT NULL
);
