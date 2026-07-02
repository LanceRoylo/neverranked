-- Freeze per-report chart data on each monthly report.
--
-- The readout archive renders immutable, dated reports. citation_snapshots holds
-- only the LATEST snapshot per client (it is overwritten every month), so chart
-- data cannot be read live for a historical report -- it has to travel WITH the
-- report. facts_json stores the numbers the report's charts render from, frozen
-- at delivery. Null for older reports (they render narrative-only, no charts).
ALTER TABLE monthly_memos ADD COLUMN facts_json TEXT;
