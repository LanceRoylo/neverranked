-- Per-FAQ client editorial control. Each row is one FAQ candidate
-- for a client with its own approve/edit/reject lifecycle.
--
-- Replaces the reddit_faq_deployments model's "approved blob" pattern
-- where every FAQ in a deployment was either all-deployed or all-not.
-- Now each FAQ is independently reviewable, editable, and toggleable.
--
-- State machine:
--   proposed  -> approved -> (live in schema_injections)
--   proposed  -> rejected -> permanent (deduped on next regen)
--   proposed  -> edited   -> approved -> (live with edited text)
--   approved  -> removed  -> not live, kept in history
--   approved  -> edited   -> approved -> (re-deploys with new text)
--
-- The schema_injections FAQPage row for a client is derived from
-- "WHERE client_slug = ? AND status = 'approved' AND superseded_at IS NULL".
--
-- UNIQUE on (client_slug, question) prevents the regen cron from
-- re-proposing the same question after a client rejects it. The
-- question text is normalized (trim + lowercase) at insert time.

CREATE TABLE IF NOT EXISTS client_faqs (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug           TEXT NOT NULL,
  question              TEXT NOT NULL,
  question_normalized   TEXT NOT NULL,                 -- trim + lowercase for dedup
  answer_proposed       TEXT NOT NULL,                 -- the original generated answer
  answer_current        TEXT NOT NULL,                 -- live version (may differ if edited)
  source                TEXT NOT NULL,                 -- FAQCandidateSource
  evidence_json         TEXT,                          -- source threads/prompts + counts
  status                TEXT NOT NULL DEFAULT 'proposed',
                                                       -- proposed | approved | rejected | removed
  reviewer_user_id      INTEGER,
  reviewed_at           INTEGER,
  edited_at             INTEGER,
  rejection_reason      TEXT,
  rejection_category    TEXT,                          -- off_topic | voice | category | other
  deployment_id         INTEGER,                       -- reddit_faq_deployments row this came from
  created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  superseded_at         INTEGER                        -- newer regen replaced this row
);

CREATE UNIQUE INDEX idx_client_faqs_unique
  ON client_faqs(client_slug, question_normalized);
CREATE INDEX idx_client_faqs_client_status
  ON client_faqs(client_slug, status, created_at DESC);
CREATE INDEX idx_client_faqs_status
  ON client_faqs(status);
