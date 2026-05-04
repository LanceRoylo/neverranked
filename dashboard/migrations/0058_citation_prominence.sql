-- Phase 6 / NVI v2: prominence tracking on citation_runs.
--
-- When the client IS cited, where in the answer were they?
-- 1 = first / hero mention, 10 = last / footnote-tier.
-- NULL = not cited (so existing queries that filter on
-- client_cited = 1 don't need to change to read this column).
--
-- This unlocks the "where you ranked within citations" view
-- promised by the v2 NVI report and gives us the data feed for
-- prominence-weighted AI Presence Score (currently stubbed at
-- citation_rate + engine_spread + sentiment in score.ts; v2
-- rebalances to include prominence).
--
-- Numeric scale chosen so the value is independent of how many
-- entities a given engine returned (we cap at 10; rank 11+ is
-- treated as 10 = least prominent but still cited).

ALTER TABLE citation_runs ADD COLUMN prominence INTEGER;

CREATE INDEX idx_citation_runs_prominence
  ON citation_runs (prominence)
  WHERE prominence IS NOT NULL;
