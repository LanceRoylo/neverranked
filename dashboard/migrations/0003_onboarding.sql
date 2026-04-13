-- Competitor suggestions from client onboarding
CREATE TABLE IF NOT EXISTS competitor_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug TEXT NOT NULL,
  suggested_by INTEGER NOT NULL,
  domain TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comp_suggestions_slug ON competitor_suggestions(client_slug, status);

-- Track whether user has completed onboarding
ALTER TABLE users ADD COLUMN onboarded INTEGER NOT NULL DEFAULT 0;

-- Mark existing admin users as onboarded (they don't need the form)
UPDATE users SET onboarded = 1 WHERE role = 'admin';
