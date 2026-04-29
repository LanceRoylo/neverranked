-- Quarterly roadmap refresh.
--
-- The CMU GEO research shows AEO strategies need refreshing every
-- 60-90 days as AI models retrain and competitor citation patterns
-- shift. Our existing roadmap is generated once at engagement start
-- and never re-evaluated against drift in the citation landscape.
--
-- Phase 3 adds:
--   - last_refresh_at on client_settings: when we last ran the
--     quarterly refresh detection for this client
--   - stale flag on roadmap_items: items whose context (e.g. specific
--     competitor that no longer cites) no longer applies after a
--     refresh. Stays in the table for history but is hidden from
--     active views.
--   - refresh_source on roadmap_items: 'initial' (auto-generated at
--     onboarding) or 'refresh' (added by a quarterly refresh) or
--     'manual' (admin-added). Lets the dashboard show "added in
--     latest refresh" badges.

ALTER TABLE client_settings ADD COLUMN last_refresh_at INTEGER;
ALTER TABLE roadmap_items ADD COLUMN stale INTEGER DEFAULT 0;
ALTER TABLE roadmap_items ADD COLUMN refresh_source TEXT DEFAULT 'initial';

-- Backfill: every existing item is treated as 'initial' source and
-- not stale. The refresh runner will set stale=1 on items that no
-- longer apply at refresh time.
UPDATE roadmap_items SET refresh_source = 'initial' WHERE refresh_source IS NULL;
UPDATE roadmap_items SET stale = 0 WHERE stale IS NULL;

CREATE INDEX idx_roadmap_items_stale ON roadmap_items(client_slug, stale, status);
