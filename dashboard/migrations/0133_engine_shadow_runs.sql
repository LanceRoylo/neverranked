-- 0133: a separate home for the December 2026 shadow measurement.
--
-- WHY. Every AI engine is sent a standing instruction to name businesses with
-- each question (disclosed on /methodology/ 2026-11-09). The plan is to move to
-- the plain question on 2027-01-01. Before switching, December runs the plain
-- question beside production on the same keywords and nights, so the size of
-- the instruction's effect is measured instead of guessed, and so the switch
-- has an overlap period. Pre-registration: content/preregistrations/2026-12-plain-question.md.
--
-- ISOLATION IS THE POINT OF THIS TABLE. Shadow readings must never reach a
-- client readout, memo, digest, watchdog, coverage check or spend total. So
-- they get their own table and nothing outside lib/shadow-* reads or writes
-- it. test/shadow-isolation.test.ts enforces both directions.
--
-- Additive only. Nothing writes here unless SHADOW_RUNS_ENABLED is "1" and the
-- UTC date is a December 2026 shadow night, so applying this migration on its
-- own changes no behaviour.
--
-- Numbered 0133: 0132 is claimed by an unmerged branch (AI Overviews deferred
-- retry). The runner applies unapplied files by name, so order of merge is fine.
CREATE TABLE IF NOT EXISTS engine_shadow_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  night           TEXT    NOT NULL,          -- UTC date of the sweep it shadows, YYYY-MM-DD
  client_slug     TEXT    NOT NULL,
  keyword_id      INTEGER NOT NULL,
  arm             TEXT    NOT NULL,          -- e.g. claude_plain_haiku45
  engine          TEXT    NOT NULL,          -- production engine name it compares with
  model           TEXT    NOT NULL,
  instruction     TEXT    NOT NULL DEFAULT '', -- text sent besides the question; '' for plain
  response_text   TEXT    NOT NULL DEFAULT '',
  cited_urls      TEXT    NOT NULL DEFAULT '[]',
  entities_json   TEXT    NOT NULL DEFAULT '[]',
  extractor_model TEXT,                      -- set when entities came from the extraction call
  client_named    INTEGER,                   -- deterministic text match; NULL when no answer
  entity_count    INTEGER NOT NULL DEFAULT 0,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cost_usd        REAL    NOT NULL DEFAULT 0, -- estimated, see lib/shadow-arms.ts rates
  failure         TEXT,                      -- set ONLY when the call did not complete
  run_at          INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shadow_night_kw_arm ON engine_shadow_runs(night, keyword_id, arm);
CREATE INDEX IF NOT EXISTS idx_shadow_night ON engine_shadow_runs(night);
