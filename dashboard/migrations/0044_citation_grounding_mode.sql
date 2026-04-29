-- Citation grounding mode.
--
-- Until 2026-04-29, our queryOpenAI / queryGemini / queryAnthropic
-- functions called LLM endpoints WITHOUT web grounding. The model
-- answered from training data, which is not what AI engines actually
-- do when answering a real user query. Only Perplexity (sonar model)
-- was doing real web grounding.
--
-- Phase 2A switches OpenAI + Gemini to web-grounded calls. Anthropic
-- stays training-only for now (web search tool is a bigger refactor).
--
-- This column lets us distinguish historical training-data citation
-- runs from new web-grounded ones, so future analyses can compare
-- apples-to-apples and so the citation_lift module can warn when
-- baseline + current windows used different grounding modes.

ALTER TABLE citation_runs ADD COLUMN grounding_mode TEXT;

-- Backfill: every row that exists right now was training-data-only.
-- After this migration, new rows get 'web' (or 'training' for
-- engines that still don't ground).
UPDATE citation_runs SET grounding_mode = 'training' WHERE grounding_mode IS NULL;

CREATE INDEX idx_citation_runs_grounding ON citation_runs(grounding_mode);
