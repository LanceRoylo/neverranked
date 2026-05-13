-- Per-client walkthrough state.
--
-- For multi-step guided walkthroughs (Bing for Business setup, Apple
-- Business Connect setup, NAP audit, FAQ marker install) we track
-- which step the client is on and which steps they've completed.
--
-- One row per (client_slug, action_type). Granular per-step
-- completion lives in completed_steps_json as an array of step ids.
--
-- Action types (open-ended, registered in code at
-- src/client-actions/registry.ts):
--   bing_for_business
--   apple_business_connect
--   nap_audit
--   faq_marker_install
--   faq_review (treated as an action for surface consistency, but
--               progress is driven by client_faqs state, not steps)

CREATE TABLE IF NOT EXISTS client_action_progress (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug              TEXT NOT NULL,
  action_type              TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'not_started',
                                                          -- not_started | in_progress | submitted | complete | skipped
  current_step_id          TEXT,                          -- which step they're on
  completed_steps_json     TEXT NOT NULL DEFAULT '[]',    -- array of completed step ids
  submitted_at             INTEGER,                       -- they marked it "submitted" (postcard pending)
  completed_at             INTEGER,                       -- final verification done
  skipped_at               INTEGER,                       -- they chose to skip this action
  last_activity_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  metadata_json            TEXT,                          -- action-specific extras
  created_at               INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX idx_client_action_progress_unique
  ON client_action_progress(client_slug, action_type);
CREATE INDEX idx_client_action_progress_status
  ON client_action_progress(status, last_activity_at);
