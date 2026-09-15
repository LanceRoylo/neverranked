-- 0120: replicate readings, kept OUT of the product metric on purpose.
--
-- RUNS_PER_KEYWORD = 1. The measurement has never taken a replicate, so nothing
-- has separated "the engine answered differently today" from "the world
-- changed". Three readings of one question taken back to back should agree, and
-- every disagreement is the instrument, because nothing in the world changed in
-- ninety seconds.
--
-- WHY NOT A FLAG ON citation_runs. Three readings of one question would triple
-- that question's weight in every share figure a client is shown. Measuring the
-- instrument by corrupting the product metric would be an unusually direct way
-- to lose the argument. Nothing that renders to a customer reads this table.
CREATE TABLE IF NOT EXISTS replicate_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id    TEXT    NOT NULL,   -- one sweep; groups the readings taken together
  keyword_id  INTEGER NOT NULL,
  engine      TEXT    NOT NULL,
  rep_index   INTEGER NOT NULL,   -- 0..REPLICATES-1, within this batch
  run_at      INTEGER NOT NULL,
  client_cited INTEGER NOT NULL DEFAULT 0,
  cited_urls  TEXT,
  UNIQUE (batch_id, keyword_id, engine, rep_index)
);

CREATE INDEX IF NOT EXISTS idx_replicate_runs_batch ON replicate_runs (batch_id);
CREATE INDEX IF NOT EXISTS idx_replicate_runs_at ON replicate_runs (run_at);
