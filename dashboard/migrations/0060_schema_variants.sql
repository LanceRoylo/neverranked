-- Schema A/B testing foundation.
--
-- Every schema deployed to a (client_slug, target_pages, schema_type)
-- tuple gets a variant number (A, B, C, ...). Only one variant is
-- 'active' at a time; older variants live on with superseded_at set
-- so we can correlate citation_runs against the variant that was live
-- at run_at.
--
-- This is the foundation no one else in AEO has. Profound/Athena tell
-- you what to deploy; Schema App generates schemas; nobody measures
-- whether the schema you deployed actually moved citation share. With
-- variant + window attribution we can prove (or disprove) every fix.
--
-- Variant lifecycle:
--   1. Generator creates schema_injection with status='pending',
--      variant='A' if first for this tuple else next letter, deployed_at NULL.
--   2. Admin approves -> status='approved'/'active', deployed_at = now.
--      The PRIOR active variant for this tuple gets superseded_at = now
--      and superseded_by_id = new id.
--   3. Citation correlation reads schema_injections where
--      deployed_at <= run_at AND (superseded_at IS NULL OR superseded_at > run_at).
--
-- For now, variant assignment + supersede stamping happen in
-- application code (lib/schema-variants.ts). No triggers -- D1 trigger
-- support is patchy and explicit code is easier to debug.

ALTER TABLE schema_injections ADD COLUMN variant TEXT;
ALTER TABLE schema_injections ADD COLUMN deployed_at INTEGER;
ALTER TABLE schema_injections ADD COLUMN superseded_at INTEGER;
ALTER TABLE schema_injections ADD COLUMN superseded_by_id INTEGER;

-- Hot query: "what variant is live for this tuple right now?"
-- We filter on deployed_at IS NOT NULL AND superseded_at IS NULL.
CREATE INDEX IF NOT EXISTS idx_schema_injections_active_variant
  ON schema_injections (client_slug, schema_type, deployed_at)
  WHERE superseded_at IS NULL AND deployed_at IS NOT NULL;

-- Hot query: "what variant was live at this timestamp?"
-- (citation correlation join)
CREATE INDEX IF NOT EXISTS idx_schema_injections_window
  ON schema_injections (client_slug, deployed_at, superseded_at);
