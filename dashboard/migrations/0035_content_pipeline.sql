-- Phase A of the content pipeline: schema for the content calendar,
-- WordPress publishing connections, and per-client content preferences.
--
-- This migration is additive. It introduces two new tables and two
-- new columns on client_settings. Nothing existing is altered.

-- Planned/scheduled content items. A row is created when a topic lands
-- on the calendar (manually by the customer, auto-suggested from
-- signals, or seeded by onboarding). It transitions through statuses
-- as the pipeline progresses:
--   planned   -> topic locked, no draft yet
--   drafted   -> content_drafts row exists, awaiting approval
--   approved  -> customer said ship it; scheduled to publish
--   published -> posted to the customer's CMS (WordPress first)
--   skipped   -> customer opted out of this one
--   failed    -> draft generation or publish errored; needs attention
CREATE TABLE IF NOT EXISTS scheduled_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'article',           -- article | faq | service_page | landing
  topic_source TEXT NOT NULL DEFAULT 'manual',    -- manual | citation_gap | gsc | roadmap
  source_ref TEXT,                                -- keyword id, gsc query, roadmap id for traceability
  scheduled_date INTEGER NOT NULL,                -- unix seconds; the date this should publish
  status TEXT NOT NULL DEFAULT 'planned',         -- see list above
  draft_id INTEGER,                               -- FK to content_drafts once generated
  published_url TEXT,                             -- live URL once published
  published_at INTEGER,
  error TEXT,                                     -- most recent error message if status=failed
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (draft_id) REFERENCES content_drafts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_drafts_slug_date ON scheduled_drafts(client_slug, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_scheduled_drafts_status ON scheduled_drafts(status);

-- WordPress publishing credentials per client. Kept separate from
-- client_settings so the encrypted app password never leaks into
-- general SELECT * queries, and so we can add other CMS types later
-- (Webflow, Ghost, etc.) with parallel tables.
CREATE TABLE IF NOT EXISTS wp_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug TEXT NOT NULL UNIQUE,
  site_url TEXT NOT NULL,
  wp_username TEXT NOT NULL,
  wp_app_password TEXT NOT NULL,                  -- encrypted at rest
  seo_plugin TEXT,                                -- yoast | rank_math | aioseo | none (auto-detected)
  default_post_status TEXT NOT NULL DEFAULT 'future', -- future (scheduled) | publish (immediate) | draft
  default_category_id INTEGER,                    -- optional WP category id to file posts under
  last_tested_at INTEGER,
  last_test_status TEXT,                          -- ok | error: <message>
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Amplify content mix preferences: how many pieces per month, what
-- split between blog/landing, and what day of the month / week items
-- ship on. Defaults apply if unset (4/month, 3 blog + 1 landing).
ALTER TABLE client_settings ADD COLUMN amplify_monthly_quota INTEGER DEFAULT 4;
ALTER TABLE client_settings ADD COLUMN amplify_mix_json TEXT DEFAULT '{"article":3,"landing":1}';
