-- Corrections to the instrument_events record, established 2026-10-01.
--
-- Notes are APPENDED, never substituted. This table is the record comparisons
-- are judged against, and a record that can be quietly rewritten is not one.
-- Each statement is guarded so a re-run changes nothing.

-- 1. The 2026-09-23 bridge run changed no measurement rows.
--
-- Filed on 09-27 as a global 'backfill', which made compare-periods withhold
-- every comparison for every client across 09-23. What it actually did, read
-- from the bridge source (neverranked-outreach dryrun/forensic/bridge-to-d1.mjs):
-- replaced readout snapshots, and set inactive every question not in its
-- hard-coded list. No paying client's runs were written: the only bulk
-- single-timestamp run blocks since 08-15 belong to an unpaid beta client.
-- The question loss is its own event (2 below), so reclassifying this one
-- loses nothing.
UPDATE instrument_events
   SET kind = 'snapshot_overwritten',
       detail = detail || ' [2026-10-01: reclassified from backfill. It replaced readout snapshots and changed no citation_runs rows. Its other effect, deactivating questions outside its list, is recorded separately as question_set_changed on this date.]'
 WHERE kind = 'backfill'
   AND scope = 'global'
   AND occurred_at = CAST(strftime('%s','2026-09-23') AS INTEGER)
   AND detail LIKE 'A laptop launchd job ran the forensic bridge%';

-- 2. The cause of the 12 lost questions, previously "never established".
--
-- The bridge emits UPDATE citation_keywords SET active=0 WHERE client_slug=?
-- AND keyword NOT IN (<its list>), and its list is the original hash-locked 18.
-- It ran 09-23. The 12 questions added on 09-02 are exactly the ones outside
-- that list. Inferred from the code and the coincident date; the run itself
-- left no log of the statements it executed.
UPDATE instrument_events
   SET detail = detail || ' [2026-10-01: cause identified with high confidence. The forensic bridge run on this date deactivates every question outside its hard-coded list of the original 18, and the 12 lost are exactly the 12 added on 09-02. Our maintenance script, not the client and not the sweep.]'
 WHERE kind = 'question_set_changed'
   AND scope = 'client'
   AND occurred_at = CAST(strftime('%s','2026-09-23') AS INTEGER)
   AND detail NOT LIKE '%cause identified%';

-- 3. Out-of-sweep runs written by the NVI monthly runner on 2026-10-01.
--
-- 103 runs for hawaii-theatre (16 questions, 7 surfaces) under one timestamp,
-- 06:02:30, inside the 06:00 invocation that then died. The same runner wrote
-- 63 on 09-01 06:07:47, already covered by the 09-01 backfill event. Extra
-- volume on questions the sweep measures anyway. The runner is paused
-- (NVI_MONTHLY_PAUSED) as of this date.
INSERT OR IGNORE INTO instrument_events
  (occurred_at, detected_at, kind, scope, engine, client_slug, detail, source, created_at)
VALUES
  (CAST(strftime('%s','2026-10-01 06:02:30') AS INTEGER), CAST(strftime('%s','2026-10-01') AS INTEGER),
   'backfill', 'client', NULL, 'hawaii-theatre',
   'The NVI monthly runner wrote 103 out-of-sweep runs (16 questions, 7 surfaces) under one timestamp inside the 06:00 invocation, which then died before logging. Extra volume on questions the sweep measures anyway, not market movement. Runner paused the same day.',
   'migration', unixepoch());
