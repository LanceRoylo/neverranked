-- Phase D additions:
--
-- 1. Per-client pipeline pause state. When a customer rejects two
--    drafts in a row OR an admin manually pauses, the content pipeline
--    cron skips that client until unpaused. Unpaused automatically on
--    the next explicit Approve click OR admin unpause.
--
-- 2. Per-client content restrictions -- a free-text "never say" list
--    that gets injected into both the generation prompt and the QA
--    prompt so the voice engine avoids the topics and the QA scan
--    flags any that slip through.
--
-- Both live on client_settings since they're per-client (not per-
-- agency, not per-user). Nullable so unset clients behave as before.

ALTER TABLE client_settings ADD COLUMN pipeline_paused_at INTEGER;
ALTER TABLE client_settings ADD COLUMN pipeline_pause_reason TEXT;
ALTER TABLE client_settings ADD COLUMN content_restrictions TEXT;
