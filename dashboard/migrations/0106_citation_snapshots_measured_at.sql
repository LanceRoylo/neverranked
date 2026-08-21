-- When the data in a snapshot was actually MEASURED, as distinct from when
-- the snapshot row was written.
--
-- WHY. Every writer sets week_start to the Monday of the week it RUNS:
--   citations.ts:1010 and :1486   mondayDate = new Date()  -> weekStart
--   dryrun/forensic/bridge-to-d1.mjs:188  same construction
-- week_start has therefore never been a measurement date. It only looks like
-- one for and-scene and neverranked, whose weekly writer happens to run on
-- the same day it measures.
--
-- The gap becomes visible on a forensic client. prince-waikiki's snapshot
-- was written 2026-08-19 from a measurement run on 2026-06-26, and stamped
-- week_start = 2026-08-17. Nothing in the row records June.
--
-- The consequence sits in buildReportFacts. Its only date guard refuses a
-- snapshot NEWER than the report month; a stale one passes silently. Prince
-- starts 2026-09-01, so a September readout would have published June
-- numbers under a September heading, on the one engagement whose product is
-- independent verification of another vendor's work.
--
-- BACKFILL RULE: the newest measurement that existed when the snapshot was
-- written -- MAX(run_at) at or before created_at. Verified against every
-- row before writing this: and-scene and neverranked land exactly on their
-- week_start (the honest case), hawaii-theatre on 2026-07-31 (written
-- 08-01), and prince-waikiki on 2026-06-26 (the two-month gap week_start
-- was hiding).
--
-- The two _canary_* rows have no citation_runs and stay NULL on purpose.
-- They are read only by the hub shape detector (routes/hub.ts:390), which
-- selects engines_breakdown and top_competitors and never reaches
-- buildReportFacts. NULL means "measurement date unknown" and the guard
-- fails closed on it, which is the correct reading for a row that cannot
-- prove when it was measured.

ALTER TABLE citation_snapshots ADD COLUMN measured_at INTEGER;

UPDATE citation_snapshots
   SET measured_at = (
     SELECT MAX(r.run_at)
       FROM citation_runs r
       JOIN citation_keywords k ON k.id = r.keyword_id
      WHERE k.client_slug = citation_snapshots.client_slug
        AND r.run_at <= citation_snapshots.created_at
   )
 WHERE measured_at IS NULL;
