-- Dedicated request_errors table.
--
-- analytics_events captures lots of things; request errors get lost in
-- the noise and silent catches. A dedicated table with raw INSERTs
-- means errors never go uncaptured, even when logEvent itself fails.
--
-- Read by /admin/recent-errors so Lance can quickly see what blew up
-- after a customer reports an error with a request id.

CREATE TABLE IF NOT EXISTS request_errors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  TEXT NOT NULL,
  path        TEXT NOT NULL,
  method      TEXT NOT NULL,
  user_id     INTEGER,
  message     TEXT NOT NULL,
  stack       TEXT,
  user_agent  TEXT,
  ip_prefix   TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_request_errors_id  ON request_errors(request_id);
CREATE INDEX idx_request_errors_at  ON request_errors(created_at DESC);
