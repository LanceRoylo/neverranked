-- Exit surveys
--
-- Captured at the cancellation interstitial. We DO let the user
-- proceed to Stripe regardless of what they pick (no dark patterns)
-- but the response gives ops a real signal on WHY people leave so
-- we can fix the patterns.
--
-- reason categories (single-select on the form):
--   too_expensive    -- pricing
--   not_seeing_value -- unclear ROI / score didn't move
--   missing_feature  -- specific feature gap
--   too_complicated  -- UX / setup friction
--   no_longer_need   -- problem solved or business changed
--   other            -- free-text note
--
-- Optional follow-up: paused_instead, switched_to_competitor,
-- talked_to_founder. Captured separately so we can see the actions
-- the interstitial drove.

CREATE TABLE exit_surveys (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER REFERENCES users(id),
  user_email      TEXT NOT NULL,
  reason          TEXT NOT NULL,
  details         TEXT,
  outcome         TEXT NOT NULL, -- proceeded_to_cancel | paused_instead | requested_call | abandoned
  client_slug     TEXT,
  agency_id       INTEGER REFERENCES agencies(id),
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_exit_surveys_created ON exit_surveys(created_at DESC);
CREATE INDEX idx_exit_surveys_reason ON exit_surveys(reason, created_at DESC);
