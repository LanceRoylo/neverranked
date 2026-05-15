-- Outreach prospects FULL MIRROR -> D1 (migration Phase 2, Option A)
--
-- DECISION (Lance, 2026-05-15): Option A now, Option B at cutover.
-- This is the full 22-column operational mirror of
-- neverranked-outreach/outreach.db `prospects`. It is SEPARATE from
-- the narrow `outreach_prospects` (the Preview-sync target), which
-- stays untouched so the live Preview/warm flow and
-- /api/admin/sync-prospects keep working during migration.
--
-- At the Phase 5/6 cutover, when the Worker becomes the operational
-- writer and the laptop tool + sync endpoint are decommissioned,
-- this table and the narrow one CONSOLIDATE into a single
-- `outreach_prospects` (Option B end state). Until then this mirror
-- is a passive snapshot; the laptop's SQLite remains source of truth.
--
-- linkedin_url UNIQUE dropped (faithful-mirror exception): a passive
-- bulk copy must not abort on any edge-case dup; non-unique index
-- instead. Same pragmatic pattern as the FK drops in 0087/0088.
CREATE TABLE IF NOT EXISTS outreach_prospects_master (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  linkedin_url      TEXT,
  listing_url       TEXT,
  broker_name       TEXT,
  brokerage_name    TEXT NOT NULL,
  franchise_brand   TEXT,
  market            TEXT NOT NULL,
  source            TEXT DEFAULT 'csv',
  status            TEXT DEFAULT 'pending',
  rejection_reason  TEXT,
  notes             TEXT,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  accepted_at       DATETIME,
  email             TEXT,
  phone             TEXT,
  unsubscribed      INTEGER DEFAULT 0,
  email_bounced     INTEGER DEFAULT 0,
  email_opened_at   DATETIME,
  email_open_count  INTEGER DEFAULT 0,
  vertical          TEXT DEFAULT 'real_estate',
  gmail_message_id  TEXT
);
CREATE INDEX IF NOT EXISTS idx_oprosp_master_status ON outreach_prospects_master(status);
CREATE INDEX IF NOT EXISTS idx_oprosp_master_market ON outreach_prospects_master(market);
CREATE INDEX IF NOT EXISTS idx_oprosp_master_vertical ON outreach_prospects_master(vertical);
CREATE INDEX IF NOT EXISTS idx_oprosp_master_email ON outreach_prospects_master(email);
CREATE INDEX IF NOT EXISTS idx_oprosp_master_linkedin ON outreach_prospects_master(linkedin_url);
