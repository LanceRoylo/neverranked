-- Trial client path for agencies: allow ONE client without a Stripe sub
-- so agencies can evaluate the product before billing.
--
-- domains.trial       = 1 while the domain is on the pre-billing trial
-- agencies.trial_used = 1 once an agency has spent their one trial
--                       (prevents the delete-and-retry loop)
--
-- Both clear automatically when checkout.session.completed fires for
-- that agency (webhook) or on any /agency load that observes the
-- inconsistent state (lazy reconcile).

ALTER TABLE domains ADD COLUMN trial INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agencies ADD COLUMN trial_used INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_domains_trial ON domains(trial) WHERE trial = 1;
