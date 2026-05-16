-- Outreach open-sync idempotency → D1 (Stage-C gap close)
--
-- The laptop's always-on server.js ran pollEmailOpens() on a 60s
-- loop, syncing email_opens -> outreach prospects' email_open_count
-- via an in-memory dedup set. That loop was not part of daily-run.js
-- and was missed in the cutover. The Worker reads email_opens
-- directly from the SAME neverranked-app D1 now, but markEmailOpened
-- INCREMENTS (not idempotent) and cron isolates can't hold an
-- in-memory dedup set. This table is the durable dedup (same proven
-- pattern as outreach_processed_replies, migration 0092).
-- open_key = "<prospect_id>:<opened_at>" (stable per open event).
CREATE TABLE IF NOT EXISTS outreach_processed_opens (
  open_key  TEXT PRIMARY KEY,
  seen_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
