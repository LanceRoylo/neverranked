-- citation_snapshots: dedup + enforce one row per (client_slug, week_start).
--
-- BUG (found 2026-05-29 during Atlas build): the weekly snapshot
-- generator in citations.ts used a plain INSERT keyed on the Monday of
-- the current week. Any time the generator ran more than once in a week
-- (manual trigger, cron retry, overlapping run) it appended a DUPLICATE
-- row for the same week_start instead of updating. HTC had two rows for
-- 2026-05-04 inserted 31 seconds apart, which made Atlas's trend view
-- show the same week twice with different numbers.
--
-- FIX: (1) collapse existing duplicates, keeping the most recently
-- created row per (client_slug, week_start); (2) add a UNIQUE index so
-- the generator's new UPSERT (ON CONFLICT DO UPDATE) can re-run safely.

-- 1. Delete older duplicates. For each (client_slug, week_start) keep the
--    row with the largest id (= most recent insert); drop the rest.
DELETE FROM citation_snapshots
 WHERE id NOT IN (
   SELECT MAX(id)
     FROM citation_snapshots
    GROUP BY client_slug, week_start
 );

-- 2. Enforce uniqueness going forward. The generator's UPSERT targets
--    this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS idx_citation_snapshots_unique
  ON citation_snapshots(client_slug, week_start);
