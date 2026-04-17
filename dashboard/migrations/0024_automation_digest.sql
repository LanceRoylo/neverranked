-- Daily automation digest opt-in + tracking. Single-row settings
-- extension so Lance can enable a 9am morning email summarizing what
-- the automation layer did yesterday. Opt-in (default off) so we don't
-- spam a fresh install.
--
-- last_digest_sent_at guards against double-send if the cron fires
-- twice on the same day.

ALTER TABLE automation_settings ADD COLUMN daily_digest_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE automation_settings ADD COLUMN last_digest_sent_at INTEGER;
