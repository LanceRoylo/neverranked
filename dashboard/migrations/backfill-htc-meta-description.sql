-- One-time backfill: Greg-approved page meta description for Hawaii
-- Theatre Center (hawaiitheatre.com), targeted at the homepage path
-- the technical-signals scan flagged as "Meta description: Missing".
--
-- Approval: Greg (CEO, Hawaii Theatre Center) approved this exact
-- string on 2026-05-18 after the em dash was removed (NeverRanked
-- voice rule: zero em dashes). See
-- clients/hawaii-theatre/2026-05-18-meta-description-deploy.md.
--
-- Targeted to ["/"] only, not '*', on purpose: a single brand/homepage
-- description repeated site-wide is a duplicate-meta-description SEO
-- anti-pattern. The scan flagged the homepage; that is what we fix.
--
-- Run once with:
--   wrangler d1 execute neverranked-app --remote \
--     --file=migrations/backfill-htc-meta-description.sql
--
-- Idempotent: the WHERE NOT EXISTS guard makes re-running a no-op once
-- the row is present (there is no UNIQUE constraint to rely on).

INSERT INTO meta_descriptions
  (client_slug, content, target_pages, status, approved_at, created_at, updated_at)
SELECT
  'hawaii-theatre',
  'Hawaii Theatre Center, the Pride of the Pacific. A restored 1922 National Register landmark in downtown Honolulu presenting concerts, theatre, comedy, dance, film, film festivals, venue rentals, and theatre education.',
  '["/"]',
  'approved',
  unixepoch(),
  unixepoch(),
  unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM meta_descriptions
  WHERE client_slug = 'hawaii-theatre' AND target_pages = '["/"]'
);
