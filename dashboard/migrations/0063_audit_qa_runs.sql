-- Audit QA agent run history.
--
-- Every $750 audit (and later, every NVI report) is reviewed by an
-- independent QA agent before delivery. The agent runs a structured
-- check across categories (consistency, voice, specificity, action
-- sanity, promise alignment, factual recheck) and returns pass/fail
-- per category plus an overall verdict.
--
-- One row per QA invocation. A single audit may have multiple rows
-- if the first attempt failed and the system regenerated + re-checked.
-- The latest row's final_outcome decides whether the audit ships.
--
-- The aggregate of these rows IS the learning loop: weekly cron
-- summarizes which categories fail most often, surfacing prompt
-- weaknesses for tuning.

CREATE TABLE IF NOT EXISTS audit_qa_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_token TEXT NOT NULL,            -- HMAC token of the audit being checked
  client_slug TEXT,                     -- denormalized for fast filtering
  brand TEXT,                           -- denormalized for admin display
  artifact_type TEXT NOT NULL,          -- 'audit' (more types in phase 2: 'nvi-report', 'pitch')
  attempt_number INTEGER NOT NULL,      -- 1, 2, 3 (max 3 in phase 1)
  scanned_at INTEGER NOT NULL,
  -- Results structure: JSON array of {category, ok, severity, reason, evidence?}
  -- where category in {consistency, voice, specificity, action_sanity,
  -- promise_alignment, factual_recheck, gestalt}
  passes_json TEXT NOT NULL DEFAULT '[]',
  blocking_failures INTEGER NOT NULL DEFAULT 0,   -- count of "block" severity failures
  warnings INTEGER NOT NULL DEFAULT 0,            -- count of "warn" severity failures
  overall_verdict TEXT NOT NULL,                  -- 'pass' | 'warn' | 'fail'
  final_outcome TEXT,                             -- 'shipped' | 'regenerated' | 'escalated' | 'pending'
  generation_cost_cents INTEGER DEFAULT 0,        -- cumulative LLM spend on this run
  qa_duration_ms INTEGER,                         -- end-to-end QA call duration
  -- Optional structured remediation: which sections to regenerate next attempt
  remediation_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_qa_token ON audit_qa_runs(audit_token, attempt_number DESC);
CREATE INDEX IF NOT EXISTS idx_audit_qa_recent ON audit_qa_runs(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_qa_verdict ON audit_qa_runs(overall_verdict, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_qa_outcome ON audit_qa_runs(final_outcome, scanned_at DESC);
