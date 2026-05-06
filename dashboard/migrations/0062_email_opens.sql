-- Cold-email open tracking. Pixel-loads on cold-outreach emails hit a
-- public Worker route at /track/open/:prospect_id/:token, which verifies
-- the HMAC token and writes one row per load here. The local outreach
-- server then polls /api/admin/recent-opens periodically and rolls the
-- counts back into its own SQLite prospects table.
--
-- Why this design:
--   * Replaces the laptop+ngrok tunnel that was the only previous open-
--     tracking surface. ngrok free killed static subdomains in 2026, so
--     pixels embedded in already-sent emails were silently broken.
--   * Pixel hits Cloudflare's edge (faster than tunnel through laptop)
--     and survives a closed lid.
--   * One row per pixel-load (not per prospect) so we can show open
--     timestamps, multiple-open detection, and IP/UA forensics if a
--     send goes off the rails.
--   * Token verification happens in the Worker against a shared HMAC
--     secret (OUTREACH_UNSUBSCRIBE_SECRET) -- nothing in this table is
--     trusted on faith, all rows correspond to a verified token.
--
-- ip_hash and ua are best-effort signal and may be NULL for older clients
-- that don't send those headers in image-fetch requests.

CREATE TABLE IF NOT EXISTS email_opens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id INTEGER NOT NULL,
  token TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  ip_hash TEXT,
  ua TEXT,
  vertical TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_opens_prospect ON email_opens (prospect_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_opens_recent ON email_opens (opened_at DESC);
