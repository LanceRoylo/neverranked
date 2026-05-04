-- NVI (Neverranked Visibility Index) — subscription + report storage.
--
-- NVI is the productized monthly PDF report that tracks how often a
-- client appears in AI engine responses. Two tiers:
--   Lite: Signal add-on, 10 prompts, no competitor tracking
--   Full: bundled in Amplify, 25 prompts, 3 competitors, sentiment,
--         source attribution, priority fix list
--
-- Subscriptions point at the existing citation_keywords for the client
-- (we re-use, no duplicate prompt store). Reports are one row per
-- client per month, with status that gates customer delivery
-- (pending -> approved by admin -> sent).
--
-- See NVI-SPEC.md for the full architecture rationale.

CREATE TABLE IF NOT EXISTS nvi_subscriptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug     TEXT NOT NULL UNIQUE,
  tier            TEXT NOT NULL,             -- 'lite' | 'full'
  active          INTEGER NOT NULL DEFAULT 1,
  delivery_email  TEXT NOT NULL,             -- where the PDF goes
  delivery_day    INTEGER NOT NULL DEFAULT 1, -- day of month (1-28)
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  paused_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_nvi_subs_active_day
  ON nvi_subscriptions(active, delivery_day) WHERE active = 1;

CREATE TABLE IF NOT EXISTS nvi_reports (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug        TEXT NOT NULL,
  reporting_period   TEXT NOT NULL,            -- 'YYYY-MM'
  tier               TEXT NOT NULL,
  ai_presence_score  INTEGER NOT NULL,         -- 0-100
  prev_score         INTEGER,                  -- last month, for delta
  prompts_evaluated  INTEGER NOT NULL,
  citations_found    INTEGER NOT NULL,
  insight            TEXT NOT NULL,            -- AI-drafted, human-approved
  action             TEXT NOT NULL,            -- AI-drafted, human-approved
  pdf_r2_key         TEXT,                     -- R2 object key
  pdf_url            TEXT,                     -- signed URL (24h)
  status             TEXT NOT NULL DEFAULT 'pending', -- pending|approved|sent|failed
  generated_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  approved_at        INTEGER,
  sent_at            INTEGER,
  approver_user_id   INTEGER,
  UNIQUE(client_slug, reporting_period)
);

CREATE INDEX IF NOT EXISTS idx_nvi_reports_status
  ON nvi_reports(status, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_nvi_reports_client
  ON nvi_reports(client_slug, reporting_period DESC);

CREATE TABLE IF NOT EXISTS nvi_competitors (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug     TEXT NOT NULL,
  competitor_name TEXT NOT NULL,
  competitor_url  TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(client_slug, competitor_name)
);

CREATE INDEX IF NOT EXISTS idx_nvi_competitors_client
  ON nvi_competitors(client_slug, active);
