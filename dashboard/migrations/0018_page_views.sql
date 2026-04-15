-- Engagement tracking: lightweight page view log
CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  client_slug TEXT,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_page_views_user ON page_views (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_page_views_slug ON page_views (client_slug, created_at);
