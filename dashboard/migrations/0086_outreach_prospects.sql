-- Prospect metadata cache.
--
-- The local outreach tool POSTs every prospect's name, email, company,
-- and domain to /api/admin/sync-prospects so D1 has enough context
-- to auto-generate personalized Previews without Lance typing in
-- the dashboard.
--
-- prospect_id is the same identifier used in email_opens and
-- outreach_followup_actions. It's the local tool's primary key.
-- Email is also indexed so we can look up by either.
--
-- last_synced_at tracks when the row was last refreshed. The local
-- tool can re-push the whole list periodically; UPSERT keeps things
-- in sync without piling up duplicate rows.

CREATE TABLE IF NOT EXISTS outreach_prospects (
  prospect_id     INTEGER PRIMARY KEY,
  email           TEXT,
  name            TEXT,
  company_name    TEXT,
  domain          TEXT,
  vertical        TEXT,
  city            TEXT,
  notes           TEXT,
  last_synced_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_outreach_prospects_email ON outreach_prospects(email);
CREATE INDEX idx_outreach_prospects_domain ON outreach_prospects(domain);
