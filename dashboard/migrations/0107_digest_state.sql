-- Digest send-state gets its own table.
--
-- WHY: last_digest_sent_at lived on injection_configs, which is the RETIRED
-- hosted snippet-injection table (snippet_token NOT NULL, cache_ttl, business
-- address/logo). Two ALTERs bolted digest columns onto it years later.
--
-- That broke the moment a measurement-only client appeared. Prince Waikiki has
-- no injection_configs row and correctly never will: hosted injection was
-- retired 2026-07-24 and "NeverRanked measures, it does not touch client sites"
-- is the positioning. But the pass-cadence digest gate read his send timestamp
-- from that table and the post-send bump was a plain UPDATE, which matched zero
-- rows in silence, so the "already sent" marker was never written and the gate
-- stayed permanently due. Prince would have received a digest every single day
-- from his first September pass. Same shape as the documented outreach trap:
-- "an UPDATE ... WHERE prospect_id = N silently matches zero rows."
--
-- The fix is not to fabricate an injection row for a client who must not have
-- one. It is to stop storing delivery state in a dead feature's table.
--
-- digest_cadence STAYS on injection_configs: it is a per-client setting the
-- inject-admin UI owns, and it is irrelevant to pass-cadence clients (the gate
-- never reads it for them). Only send-state moves.

CREATE TABLE IF NOT EXISTS digest_state (
  client_slug          TEXT PRIMARY KEY,
  last_digest_sent_at  INTEGER,
  updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Backfill every client that already has a send timestamp, so the first run
-- after this migration does not re-send to anyone who was already current.
INSERT INTO digest_state (client_slug, last_digest_sent_at, updated_at)
SELECT client_slug, last_digest_sent_at, unixepoch()
  FROM injection_configs
 WHERE last_digest_sent_at IS NOT NULL
ON CONFLICT (client_slug) DO UPDATE
  SET last_digest_sent_at = excluded.last_digest_sent_at,
      updated_at          = excluded.updated_at;

-- injection_configs.last_digest_sent_at is now FROZEN: nothing reads or writes
-- it after this migration (verified: only cron.ts touched it; inject-admin.ts
-- writes digest_cadence and the business_* fields, never this column).
-- It is deliberately left in place this cycle so a rollback is one revert with
-- no data loss. Dropping it is staged in the kickoff runbook follow-ups.
