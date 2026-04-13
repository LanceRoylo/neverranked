-- Admin alerts feed: per-client events surfaced in cockpit
CREATE TABLE IF NOT EXISTS admin_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug TEXT NOT NULL,
  type TEXT NOT NULL, -- auto_completed, regression, milestone, needs_review, score_change
  title TEXT NOT NULL,
  detail TEXT,
  roadmap_item_id INTEGER,
  read_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_admin_alerts_unread ON admin_alerts(read_at, created_at DESC);
CREATE INDEX idx_admin_alerts_client ON admin_alerts(client_slug, created_at DESC);
