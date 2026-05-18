-- Meta description injection.
--
-- The inject snippet already delivers JSON-LD and FAQ HTML into a
-- client's <head>. A missing/weak page <meta name="description"> is a
-- recurring technical-signal finding (e.g. hawaiitheatre.com flagged
-- "Meta description: Missing"). This table is the per-client store for
-- approved descriptions the snippet injects, mirroring the
-- schema_injections shape: per-page targeting via target_pages and the
-- same draft/approved workflow.
--
-- target_pages: literal '*' (every page) or a JSON array of patterns,
-- each exact-match unless it ends in '*' (prefix match) -- identical
-- semantics to schema_injections.target_pages and the .js matcher.

CREATE TABLE IF NOT EXISTS meta_descriptions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug   TEXT NOT NULL,
  content       TEXT NOT NULL,
  target_pages  TEXT NOT NULL DEFAULT '*',
  status        TEXT NOT NULL DEFAULT 'draft',
  approved_at   INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_meta_desc_client ON meta_descriptions(client_slug, status);
