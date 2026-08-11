-- Audit 2026-08-10: take the fake client off the digest list.
--
-- users.email_digest DEFAULTS TO 1, so every account ever created is a
-- digest recipient until someone says otherwise. The Monday dispatch
-- enumerates `WHERE email_digest = 1` and builds a real digest per user.
--
-- testclient@example.com (user 3) is mapped to client_slug 'montaic'. It
-- therefore builds a REAL Montaic digest every week and mails it at an
-- address that cannot exist -- 9 recorded failures in 60 days. Those
-- failures land in the same email_delivery_log rows that the Monday
-- reconcile and the email_log/digest heartbeat read, so a fake account
-- has been contributing to the "digest is broken" signal the whole time.
--
-- This is the last thing to fix before EMAIL_GLOBAL_PAUSE comes off: the
-- moment the pause lifts, whoever is on this list gets mail.
--
-- NOT INCLUDED, ON PURPOSE:
--   user 12  betweenchicago@gmail.com  slug=hawaii-theatre
-- A real gmail address attached to a real client. Lance identifies who
-- this is before we either keep them (they receive HTC's weekly numbers)
-- or switch them off. Guessing either way is wrong: silently unsubbing a
-- real stakeholder is as bad as mailing client data to a stranger.
--
--   users 39, 40  ron / gregory @hawaiitheatre.com
-- The intended HTC recipients. They stay.
--
--   users 1, 2, 4, 7  Lance's own admin and test accounts
-- No client_slug, so the digest builder finds nothing and returns early
-- without sending. Harmless, and useful for smoke tests.

SELECT 'before: ' || COUNT(*) AS digest_recipients_before
  FROM users
 WHERE email_digest = 1;

UPDATE users
   SET email_digest = 0
 WHERE email = 'testclient@example.com';

SELECT 'after: ' || COUNT(*) AS digest_recipients_after
  FROM users
 WHERE email_digest = 1;

-- Who remains on the list, so the change is verified by reading rather
-- than by trusting the count.
SELECT id || ' | ' || email || ' | slug=' || COALESCE(client_slug, 'NONE') || ' | role=' || role
    AS remaining_digest_recipients
  FROM users
 WHERE email_digest = 1
 ORDER BY id;
