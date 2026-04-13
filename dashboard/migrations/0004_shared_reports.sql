-- Shareable public report links
CREATE TABLE IF NOT EXISTS shared_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  domain_id INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_reports_token ON shared_reports(token);
