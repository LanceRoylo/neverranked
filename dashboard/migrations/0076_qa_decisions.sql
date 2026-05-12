-- QA decision log. Phase 2.
--
-- Every time Lance reviews a QA audit and clicks agree/disagree/override
-- on /admin/qa/[id], a row lands here. The accumulating dataset is the
-- training-data substrate for the eventual Lance-agent: it learns from
-- the patterns of when Lance accepts the grader's verdict vs overrides
-- it.
--
-- Three decision types:
--   agree     - "the grader called it right, no further action"
--   disagree  - "the grader called it wrong, here's why" (note required)
--   override  - "I'm flipping the verdict from X to Y" (new_verdict + note)
--
-- Each decision references a qa_audits row. Multiple decisions on the
-- same audit are allowed (Lance can re-evaluate later as new info comes
-- in) but the most-recent decision is the "current" call.

CREATE TABLE IF NOT EXISTS qa_decisions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_id      INTEGER NOT NULL,
  decision      TEXT NOT NULL CHECK(decision IN ('agree','disagree','override')),
  new_verdict   TEXT,  -- For 'override' decisions: the verdict Lance set (green/yellow/red). NULL for agree/disagree.
  note          TEXT,  -- Required for disagree+override, optional for agree.
  user_id       INTEGER NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_qa_decisions_audit ON qa_decisions(audit_id, created_at DESC);
CREATE INDEX idx_qa_decisions_user ON qa_decisions(user_id, created_at DESC);
CREATE INDEX idx_qa_decisions_decision ON qa_decisions(decision, created_at DESC);
