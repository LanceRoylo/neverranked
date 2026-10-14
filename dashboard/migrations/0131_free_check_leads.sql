-- Free check (check.neverranked.com) leads, scans and funnel events.
--
-- Until now every capture lived only in the LEADS KV namespace with a TTL, so
-- the funnel history aged out after 90 days and the leads after a year. These
-- tables are the durable record. The scan Worker (tools/schema-check) writes
-- them through its own D1 binding to this database. The schema stays single
-- sourced here, the same way the outreach worker uses this database.
--
-- Additive only. Every statement is CREATE ... IF NOT EXISTS. Nothing reads or
-- writes these tables until the scan Worker code that uses them is deployed,
-- so applying this migration on its own changes no behaviour.
--
-- Numbered 0131, not 0130: 0130 is taken by an unmerged branch. The runner
-- (`wrangler d1 migrations apply`) applies unapplied files by name, so 0130
-- landing after this file is fine.

-- One row per scan run from the check page (people), so send-report can
-- load OUR copy of the result instead of trusting the browser.
CREATE TABLE IF NOT EXISTS free_check_scans (
  scan_id      TEXT PRIMARY KEY,          -- crypto.randomUUID(), returned to the page
  session_id   TEXT,
  url          TEXT NOT NULL,
  domain       TEXT NOT NULL,
  score        INTEGER,
  grade        TEXT,
  summary_json TEXT,                      -- red_flags, schema_coverage, title, meta, schema names, locality
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fc_scans_domain ON free_check_scans(domain, created_at);

-- One row per email capture. Never expires.
CREATE TABLE IF NOT EXISTS free_check_leads (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  email                TEXT NOT NULL,     -- lowercased
  scan_id              TEXT,
  url                  TEXT NOT NULL,
  domain               TEXT NOT NULL,
  business_name        TEXT,
  score                INTEGER,
  grade                TEXT,
  consent_version      TEXT NOT NULL,     -- e.g. 'gate-2026-10a', 'legacy-2026-05'
  consent_text         TEXT NOT NULL,     -- the exact words shown at capture
  followup_ok          INTEGER NOT NULL DEFAULT 0,
  email_verified_at    INTEGER,           -- set when they open the emailed results link
  source               TEXT NOT NULL,     -- 'check_page' | 'kv_backfill'
  session_id           TEXT,
  referrer             TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
  ip_hash              TEXT,
  user_agent           TEXT,
  country              TEXT,              -- request.cf.country
  is_internal          INTEGER NOT NULL DEFAULT 0,
  internal_reason      TEXT,
  report_email_status  TEXT,
  report_email_id      TEXT,
  ai_run_id            INTEGER,           -- live AI check, later
  outreach_prospect_id INTEGER,           -- outreach handoff, later
  followup_hold_reason TEXT,              -- outreach handoff: 'regulated' | 'non_us' | 'unverified' | ...
  unsubscribed_at      INTEGER,           -- outreach handoff
  created_at           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fc_leads_email   ON free_check_leads(email);
CREATE INDEX IF NOT EXISTS idx_fc_leads_created ON free_check_leads(created_at);
CREATE INDEX IF NOT EXISTS idx_fc_leads_prospect ON free_check_leads(outreach_prospect_id);

-- The funnel, classified at write time (the briefing and the admin page read this).
CREATE TABLE IF NOT EXISTS free_check_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,              -- 'scan' | 'gate_impression' | 'capture' | 'ai_check'
  session_id  TEXT,
  domain      TEXT,
  source      TEXT NOT NULL,              -- 'page' | 'montaic' | 'mcp' | 'audit-template' | 'outreach-scan' | 'script' | 'api'
  is_internal INTEGER NOT NULL DEFAULT 0,
  is_bot      INTEGER NOT NULL DEFAULT 0,
  ip_hash     TEXT,
  user_agent  TEXT,
  country     TEXT,
  referrer    TEXT,
  utm_source  TEXT, utm_campaign TEXT, utm_content TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fc_events_type_time ON free_check_events(type, created_at);
-- The briefing and admin page read the last 7 to 30 days by time, and find
-- the first page-tagged row ("counting from") by source and session.
CREATE INDEX IF NOT EXISTS idx_fc_events_time ON free_check_events(created_at);
CREATE INDEX IF NOT EXISTS idx_fc_events_source_session ON free_check_events(source, session_id, created_at);
