-- Stripe webhook event idempotency tracking.
--
-- Stripe retries failed webhooks (any non-2xx response, network
-- timeout, or worker crash). Without idempotency, retries would
-- duplicate every side effect: a second $750 audit credit on the
-- customer's Stripe balance, a second snippet email, a second audit
-- generation. This table records every event ID we've successfully
-- handled so retries become no-ops.
--
-- The handler check pattern:
--   1. Receive event, parse event.id
--   2. INSERT INTO stripe_webhook_events (id) ON CONFLICT DO NOTHING
--   3. If insert affected 0 rows -> already processed, return 200 immediately
--   4. Otherwise process normally
--
-- 90-day TTL via the cleanup cron is enough -- Stripe doesn't retry
-- past 3 days, so 90 days gives a comfortable safety margin while
-- keeping the table bounded.

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'processing'  -- 'processing' | 'completed' | 'failed'
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_received
  ON stripe_webhook_events(received_at DESC);
