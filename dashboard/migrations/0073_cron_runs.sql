-- Cron task telemetry.
--
-- Every scheduled task in cron.ts now logs its own success/partial/failure
-- on completion. This is the data backing the /admin/health page and the
-- anomaly detection cron. Without this table, we have no machine-readable
-- record of whether a given cron path actually ran, only console.log lines
-- in wrangler tail that disappear after a day.
--
-- Inserts are wrapped in try/catch so a logging failure never takes down
-- the actual cron task. Worst case: we lose telemetry for one run.
--
-- status meanings:
--   success -- task ran end-to-end, all sub-work completed
--   partial -- task ran but some sub-work failed (e.g. 3 of 5 clients OK)
--   failure -- task threw an error or completed zero meaningful work

CREATE TABLE IF NOT EXISTS cron_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  task_name    TEXT NOT NULL,
  status       TEXT NOT NULL CHECK(status IN ('success','partial','failure')),
  ran_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  duration_ms  INTEGER,
  detail       TEXT
);

CREATE INDEX idx_cron_runs_task_ranat ON cron_runs(task_name, ran_at DESC);
CREATE INDEX idx_cron_runs_ranat ON cron_runs(ran_at DESC);
