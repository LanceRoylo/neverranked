-- 0119: record what each measurement call costs.
--
-- WHY. On 2026-09-12 the OpenAI balance hit zero and every OpenAI measurement
-- stopped. It was noticed because the instrument went dark, not because
-- anything warned the balance was falling. Asked on 2026-09-15 what the
-- measurement costs, the only honest answer was an estimate built from call
-- counts and stored response lengths.
--
-- basis is a COLUMN, not a comment. 'reported' rows carry what a provider said
-- the call cost and are true. 'estimated' rows are derived from a rate table
-- that has never been checked against an invoice. A total that blends the two
-- without saying so is the defect this codebase keeps finding in its own
-- reports, and it is not going to be introduced deliberately here.
CREATE TABLE IF NOT EXISTS engine_spend (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  engine        TEXT    NOT NULL,
  run_at        INTEGER NOT NULL,
  keyword_id    INTEGER,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd      REAL    NOT NULL DEFAULT 0,
  basis         TEXT    NOT NULL DEFAULT 'estimated'
);

CREATE INDEX IF NOT EXISTS idx_engine_spend_run_at ON engine_spend (run_at);
CREATE INDEX IF NOT EXISTS idx_engine_spend_engine ON engine_spend (engine, run_at);
