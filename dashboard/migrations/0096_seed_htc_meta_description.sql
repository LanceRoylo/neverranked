-- Seed: Greg-approved page meta description for Hawaii Theatre Center.
--
-- This is a numbered migration on purpose, not a separate backfill
-- file. The dashboard's D1 lives in an account only the CI deploy
-- token (deploy-dashboard.yml) can write -- a founder laptop on a
-- personal Cloudflare account gets API error 7403. CI runs
-- `wrangler d1 migrations apply`, which applies numbered migrations
-- only, so the approved copy has to ship as one to deploy itself
-- with no manual D1 access.
--
-- Approval: Greg (CEO, Hawaii Theatre Center) approved this exact
-- string on 2026-05-18 after the em dash was removed (NeverRanked
-- voice rule: zero em dashes). See
-- clients/hawaii-theatre/2026-05-18-meta-description-deploy.md.
--
-- Targeted to ["/"] only, not '*', on purpose: a single brand/home
-- description repeated site-wide is a duplicate-meta-description SEO
-- anti-pattern. The scan flagged the homepage; that is what we fix.
--
-- Idempotent: the WHERE NOT EXISTS guard makes re-application a
-- no-op (migrations apply runs a file once, but the guard also keeps
-- a manual re-run safe).

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
