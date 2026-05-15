-- Outreach send_log → D1 (migration Phase 1, Option A)
-- Mirrors neverranked-outreach/outreach.db send_log table.
-- Inline FK to prospects dropped: D1 does not enforce FKs by default
-- and the migration plan marks them optional. prospect_id is indexed
-- instead for the join paths the dashboard actually uses.
CREATE TABLE IF NOT EXISTS outreach_send_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id    INTEGER NOT NULL,
  action         TEXT NOT NULL,
  note_used      TEXT,
  error_message  TEXT,
  note_variant   TEXT,
  sent_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_outreach_send_log_prospect ON outreach_send_log(prospect_id);
CREATE INDEX IF NOT EXISTS idx_outreach_send_log_sent_at ON outreach_send_log(sent_at);
CREATE INDEX IF NOT EXISTS idx_outreach_send_log_action ON outreach_send_log(action);
