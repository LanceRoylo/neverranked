-- Outreach daily_limits → D1 (migration Phase 1, Option A)
-- Mirrors neverranked-outreach/outreach.db daily_limits table.
-- Preserves the UNIQUE(date, vertical) constraint so the limiter's
-- upsert-by-day-and-vertical logic ports unchanged.
CREATE TABLE IF NOT EXISTS outreach_daily_limits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  date          TEXT NOT NULL,
  vertical      TEXT NOT NULL DEFAULT 'real_estate',
  sends_count   INTEGER DEFAULT 0,
  last_send_at  DATETIME,
  UNIQUE(date, vertical)
);
CREATE INDEX IF NOT EXISTS idx_outreach_daily_limits_date ON outreach_daily_limits(date);
