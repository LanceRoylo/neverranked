-- Phase 2: automated hot/warm Preview + one-click-approve send.
--
-- D1 is the boundary between the two Workers (no Worker-to-Worker
-- HTTP): the dashboard Worker auto-builds Previews + the matching
-- draft email and, on Lance's one-click approve, enqueues a send
-- here. The outreach Worker (sole send_log writer — Decision C)
-- drains this queue via the host /send path. Both steps are gated
-- by config.phase2_autopreview_enabled (default false) so this
-- ships INERT until the coordinated flip.

-- Handoff queue. dashboard writes 'queued' on approve; outreach
-- writes 'sent'/'error' on drain. One row per approved Preview.
CREATE TABLE IF NOT EXISTS outreach_preview_send_queue (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id   INTEGER NOT NULL,
  preview_slug  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued',  -- queued | sent | error
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  sent_at       INTEGER,
  error         TEXT,
  UNIQUE(prospect_id, preview_slug)
);
CREATE INDEX IF NOT EXISTS idx_preview_send_queue_status
  ON outreach_preview_send_queue(status);

-- Provenance on previews so the digest can list only auto-built,
-- not-yet-approved ones, and the auto-build step is idempotent
-- (skip prospects already auto-built). source: 'manual' (Lance
-- clicked Build) | 'auto' (Phase 2 cron built it).
ALTER TABLE previews ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE previews ADD COLUMN auto_built_at INTEGER;
