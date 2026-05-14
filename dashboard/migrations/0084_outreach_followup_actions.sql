-- Outreach follow-up actions.
--
-- One row per follow-up action taken against an outreach prospect.
-- A 'drafted' row means we generated a follow-up email; the operator
-- can then 'send' (manually copy into the local outreach tool, then
-- mark sent here) or 'decline' (skip this prospect's tier for now).
--
-- Drives:
--   - Warm-prospects list at /admin/warm-prospects so we don't
--     suggest the same template twice for the same prospect
--   - Time-based dedup: once a follow-up is sent at a tier, we wait
--     before suggesting another at the same tier
--
-- prospect_id is the same identifier used in email_opens. The
-- prospect's name and email live in the local outreach tool's
-- SQLite, not in D1 -- the dashboard surface tracks WHAT was sent,
-- the local tool tracks TO WHOM.

CREATE TABLE IF NOT EXISTS outreach_followup_actions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id     INTEGER NOT NULL,
  template_kind   TEXT NOT NULL,           -- warm | very_warm | hot | fading
  signal_tier_at_draft TEXT,               -- snapshot of tier at draft time
  open_count_at_draft  INTEGER,
  subject         TEXT,
  body            TEXT,                    -- generated draft
  status          TEXT NOT NULL DEFAULT 'drafted',
                                           -- drafted | sent | declined
  declined_reason TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  sent_at         INTEGER,
  declined_at     INTEGER,
  reviewer_user_id INTEGER
);

CREATE INDEX idx_outreach_followup_actions_prospect
  ON outreach_followup_actions(prospect_id, created_at DESC);
CREATE INDEX idx_outreach_followup_actions_template
  ON outreach_followup_actions(template_kind, status, created_at DESC);
CREATE INDEX idx_outreach_followup_actions_status
  ON outreach_followup_actions(status, created_at DESC);
