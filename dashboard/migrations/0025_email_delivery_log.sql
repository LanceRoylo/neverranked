-- Email delivery log
--
-- Records every transactional email send attempt with the outcome from
-- Resend. Closes the observability gap that bit us debugging the
-- magic-link delivery issue: previously, send failures only printed to
-- console.log and were invisible without an active wrangler tail session.
--
-- One row per send attempt. status is one of:
--   queued     -- handed off to Resend with 2xx response
--   suppressed -- Resend returned 2xx but later marked it suppressed
--                 (we can't detect this without a webhook; see roadmap)
--   bounced    -- Resend webhook reported a hard bounce (future)
--   failed     -- Resend returned non-2xx, or fetch threw
--
-- error_message is the truncated Resend response body or thrown error.
-- agency_id is set when the send was branded as an agency, null otherwise.
-- target_id is opaque, e.g. user.id for digest, domain.id for snippet.

CREATE TABLE email_delivery_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL,
  type            TEXT NOT NULL, -- magic_link | digest | regression | invite | snippet_delivery | snippet_nudge_day7 | snippet_nudge_day14 | snippet_drift | roadmap_stall
  status          TEXT NOT NULL, -- queued | failed
  status_code     INTEGER,        -- HTTP status from Resend, NULL if fetch threw
  error_message   TEXT,           -- truncated to ~500 chars
  agency_id       INTEGER REFERENCES agencies(id),
  target_id       INTEGER,        -- opaque foreign key; meaning depends on type
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_email_delivery_log_email_created ON email_delivery_log(email, created_at DESC);
CREATE INDEX idx_email_delivery_log_status_created ON email_delivery_log(status, created_at DESC);
CREATE INDEX idx_email_delivery_log_type_created ON email_delivery_log(type, created_at DESC);
