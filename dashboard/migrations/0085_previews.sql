-- Personalized Preview pages.
--
-- One row per Preview built for a prospect or client. The page renders
-- at /preview/<slug> (public, no auth) and shows a personalized brief
-- with their data, NR's findings, and a clear next-step.
--
-- Same shape as the /pitch/<slug>/ pattern Lance has built manually
-- for Greg, Shawn, and MVNP, but generated via Sonnet from a template
-- so it scales to every hot warm-prospect without 30-60 min of
-- handcrafting per page.
--
-- slug is a unique-and-not-guessable identifier so recipients with
-- the URL can view but no one can enumerate. We use a short random
-- token concatenated with a readable hint when we have one (e.g.
-- 'asb-hawaii-x7k2' instead of just 'x7k2').
--
-- status:
--   draft       — generated, awaiting Lance's review
--   published   — Lance approved, URL safe to share
--   archived    — no longer active (recipient declined or relationship ended)

CREATE TABLE IF NOT EXISTS previews (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,
  prospect_id     INTEGER,                    -- if from warm-prospects flow
  client_slug     TEXT,                       -- if for an existing client
  recipient_name  TEXT,
  company_name    TEXT,
  domain          TEXT,
  body_html       TEXT NOT NULL,              -- the personalized middle of the page
  meta_title      TEXT,                       -- <title> tag content
  meta_description TEXT,                      -- meta description
  status          TEXT NOT NULL DEFAULT 'draft',
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  published_at    INTEGER,
  archived_at     INTEGER,
  viewed_count    INTEGER NOT NULL DEFAULT 0,
  first_viewed_at INTEGER,
  last_viewed_at  INTEGER
);

CREATE UNIQUE INDEX idx_previews_slug ON previews(slug);
CREATE INDEX idx_previews_prospect ON previews(prospect_id);
CREATE INDEX idx_previews_status ON previews(status, created_at DESC);
