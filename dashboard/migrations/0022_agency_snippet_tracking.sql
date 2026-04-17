-- Day 9 Part 1: snippet delivery email tracking.
-- Day 9 Part 2: snippet-not-detected nudge columns.
--
-- snippet_email_sent_at: set the moment we email the agency the snippet
--   tag for this client. Guards against double-send if handleAddDomain
--   is re-entered (manual retry, Stripe race, etc.).
--
-- snippet_last_checked_at / snippet_last_detected_at: stamped by the
--   daily nudge cron when it pulls the homepage and looks for our
--   injector script. last_detected_at is null until the first time we
--   see it live.
--
-- snippet_nudge_day7_at / snippet_nudge_day14_at: guards so each tier
--   of nudge email only fires once per domain. Day-30 goes to
--   admin_alerts (no column needed, the alert IS the record).

ALTER TABLE domains ADD COLUMN snippet_email_sent_at INTEGER;
ALTER TABLE domains ADD COLUMN snippet_last_checked_at INTEGER;
ALTER TABLE domains ADD COLUMN snippet_last_detected_at INTEGER;
ALTER TABLE domains ADD COLUMN snippet_nudge_day7_at INTEGER;
ALTER TABLE domains ADD COLUMN snippet_nudge_day14_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_domains_snippet_sweep
  ON domains(agency_id, snippet_last_detected_at, snippet_email_sent_at)
  WHERE agency_id IS NOT NULL AND active = 1 AND is_competitor = 0;
