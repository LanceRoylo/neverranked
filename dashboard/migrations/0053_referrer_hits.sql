-- AI referrer traffic tracking.
--
-- The schema injection snippet runs in the customer's browser. We
-- already log every snippet fetch to bot_hits (server-side, captures
-- AI bots). For human visitors we need their UPSTREAM referrer
-- (document.referrer) -- the page they came from BEFORE landing on
-- the customer's site. That's what tells us "this visitor came from
-- chat.openai.com, so the AI citation drove a real session."
--
-- Browser-side: snippet checks document.referrer, classifies the host
-- against a known AI-engine list, and POSTs to /track/referral/:token
-- only when it matches. Non-AI referrers (google.com, direct, social)
-- aren't logged -- that's analytics' job, not ours.
--
-- Snippet token is the same one used in injection_configs.snippet_token
-- so we can authenticate without exposing the slug in client code.

CREATE TABLE IF NOT EXISTS referrer_hits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug   TEXT NOT NULL,
  -- Canonical engine bucket. One of: openai (chat.openai.com,
  -- chatgpt.com), perplexity (perplexity.ai), gemini
  -- (gemini.google.com, bard.google.com), claude (claude.ai),
  -- copilot (copilot.microsoft.com), deepseek (chat.deepseek.com),
  -- meta_ai (meta.ai), other_ai
  engine        TEXT NOT NULL,
  referrer_host TEXT NOT NULL,           -- the actual hostname captured
  landing_path  TEXT,                    -- the customer page the visitor landed on (first 200 chars)
  ip_hash       TEXT,                    -- SHA-256 hex prefix, like bot_hits
  hit_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_referrer_hits_slug_time
  ON referrer_hits(client_slug, hit_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrer_hits_engine
  ON referrer_hits(client_slug, engine, hit_at DESC);
