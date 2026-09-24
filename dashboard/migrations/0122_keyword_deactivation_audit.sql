-- A paying customer lost 12 of 30 measured questions and nothing recorded it.
--
-- 2026-09-24 06:00:04 the drift detector reported prince-waikiki going from 30
-- questions to 18. Detection worked. Attribution did not exist: citation_keywords
-- carries created_at and nothing else, so "what set active = 0, and when" has no
-- answer. The change happened somewhere in the 24 hours between the 09-23 and
-- 09-24 sweeps and that is as precise as the schema allows.
--
-- The 12 were not drift. They were created 2026-09-02 05:09:45, all at one
-- second, matching no cron schedule -- a deliberate onboarding addition one day
-- after measurement_start. They are also the entire "where you are invisible"
-- section of the September memo: nine of them returned zero citations across
-- 1,255 runs, and they are what the punch list asks the customer to fix. We
-- stopped measuring the exact questions we asked them to work on.
ALTER TABLE citation_keywords ADD COLUMN deactivated_at INTEGER;
ALTER TABLE citation_keywords ADD COLUMN deactivated_reason TEXT;

-- Restore. Approved by Lance 2026-09-24.
UPDATE citation_keywords
   SET active = 1, deactivated_at = NULL, deactivated_reason = NULL
 WHERE client_slug = 'prince-waikiki' AND active = 0;

-- Record what we DO know about the sets already off, so a NULL from here on
-- means "nobody stamped it", not "nobody knows whether it was stamped".
UPDATE citation_keywords
   SET deactivated_reason = 'Paused 2026-09-14 by migration 0115, cost decision. Not drift.'
 WHERE client_slug = 'and-scene' AND active = 0 AND deactivated_reason IS NULL;

UPDATE citation_keywords
   SET deactivated_reason = 'Reverted to the core 18 on 2026-09-21; these were added by prompt-auto-expand after measurement_start.'
 WHERE client_slug = 'hawaii-theatre' AND active = 0 AND deactivated_reason IS NULL;
