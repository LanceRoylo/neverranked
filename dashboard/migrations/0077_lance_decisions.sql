-- Unified decision log. Phase 2.5.
--
-- Captures every approve/reject/edit/dismiss/override Lance makes
-- across the entire admin surface. Generalization of the Phase 2
-- qa_decisions table.
--
-- Why a separate table from qa_decisions: qa_decisions is QA-specific
-- (grader calibration; tracks new_verdict for overrides). This table
-- is broader (every admin decision, schemas, alerts, NVI reports,
-- roadmap items, etc.). Both tables coexist; QA decisions are also
-- mirrored here for unified-view queries.
--
-- The accumulating dataset is the foundational training-data substrate
-- for the eventual Lance-agent. Every row says: "given this artifact
-- in this state, Lance chose to <decision_kind>." Over time, patterns
-- emerge that the agent learns to mimic.
--
-- decision_kind values (open-ended, no CHECK constraint so new kinds
-- can be added without migration):
--   approve, reject, edit, dismiss, complete, archive, force,
--   defer, agree, disagree, override, mark_read, run_now

CREATE TABLE IF NOT EXISTS lance_decisions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  artifact_type TEXT NOT NULL,    -- 'schema_injection'|'content_draft'|'nvi_report'|'admin_alert'|'roadmap_item'|'qa_audit'|...
  artifact_id   INTEGER NOT NULL,
  decision_kind TEXT NOT NULL,
  prior_state   TEXT,             -- e.g. 'pending', 'draft', 'red'
  new_state     TEXT,             -- e.g. 'approved', 'sent', 'green'
  note          TEXT,
  metadata      TEXT,             -- JSON blob for kind-specific extras
  user_id       INTEGER NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_lance_decisions_artifact   ON lance_decisions(artifact_type, artifact_id, created_at DESC);
CREATE INDEX idx_lance_decisions_user       ON lance_decisions(user_id, created_at DESC);
CREATE INDEX idx_lance_decisions_kind       ON lance_decisions(decision_kind, created_at DESC);
CREATE INDEX idx_lance_decisions_created    ON lance_decisions(created_at DESC);
