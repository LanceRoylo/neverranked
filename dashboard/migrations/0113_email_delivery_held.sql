-- 0113: separate a grader HOLD from a delivery FAILURE.
--
-- email_delivery_log has recorded both under status 'failed' since the
-- grader shipped. They are different events. A hold means the quality gate
-- refused to send a thin digest, which is the gate working. A failure means
-- the send itself broke: the grader crashed, or Resend rejected it.
--
-- Collapsing them is why the digest_dispatch cron line read
-- "last12d delivered=4 failed=21" every morning while nothing was actually
-- broken downstream, and why a real delivery outage would have been
-- indistinguishable from the gate doing its job.
--
-- Reversible: error_message is untouched and still carries the evidence, so
-- `UPDATE email_delivery_log SET status='failed' WHERE status='held'`
-- restores the previous state exactly.
UPDATE email_delivery_log
   SET status = 'held'
 WHERE status = 'failed'
   AND error_message LIKE 'held by grader%';
