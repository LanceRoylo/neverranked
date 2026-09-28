-- Four confounds broke a comparison in one day. Three are visible in the data.
-- The fourth is not recorded anywhere.
--
-- On 2026-09-27, hawaii-theatre's Perplexity rate looked like it had fallen 17
-- points between August and September. It had not. We moved Perplexity onto the
-- Agent API on 2026-08-23: the rate ran 58-62% through 08-19 and 27-48% from
-- 08-24, a clean step at the migration and not at the month boundary. Comparing
-- a mostly-pre-migration August against an entirely-post-migration September is
-- not a like-for-like comparison, and that number was a day from reaching the
-- CEO of the account we are trying to convert.
--
-- A question-set change is discoverable from citation_keywords. A volume change
-- is discoverable from citation_runs. A mix shift is discoverable from both.
-- "We changed the adapter" is discoverable from nothing. It was found by eye,
-- from a daily series, by someone who happened to remember the date.
--
-- So instrument changes become rows. comparePeriods() reads them and refuses to
-- state a movement across one.
--
-- THE LOG WILL BE INCOMPLETE. The day you change an adapter is the day you are
-- thinking about the adapter and not about the log, so the row that matters most
-- is the one most likely to be missing. That is why the step-change detector
-- exists alongside this table rather than instead of it: the detector catches
-- what nobody remembered to write down, and writes it with source='detector'.

CREATE TABLE IF NOT EXISTS instrument_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  -- When the INSTRUMENT changed, which is the only date a comparison cares
  -- about. Not when we noticed.
  occurred_at  INTEGER NOT NULL,
  -- When we noticed. NULL when the event was logged deliberately at the time.
  -- A wide gap between the two is itself the finding.
  detected_at  INTEGER,
  -- engine_adapter_changed | engine_outage | question_set_changed
  -- | client_paused | backfill | cadence_changed
  kind         TEXT NOT NULL,
  -- global | engine | client
  scope        TEXT NOT NULL,
  engine       TEXT,
  client_slug  TEXT,
  detail       TEXT NOT NULL,
  -- migration | deploy | manual | detector
  source       TEXT NOT NULL,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Comparisons ask "does anything land between these two timestamps", so
-- occurred_at leads.
CREATE INDEX IF NOT EXISTS idx_instrument_events_occurred
  ON instrument_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_instrument_events_engine
  ON instrument_events(engine, occurred_at DESC);

-- Makes the backfill below re-runnable, and stops a detector that fires on
-- consecutive days from writing the same step twice. COALESCE because NULL is
-- never equal to NULL in a unique index, so scope='global' rows would otherwise
-- duplicate freely.
CREATE UNIQUE INDEX IF NOT EXISTS idx_instrument_events_dedupe
  ON instrument_events(occurred_at, kind, scope, COALESCE(engine, ''), COALESCE(client_slug, ''));

-- Backfill: only what was established from the rows on 2026-09-27, not what
-- anyone remembered. Each of these was first attributed wrongly.
INSERT OR IGNORE INTO instrument_events
  (occurred_at, detected_at, kind, scope, engine, client_slug, detail, source, created_at)
VALUES
  (CAST(strftime('%s','2026-08-23') AS INTEGER), CAST(strftime('%s','2026-09-27') AS INTEGER),
   'engine_adapter_changed', 'engine', 'perplexity', NULL,
   'Moved to the Perplexity Agent API. hawaii-theatre rate 58-62% before, 27-48% after. Found by eye 35 days later.',
   'migration', unixepoch()),

  (CAST(strftime('%s','2026-09-03') AS INTEGER), CAST(strftime('%s','2026-09-27') AS INTEGER),
   'engine_outage', 'engine', 'openai', NULL,
   'ChatGPT search failing: 111 failures on 09-03, continuing through 09-09. Runs that survived are a biased sample.',
   'migration', unixepoch()),

  (CAST(strftime('%s','2026-09-12') AS INTEGER), CAST(strftime('%s','2026-09-27') AS INTEGER),
   'engine_outage', 'engine', 'openai', NULL,
   'ChatGPT search wrote zero rows all day (67 failures).',
   'migration', unixepoch()),

  (CAST(strftime('%s','2026-09-01') AS INTEGER), CAST(strftime('%s','2026-09-27') AS INTEGER),
   'backfill', 'global', NULL, NULL,
   'Extra sweeps 09-01 to 09-03 inflated run volume. hawaii-theatre logged 467 runs on 09-02 against a ~133/day baseline, which later read as a loss in the following week.',
   'migration', unixepoch()),

  (CAST(strftime('%s','2026-09-09') AS INTEGER), CAST(strftime('%s','2026-09-14') AS INTEGER),
   'client_paused', 'client', NULL, 'and-scene',
   'Went dark: last run 09-09, five days before the deliberate pause and undetected at the time.',
   'migration', unixepoch()),

  (CAST(strftime('%s','2026-09-14') AS INTEGER), NULL,
   'client_paused', 'client', NULL, 'and-scene',
   'Deliberate: 49 keyword rows set inactive as a cost decision. Do not re-arm.',
   'migration', unixepoch()),

  (CAST(strftime('%s','2026-09-21') AS INTEGER), NULL,
   'question_set_changed', 'client', NULL, 'hawaii-theatre',
   'Reverted to the core 18 questions. August measured 34, September 29, only 22 shared.',
   'migration', unixepoch()),

  (CAST(strftime('%s','2026-09-23') AS INTEGER), CAST(strftime('%s','2026-09-24') AS INTEGER),
   'question_set_changed', 'client', NULL, 'prince-waikiki',
   'A paying client lost 12 of 30 measured questions. Cause never established: citation_keywords carried no deactivation audit trail at the time.',
   'migration', unixepoch()),

  (CAST(strftime('%s','2026-09-24') AS INTEGER), NULL,
   'question_set_changed', 'client', NULL, 'prince-waikiki',
   'The 12 questions restored by migration 0122. Any comparison spanning this date is not like-for-like.',
   'migration', unixepoch()),

  (CAST(strftime('%s','2026-09-23') AS INTEGER), CAST(strftime('%s','2026-09-23') AS INTEGER),
   'backfill', 'global', NULL, NULL,
   'A laptop launchd job ran the forensic bridge and overwrote the readout snapshot the Worker had written, for both live clients. Bridge now refuses without an explicit override.',
   'migration', unixepoch());
