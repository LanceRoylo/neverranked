-- Bot Analytics: log AI + search bot fetches of the schema injection
-- script per client.
--
-- The injector script lives at /inject/<client_slug>.js and is loaded
-- on every page of the customer's site. We can't see the customer's
-- own server logs, but every fetch of this script goes through us, so
-- we log the user-agent + path on each hit.
--
-- Coverage caveat (documented in the dashboard UI): training crawlers
-- that scrape HTML directly without executing JS will not appear here.
-- The data is most accurate for citation-time crawlers (ChatGPT-User,
-- Perplexity, Claude-Web, etc.) that fetch external resources during
-- live answers.

CREATE TABLE bot_hits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug   TEXT NOT NULL,
  -- Canonical bot bucket. One of: openai_train (GPTBot),
  -- openai_browse (ChatGPT-User), anthropic_train (ClaudeBot),
  -- anthropic_browse (Claude-Web), perplexity (PerplexityBot),
  -- google_extended (Google-Extended), google (Googlebot),
  -- bing (Bingbot), apple (Applebot-Extended), meta (Meta-ExternalAgent),
  -- bytedance (Bytespider), commoncrawl (CCBot), other_ai, other.
  bot_pattern   TEXT NOT NULL,
  user_agent    TEXT,           -- truncated to 240 chars
  ip_hash       TEXT,           -- SHA-256 hex prefix, like analytics table
  referer_path  TEXT,           -- first 200 chars of the page URL the bot came from
  hit_at        INTEGER NOT NULL
);

CREATE INDEX idx_bot_hits_slug_time ON bot_hits(client_slug, hit_at DESC);
CREATE INDEX idx_bot_hits_pattern ON bot_hits(bot_pattern, client_slug);
CREATE INDEX idx_bot_hits_recent ON bot_hits(hit_at DESC);
