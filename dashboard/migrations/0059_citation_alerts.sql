-- Real-time citation alerting.
--
-- After every citation run we compare the new (keyword_id, engine) row
-- to the most recent prior row for the same tuple. If the citation
-- state changed (gained or lost), we write an alert row here.
--
-- A separate digest job batches unsent alerts per client_slug into a
-- single email so a customer with 50 keyword changes after a weekly
-- run doesn't get 50 emails. notified_at = NULL means "pending."
--
-- alert_kind values:
--   'gained'   -- engine started citing the client this run
--   'lost'     -- engine stopped citing the client this run
--   'competitor_surge'  -- new competitor appeared (v2; not wired in
--                          this migration)
--
-- Plan gate: alerts only fire for clients on Signal+ (see
-- plan-limits.ts realTimeAlerts feature flag). Pulse customers run
-- monthly so per-run diffs aren't useful at that cadence.

CREATE TABLE IF NOT EXISTS citation_alerts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug   TEXT NOT NULL,
  keyword_id    INTEGER NOT NULL,
  engine        TEXT NOT NULL,
  alert_kind    TEXT NOT NULL,        -- 'gained' | 'lost' | 'competitor_surge'
  prev_run_id   INTEGER,              -- citation_runs.id of the prior state
  new_run_id    INTEGER NOT NULL,     -- citation_runs.id that triggered the alert
  prev_prominence INTEGER,            -- denorm so digest can show position context
  new_prominence  INTEGER,
  created_at    INTEGER NOT NULL,
  notified_at   INTEGER,              -- NULL until digest sent
  FOREIGN KEY (keyword_id) REFERENCES citation_keywords(id),
  FOREIGN KEY (new_run_id) REFERENCES citation_runs(id)
);

-- Pending alerts per client (digest job's hot query)
CREATE INDEX IF NOT EXISTS idx_citation_alerts_pending
  ON citation_alerts (client_slug, notified_at)
  WHERE notified_at IS NULL;

-- For per-client recent-history views in the dashboard
CREATE INDEX IF NOT EXISTS idx_citation_alerts_client_recent
  ON citation_alerts (client_slug, created_at DESC);
