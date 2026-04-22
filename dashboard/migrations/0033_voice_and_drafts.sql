-- Voice calibration + content drafts (Phase 1 of the in-dashboard drafting
-- pipeline). Port of Montaic's voice calibration pattern adapted for
-- pillar articles, FAQs, and schema-ready content pages.
--
-- Data model:
--   voice_samples          -- raw writing the client has published, used as
--                             training data for the voice fingerprint
--   voice_fingerprints     -- computed style profile per client (JSON)
--   content_drafts         -- each drafted piece (article, FAQ, etc.)
--   content_draft_versions -- edit history for undo/diff
--
-- Each draft has a voice_score 0-100 (same scale as the AEO score so the
-- UI reads consistently). 90+ is indistinguishable from the client's own
-- writing. Below 70 triggers a rewrite pass before the client sees it.

CREATE TABLE IF NOT EXISTS voice_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug TEXT NOT NULL,
  title TEXT,                     -- optional label ("Blog post on X", "About page")
  source_url TEXT,                -- optional URL the sample was taken from
  body TEXT NOT NULL,             -- the actual writing
  word_count INTEGER NOT NULL DEFAULT 0,
  uploaded_by_user_id INTEGER,    -- NULL if uploaded via admin
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voice_samples_slug ON voice_samples(client_slug);

-- One fingerprint per client. Recomputed whenever samples change. Stored as
-- JSON so the shape can evolve without a migration for every field change.
CREATE TABLE IF NOT EXISTS voice_fingerprints (
  client_slug TEXT PRIMARY KEY,
  fingerprint_json TEXT NOT NULL,  -- { tone, sentence_length, vocabulary, forbidden_patterns, ... }
  sample_count INTEGER NOT NULL DEFAULT 0,
  total_word_count INTEGER NOT NULL DEFAULT 0,
  computed_at INTEGER NOT NULL,
  model TEXT                       -- which LLM generated the fingerprint
);

-- Drafts. One row per piece of content. Roadmap-linked when generated from
-- a roadmap item, but drafts can also be created ad-hoc so roadmap_item_id
-- is nullable.
CREATE TABLE IF NOT EXISTS content_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug TEXT NOT NULL,
  roadmap_item_id INTEGER,                -- nullable
  citation_keyword_id INTEGER,            -- nullable, links to citation_keywords when drafted from a gap
  kind TEXT NOT NULL DEFAULT 'article',   -- article | faq | service_page | landing
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL DEFAULT '',
  body_html TEXT,                         -- rendered HTML with Article schema
  voice_score INTEGER,                    -- 0-100, null until first generation
  status TEXT NOT NULL DEFAULT 'draft',   -- draft | in_review | approved | rejected
  created_by_user_id INTEGER,
  approved_by_user_id INTEGER,
  approved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_drafts_slug ON content_drafts(client_slug, status);
CREATE INDEX IF NOT EXISTS idx_content_drafts_roadmap ON content_drafts(roadmap_item_id);

-- Edit history. Every save creates a row here so a client can revert or
-- diff their edits against the system-generated first draft.
CREATE TABLE IF NOT EXISTS content_draft_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id INTEGER NOT NULL,
  body_markdown TEXT NOT NULL,
  voice_score INTEGER,
  edited_by_user_id INTEGER,
  edited_by_system TEXT,            -- 'generation' | 'rewrite' when system-edited
  created_at INTEGER NOT NULL,
  FOREIGN KEY (draft_id) REFERENCES content_drafts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_content_versions_draft ON content_draft_versions(draft_id, created_at);
