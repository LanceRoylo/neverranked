-- Day 11 first brick: the automation audit trail.
--
-- Every automated decision the system makes (auto-generated roadmap,
-- auto-approved schema, auto-added competitor suggestion, auto-retried
-- scan, etc.) lands in this table with enough context to be reviewed,
-- audited, or rolled back.
--
-- kind:        short slug for the automation type (e.g. 'auto_roadmap',
--              'auto_schema_approve', 'auto_scan_retry'). Lets the admin
--              cockpit filter by automation kind.
-- target_type: what we acted on ('client', 'agency', 'domain', 'schema_injection')
-- target_id:   the primary key of the target row (domain.id, agency.id, etc.)
-- target_slug: client_slug when applicable, for easier cross-referencing
-- reason:      human-readable one-liner on why we auto-acted
-- detail:      optional JSON blob for structured audit data

CREATE TABLE IF NOT EXISTS automation_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   INTEGER,
  target_slug TEXT,
  reason      TEXT NOT NULL,
  detail      TEXT,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_log_kind       ON automation_log(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_log_target_id  ON automation_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_automation_log_created    ON automation_log(created_at DESC);

-- Admin-wide automation pause switch. Single-row table (id=1). Flipping
-- `paused=1` makes every auto-decision skip execution and instead write
-- an admin_alerts row asking for manual review. Emergency stop valve.

CREATE TABLE IF NOT EXISTS automation_settings (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  paused               INTEGER NOT NULL DEFAULT 0,
  paused_reason        TEXT,
  paused_at            INTEGER,
  last_updated_at      INTEGER NOT NULL
);

INSERT OR IGNORE INTO automation_settings (id, paused, last_updated_at)
  VALUES (1, 0, CAST(strftime('%s', 'now') AS INTEGER));
