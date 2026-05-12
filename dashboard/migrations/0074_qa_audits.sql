-- QA auditor telemetry.
--
-- Phase 1.5 introduces an independent grader layer that audits the
-- system's outputs (schemas, content drafts, citation responses, NVI
-- reports, marketing-copy-vs-reality consistency, outbound emails).
-- Every audit run writes a row here.
--
-- The audits use different LLMs from the production-generation paths
-- on purpose -- production uses Claude, audits use OpenAI -- so the
-- grader doesn't inherit the generator's blindspots. Rules-based audits
-- (no LLM) get grader_model='rules'.
--
-- A "red" verdict on a high-stakes artifact can be blocking: the audit
-- writes the row with blocked=1, the calling code reads that and aborts
-- the action (schema approval, email send). Lance overrides via a
-- force=1 query param when warranted.
--
-- This table is also the training-data substrate for the eventual
-- Lance-agent. Every (artifact, audit verdict, optional Lance override)
-- tuple is a labeled data point.

CREATE TABLE IF NOT EXISTS qa_audits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category      TEXT NOT NULL,   -- 'schema_integrity'|'content_voice'|'citation_sanity'|'nvi_drift'|'cross_system'|'email_preflight'
  artifact_type TEXT NOT NULL,   -- 'schema_injection'|'content_draft'|'citation_run'|'nvi_report'|'system'|'email'
  artifact_id   INTEGER,         -- FK to the audited row; null for cross-system audits where there is no single row
  artifact_ref  TEXT,            -- free-form reference (e.g. "homepage", "state-of-aeo", or an email message_id)
  verdict       TEXT NOT NULL CHECK(verdict IN ('green','yellow','red')),
  grader_model  TEXT NOT NULL,   -- 'rules'|'gpt-4o-mini'|'gpt-4o'|'claude-haiku-4-5'|...
  grader_score  INTEGER,         -- 0-100 if LLM-graded; null if rules-only binary
  reasoning     TEXT,            -- one-line explanation suitable for a human reviewer
  blocked       INTEGER DEFAULT 0 CHECK(blocked IN (0,1)),  -- 1 if this audit prevented the artifact from proceeding
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_qa_audits_category_created ON qa_audits(category, created_at DESC);
CREATE INDEX idx_qa_audits_artifact         ON qa_audits(artifact_type, artifact_id);
CREATE INDEX idx_qa_audits_created          ON qa_audits(created_at DESC);
CREATE INDEX idx_qa_audits_verdict          ON qa_audits(verdict, created_at DESC);
