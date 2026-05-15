-- Outreach packages → D1 (migration Phase 1, Option A)
-- Mirrors neverranked-outreach/outreach.db packages table, including
-- the columns added later via ALTER (email_subject ... prompt_variant).
-- Inline FK to prospects dropped (D1 does not enforce); prospect_id
-- indexed for the dashboard join paths.
CREATE TABLE IF NOT EXISTS outreach_packages (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id             INTEGER NOT NULL,
  mls_sample              TEXT,
  marketing_hook          TEXT,
  instagram_caption       TEXT,
  connection_note         TEXT,
  connection_note_b       TEXT,
  followup_dm             TEXT,
  connection_note_edited  TEXT,
  generated_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  email_subject           TEXT,
  email_body_html         TEXT,
  original_copy           TEXT,
  original_score          INTEGER,
  rewrite_score           INTEGER,
  followup_2              TEXT,
  followup_3              TEXT,
  prompt_variant          TEXT
);
CREATE INDEX IF NOT EXISTS idx_outreach_packages_prospect ON outreach_packages(prospect_id);
CREATE INDEX IF NOT EXISTS idx_outreach_packages_generated ON outreach_packages(generated_at);
