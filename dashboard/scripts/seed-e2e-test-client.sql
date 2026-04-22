-- Seed a test client slug + domain under the e2e-test-agency so the
-- Voice and Drafts test specs have a real canAccessClient target. Safe
-- to re-run (upserts). Nothing here touches real client data.
--
-- RUN ORDER: seed-e2e-test-session.sql must run first (creates the
-- e2e-test-agency). This file also re-links the domain to the agency
-- on every run in case agencies was seeded later than the domain.
--
-- Run with:
--   cd dashboard
--   wrangler d1 execute neverranked-app --remote --file=scripts/seed-e2e-test-client.sql

INSERT OR IGNORE INTO domains
  (client_slug, domain, is_competitor, active, agency_id, created_at, updated_at)
VALUES
  ('e2e-test-client', 'e2e-test-client.example', 0, 1,
   (SELECT id FROM agencies WHERE slug = 'e2e-test-agency'),
   strftime('%s','now'), strftime('%s','now'));

-- Always backfill the agency_id in case the agency was created after this
-- domain was first inserted (avoids a canAccessClient NULL miss).
UPDATE domains
  SET agency_id = (SELECT id FROM agencies WHERE slug = 'e2e-test-agency')
  WHERE client_slug = 'e2e-test-client'
    AND (agency_id IS NULL OR agency_id != (SELECT id FROM agencies WHERE slug = 'e2e-test-agency'));

SELECT d.client_slug, d.domain, d.active, a.slug AS agency_slug
FROM domains d
LEFT JOIN agencies a ON a.id = d.agency_id
WHERE d.client_slug = 'e2e-test-client';
