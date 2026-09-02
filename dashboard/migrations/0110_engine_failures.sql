-- Engine call failures, given a durable and queryable home.
--
-- WHY: a failed engine call is deliberately NOT written to citation_runs. A
-- non-reading must never be able to look like a measurement (see the
-- 2026-07-24 incident referenced in citations.ts). The cost of that correct
-- decision was that the ONLY record of a failure became a console.log, which
-- is not queryable and does not survive.
--
-- The knock-on effect was worse than losing the logs. engine-health-check
-- scores an engine by its empty rate among PERSISTED rows. While failures were
-- being written as empty-text rows it saw 44-53% for openai and correctly
-- flipped it to degraded, repeatedly, through June and July. Once failures
-- stopped being persisted that same number collapsed to 0.36% over 30 days
-- without the engine improving at all, and the check has not fired since
-- 2026-08-02. The metric's input changed meaning underneath it.
--
-- This table restores a real signal without ever putting a non-reading into
-- citation_runs.
CREATE TABLE IF NOT EXISTS engine_failures (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  engine     TEXT NOT NULL,
  status     INTEGER,              -- HTTP status where we have one, else NULL
  keyword    TEXT,
  detail     TEXT,                 -- truncated upstream error body
  failed_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_engine_failures_engine_time
  ON engine_failures(engine, failed_at);
