-- Client events log + per-client digest cadence.
--
-- Replaces the firehose of per-event emails (citation gained / lost,
-- grade up, snippet detected, phase complete, regression alert) with
-- a single weekly digest. Each event lands here at the moment it
-- happens, then the Monday digest renders a section per event type
-- from the rows accumulated since the last send.
--
-- delivered_in_digest_id is set when a digest goes out that included
-- this event, so we never re-include the same event in a future
-- digest. NULL means the event is still pending inclusion.
--
-- Cadence column on injection_configs lets a client choose biweekly
-- delivery. The digest cron checks last_digest_sent_at against
-- cadence to decide whether to send this week.

CREATE TABLE IF NOT EXISTS client_events (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug              TEXT NOT NULL,
  kind                     TEXT NOT NULL,
                               -- 'citation_gained' | 'citation_lost' | 'grade_up' |
                               -- 'snippet_detected' | 'first_citation' |
                               -- 'phase_complete' | 'regression_alert' |
                               -- 'schema_deployed' | 'faq_deployed' |
                               -- 'roadmap_complete'
  severity                 TEXT NOT NULL DEFAULT 'info',
                               -- 'info' | 'win' | 'concern'
  title                    TEXT NOT NULL,
  body                     TEXT,
  payload_json             TEXT,
  occurred_at              INTEGER NOT NULL DEFAULT (unixepoch()),
  delivered_in_digest_id   INTEGER,
  created_at               INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_client_events_pending
  ON client_events(client_slug, delivered_in_digest_id, occurred_at);
CREATE INDEX idx_client_events_kind
  ON client_events(client_slug, kind, occurred_at);

ALTER TABLE injection_configs ADD COLUMN digest_cadence TEXT DEFAULT 'weekly';
ALTER TABLE injection_configs ADD COLUMN last_digest_sent_at INTEGER;
