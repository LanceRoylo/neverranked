-- Audit credit tracking.
--
-- When a customer pays $750 for the one-time audit, they're promised
-- the fee is "fully credited toward your first month if you upgrade
-- to Pulse, Signal, or Amplify within 30 days." The actual credit
-- mechanism is Stripe Customer Balance: we create a -$750 transaction
-- on the customer record at audit-purchase time, and Stripe auto-
-- applies it to the first invoice when they subscribe.
--
-- These columns track the credit state on our side so we can:
--   1. Enforce the 30-day expiry (Stripe doesn't auto-expire)
--   2. Show "your credit expires in X days" to the customer
--   3. Detect mid-pipeline failures (credit created in Stripe but our
--      side missed the write) for the cron reconciler
--
-- audit_credit_amount    -- cents, the original credit amount (75000)
-- audit_credit_expires_at -- unix seconds, when the promise lapses
-- audit_credit_applied_at -- unix seconds when first invoice consumed it
--                         (NULL = still pending; set = customer used it)

ALTER TABLE users ADD COLUMN audit_credit_amount INTEGER;
ALTER TABLE users ADD COLUMN audit_credit_expires_at INTEGER;
ALTER TABLE users ADD COLUMN audit_credit_applied_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_users_audit_credit_pending
  ON users(audit_credit_expires_at)
  WHERE audit_credit_amount IS NOT NULL AND audit_credit_applied_at IS NULL;
