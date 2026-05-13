-- Auto-expand prompt discovery: rejection log.
--
-- When the weekly cron generates candidate prompts and runs them
-- through tone / similarity / relevance / format gates, anything
-- that fails is logged here for system tuning and auditability.
-- This is NOT a customer-facing review queue. The system has
-- already decided; this table just records why.

CREATE TABLE IF NOT EXISTS prompt_rejections (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug  TEXT NOT NULL,
  prompt       TEXT NOT NULL,
  category     TEXT,
  failed_gate  TEXT NOT NULL,   -- 'tone' | 'similarity' | 'relevance' | 'format'
  reason       TEXT,
  candidate_batch_id TEXT,      -- groups rejections from one cron run
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_prompt_rejections_client ON prompt_rejections(client_slug, created_at DESC);
CREATE INDEX idx_prompt_rejections_gate ON prompt_rejections(failed_gate);
