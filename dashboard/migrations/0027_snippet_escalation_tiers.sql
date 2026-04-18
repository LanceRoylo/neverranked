-- Add two new escalation guards for the snippet install lifecycle
--
-- The current ladder is:
--   Day 7  -> first nudge        (snippet_nudge_day7_at)
--   Day 14 -> second nudge       (snippet_nudge_day14_at)
--   Day 30 -> admin alert (ops escalation, not the agency)
--
-- That leaves a gap between Day 14 ("please install") and Day 30
-- ("ops will help") where the messaging is silent. And nothing
-- handles the case where 90+ days pass and the agency just keeps
-- paying without ever installing -- the most adverse-selection
-- outcome (they leave angry instead of leaving thoughtful).
--
-- Two new tiers:
--   Day 21 -> reframe email: "here's what we've been doing AND
--             here's what installation would unlock"
--             (snippet_nudge_day21_at)
--   Day 90 -> pause check-in: "install / pause / cancel -- reply
--             with one word." Honest reset.
--             (snippet_pause_check_at)

ALTER TABLE domains ADD COLUMN snippet_nudge_day21_at INTEGER;
ALTER TABLE domains ADD COLUMN snippet_pause_check_at INTEGER;
