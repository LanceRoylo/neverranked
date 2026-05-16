-- Outreach processed-reply idempotency → D1 (Phase 2, Option A)
--
-- Replaces the laptop's data/processed-replies.json. The host is
-- stateless + ephemeral, so the "have we already handled this Gmail
-- message?" set must live durably in D1 (closes host/README.md
-- open decision #2). The Worker reads this set, passes it to the
-- host's /check-replies, and upserts the grown set returned by the
-- host. message_id is Gmail's immutable per-message id.
CREATE TABLE IF NOT EXISTS outreach_processed_replies (
  message_id  TEXT PRIMARY KEY,
  seen_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
