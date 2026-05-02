-- Prompt discovery: AI-generated prompt suggestions awaiting customer
-- review before they land in citation_keywords.
--
-- The pre-existing generateKeywordSuggestions() flow inserted directly
-- into citation_keywords, which (a) gave the customer no review step and
-- (b) was admin-only. This table lets us generate proposals, surface them
-- to the client, and only commit the ones they accept.
--
-- UNIQUE(client_slug, prompt) makes the generator idempotent -- repeated
-- runs over time will skip prompts the customer already saw (and either
-- accepted, dismissed, or left pending). The model can't spam the queue.

CREATE TABLE IF NOT EXISTS prompt_suggestions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug   TEXT NOT NULL,
  prompt        TEXT NOT NULL,
  category      TEXT,                       -- 'problem' | 'recommendation' | 'comparison' | 'scenario' | 'gsc'
  source        TEXT NOT NULL,              -- 'ai_generated' | 'gsc_top_query' | 'manual'
  status        TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted' | 'dismissed'
  reviewed_by   INTEGER,                    -- users.id who clicked Accept/Dismiss
  reviewed_at   INTEGER,
  created_at    INTEGER NOT NULL,
  UNIQUE(client_slug, prompt)
);

CREATE INDEX IF NOT EXISTS idx_prompt_suggestions_pending
  ON prompt_suggestions(client_slug, status, created_at DESC);
