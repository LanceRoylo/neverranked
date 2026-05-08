-- Reverse-engineer citations: competitor citation diff
--
-- When a competitor of a tracked client got cited and the client did not,
-- we want to surface WHY. This requires comparing:
--
--   1. The cited URL on the competitor's site
--   2. The schema present on that URL
--   3. The content patterns (FAQ entries, headings, content blocks)
--   4. The matching surface on the client's site (or absence thereof)
--
-- This migration adds the data model. The diff query lives in
-- dashboard/src/competitor-diff.ts. The customer-facing UI lives at
-- /reverse-engineer in the dashboard worker.
--
-- A row in `competitor_citations` is created any time:
--   - A weekly citation_runs entry observes a competitor URL cited
--   - For a prompt where the client was NOT cited
--
-- A row in `competitor_diff_findings` is created when:
--   - The diff job has analyzed the cited competitor URL and the
--     client's matching page (or determined no match exists)
--   - Each row carries one specific actionable finding

CREATE TABLE IF NOT EXISTS competitor_citations (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug        TEXT NOT NULL,
  citation_run_id    INTEGER NOT NULL,
  prompt             TEXT NOT NULL,
  engine             TEXT NOT NULL,
  competitor_domain  TEXT NOT NULL,
  competitor_url     TEXT NOT NULL,
  client_cited       INTEGER NOT NULL DEFAULT 0,
  observed_at        INTEGER NOT NULL,
  diff_status        TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'analyzed' | 'no_match' | 'error'
  FOREIGN KEY (citation_run_id) REFERENCES citation_runs(id)
);

CREATE INDEX idx_competitor_citations_client
  ON competitor_citations (client_slug, observed_at DESC);
CREATE INDEX idx_competitor_citations_status
  ON competitor_citations (diff_status, observed_at DESC);

CREATE TABLE IF NOT EXISTS competitor_diff_findings (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  competitor_citation_id   INTEGER NOT NULL,
  finding_category         TEXT NOT NULL,
    -- 'schema_present' | 'faq_match' | 'content_depth'
    -- | 'heading_specificity' | 'authority_signal'
  finding_summary          TEXT NOT NULL,
    -- One sentence describing what the competitor has that the
    -- client does not. Customer-facing.
  competitor_evidence      TEXT,
    -- The actual JSON-LD, FAQ entry, or text block from the
    -- competitor URL that earned the citation.
  client_state             TEXT,
    -- 'missing_page' | 'missing_schema' | 'partial_schema'
    -- | 'content_gap' | 'other'
  recommended_action       TEXT NOT NULL,
    -- The specific fix, written in NeverRanked Clarity Principle
    -- voice. Layer 1 (outcome) then Layer 2 (where to fix it).
  estimated_lift_points    INTEGER,
    -- Estimated AEO score lift if the action is shipped.
  created_at               INTEGER NOT NULL,
  FOREIGN KEY (competitor_citation_id) REFERENCES competitor_citations(id)
);

CREATE INDEX idx_competitor_diff_findings_citation
  ON competitor_diff_findings (competitor_citation_id);
