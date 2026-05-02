-- Admin inbox: the founder's single surface for "what needs my attention".
--
-- Producers (content drafts entering review, AI tone-guard failures, voice
-- score failures, customer escalations, billing edge cases, etc.) write
-- one row per actionable item. The admin inbox page + daily 7am Pacific
-- email surface them. Items resolve via approve/reject/snooze actions on
-- the dashboard.
--
-- The UNIQUE(kind, target_type, target_id) constraint makes producer
-- writes idempotent: re-running a producer for the same draft/brief/etc.
-- updates the existing row instead of creating a duplicate.

CREATE TABLE IF NOT EXISTS admin_inbox (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kind            TEXT NOT NULL,             -- producer slug, e.g. 'content_draft_review', 'content_tone_fail'
  title           TEXT NOT NULL,             -- one-line headline shown in inbox + email
  body            TEXT,                      -- markdown body, optional, shown on detail page
  action_url      TEXT,                      -- where the "Open" button sends the user
  target_type     TEXT,                      -- e.g. 'content_draft', 'reddit_brief', 'roadmap_item', 'system'
  target_id       INTEGER,                   -- id in the target table
  target_slug     TEXT,                      -- client_slug if applicable
  urgency         TEXT NOT NULL DEFAULT 'normal',  -- 'low' | 'normal' | 'high'
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'snoozed' | 'resolved'
  resolution_note TEXT,                      -- optional, set when resolved
  resolved_by     INTEGER,                   -- users.id
  created_at      INTEGER NOT NULL,
  resolved_at     INTEGER,
  snoozed_until   INTEGER,                   -- set when status='snoozed'; row re-surfaces in inbox after this
  UNIQUE(kind, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_inbox_pending ON admin_inbox(status, urgency, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_inbox_kind    ON admin_inbox(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_inbox_slug    ON admin_inbox(target_slug, status);
