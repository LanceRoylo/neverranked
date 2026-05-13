-- Partial unique index for historical conversation-mined decisions.
-- Live decisions (qa_audit, schema_injection, admin_alert) keep using
-- INSERT without dedupe. Only 'conversation_decision' rows are constrained,
-- so re-running scripts/decision-indexer.mjs against the same session
-- transcript is idempotent.
--
-- The artifact_id for conversation decisions is a stable hash of
-- session_id + lance message uuid, computed in the indexer.

CREATE UNIQUE INDEX IF NOT EXISTS lance_decisions_conversation_dedupe
  ON lance_decisions(artifact_type, artifact_id)
  WHERE artifact_type = 'conversation_decision';
