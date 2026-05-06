-- Tracks views of /pitch/* pages. The marketing site embeds a 1x1 pixel
-- that fires GET /track/pitch/<slug> on this worker. We log one row per
-- request, classify obvious bot/preview UAs (LinkedInBot, Slackbot,
-- WhatsApp, Apple Mail privacy proxy, etc.) so the dashboard can default
-- to "real opens only", and store an SHA-256-truncated hash of the IP
-- so we can count distinct openers without keeping the raw IP.

CREATE TABLE IF NOT EXISTS pitch_opens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  opened_at INTEGER NOT NULL, -- unix epoch seconds
  ip_hash TEXT,               -- 16-hex-char truncated SHA-256 of IP + salt
  user_agent TEXT,
  is_bot INTEGER NOT NULL DEFAULT 0, -- 0 = real open, 1 = bot/preview/proxy
  referer TEXT,
  country TEXT
);

CREATE INDEX IF NOT EXISTS idx_pitch_opens_slug ON pitch_opens(slug);
CREATE INDEX IF NOT EXISTS idx_pitch_opens_at ON pitch_opens(opened_at);
CREATE INDEX IF NOT EXISTS idx_pitch_opens_slug_real ON pitch_opens(slug, is_bot);
