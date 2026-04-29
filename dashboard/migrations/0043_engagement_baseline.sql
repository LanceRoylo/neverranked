-- Engagement baseline + citation-lift tracking.
--
-- We need a per-client anchor date so we can compute "citation rate
-- baseline" (the first 2 weeks after engagement started) vs "current"
-- (the most recent 2 weeks). The delta becomes the headline metric:
-- "you went from N% to M% citation rate since you signed up."
--
-- engagement_started_at is set automatically on first paid checkout
-- or first scan_results entry, whichever is earlier. Existing clients
-- get backfilled to their first scan_results.scanned_at.

ALTER TABLE client_settings ADD COLUMN engagement_started_at INTEGER;

-- Backfill from first scan_results entry (lowest scanned_at per slug).
-- D1 supports correlated subqueries, but the simpler INSERT/UPDATE
-- pattern is more reliable. We use INSERT...ON CONFLICT to seed rows
-- for client_slugs that don't have a client_settings entry yet.
INSERT INTO client_settings (client_slug, engagement_started_at, created_at, updated_at)
SELECT
  d.client_slug,
  MIN(sr.scanned_at) AS engagement_started_at,
  MIN(sr.scanned_at) AS created_at,
  strftime('%s', 'now') AS updated_at
FROM scan_results sr
JOIN domains d ON d.id = sr.domain_id
WHERE d.is_competitor = 0 AND sr.scanned_at IS NOT NULL
GROUP BY d.client_slug
ON CONFLICT(client_slug) DO UPDATE SET
  engagement_started_at = excluded.engagement_started_at,
  updated_at = excluded.updated_at;
