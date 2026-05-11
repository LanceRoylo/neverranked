-- 0072_free_tier.sql
-- Free monitoring tier: standing free product surface that captures
-- email at top of funnel, runs weekly AEO scans on one domain per
-- user, sends a Monday digest + score-drop alerts, optionally
-- publishes a public score history page.
--
-- Spec: content/strategy/free-monitoring-tier.md
-- Open questions resolved 2026-05-10:
--   1. Branding: "Free" (plain word)
--   2. Domain: one domain forever, upgrade unlocks switching
--   3. Email cadence: weekly digest + score-drop alert
--      (5+ pt drop OR band crossing, 1 alert/week cap)
--   4. Public score history: opt-in page at /score/<domain>,
--      default off, hidden if score < 40, noindex until 4
--      weeks of history.

CREATE TABLE free_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  last_scan_at INTEGER,
  email_alerts INTEGER DEFAULT 1,
  public_history INTEGER DEFAULT 0,
  unsub_token TEXT NOT NULL UNIQUE,
  last_alert_at INTEGER,
  upgraded_to_user_id INTEGER REFERENCES users(id)
);

CREATE INDEX idx_free_users_domain ON free_users(domain);
CREATE INDEX idx_free_users_unsub ON free_users(unsub_token);
CREATE INDEX idx_free_users_public ON free_users(public_history)
  WHERE public_history = 1;

-- Treat each free user's domain as a lightweight client. Adding
-- free_user_id to `domains` rather than to `scan_results` means
-- scanDomain() and the existing weekly cron work unchanged --
-- they iterate `domains`, and free-tier rows just have a non-NULL
-- free_user_id and a synthetic client_slug of the form
-- 'free-<free_user.id>'. Scan history queries for a free user
-- become: SELECT * FROM scan_results JOIN domains
-- ON scan_results.domain_id = domains.id
-- WHERE domains.free_user_id = ?
ALTER TABLE domains ADD COLUMN free_user_id INTEGER
  REFERENCES free_users(id);
CREATE INDEX idx_domains_free_user ON domains(free_user_id)
  WHERE free_user_id IS NOT NULL;

-- Free-tier sessions. Separate from `sessions` because that table
-- has an FK to users(id) and free users live in their own table.
-- The `magic_links` table is shared (email + token only, no user
-- FK) -- routes/free-auth verifies the token then looks up the
-- email in free_users instead of users.
CREATE TABLE free_sessions (
  id TEXT PRIMARY KEY,
  free_user_id INTEGER NOT NULL REFERENCES free_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_free_sessions_user ON free_sessions(free_user_id);
CREATE INDEX idx_free_sessions_expires ON free_sessions(expires_at);
