-- Phase 4A: Trust profile + author bio tracking
--
-- The scanner now detects outbound links to trust platforms
-- (G2, Trustpilot, Capterra, Yelp, BBB, Google Business, Glassdoor,
-- Clutch) and named-author signals on each page. We persist the
-- per-client trust matrix so the /trust/<slug> dashboard view can
-- render presence/missing without re-scanning.

CREATE TABLE IF NOT EXISTS trust_profiles (
  client_slug TEXT NOT NULL,
  platform    TEXT NOT NULL,            -- g2, trustpilot, capterra, yelp, bbb, google_business, glassdoor, clutch
  url         TEXT NOT NULL,            -- full outbound link as detected
  detected_at INTEGER NOT NULL,         -- unix seconds, first time we saw this profile
  last_seen_at INTEGER NOT NULL,        -- unix seconds, latest scan that confirmed it
  source_url  TEXT,                     -- the page on the client site that linked to it
  PRIMARY KEY (client_slug, platform, url)
);

CREATE INDEX IF NOT EXISTS idx_trust_profiles_client ON trust_profiles(client_slug);
CREATE INDEX IF NOT EXISTS idx_trust_profiles_platform ON trust_profiles(platform);

-- Author bio coverage rolls up at the page level. We keep a tiny
-- aggregate per client so the dashboard can show "X of Y scanned
-- pages have a named author" without scanning every signals_json
-- blob on render.
CREATE TABLE IF NOT EXISTS author_coverage (
  client_slug      TEXT PRIMARY KEY,
  pages_scanned    INTEGER NOT NULL DEFAULT 0,
  pages_with_author INTEGER NOT NULL DEFAULT 0,
  last_scan_at     INTEGER NOT NULL,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
