-- ONE-TIME setup: seed a long-lived session for the Playwright CI suite.
--
-- Creates (or reuses) a dedicated test agency_admin user and a session
-- token that expires in 1 year. Token gets stored in GitHub Secrets as
-- PLAYWRIGHT_SESSION_TOKEN so CI can drive authenticated browsing
-- without D1 access.
--
-- Run with:
--   cd dashboard
--   wrangler d1 execute neverranked-app --remote --file=scripts/seed-e2e-test-session.sql
--
-- Then capture the printed token and store it as a GitHub Secret:
--   gh secret set PLAYWRIGHT_SESSION_TOKEN
--
-- Re-running is safe: it upserts the user and creates a fresh session
-- (old sessions for the same user remain valid until they expire). If
-- you need to rotate, delete the old session row first.

-- 1. Test agency (do nothing if exists).
INSERT OR IGNORE INTO agencies
  (slug, name, contact_email, status, created_at, updated_at)
VALUES
  ('e2e-test-agency', 'E2E Test Agency', 'e2e-tests@neverranked.com', 'active',
   strftime('%s','now'), strftime('%s','now'));

-- 2. Test user, linked to the agency. agency_admin role so they can
--    see the agency dashboard, but no totp_enabled_at so 2FA never
--    gets in the way.
INSERT OR IGNORE INTO users
  (email, name, role, agency_id, email_digest, created_at)
VALUES
  ('e2e-tests@neverranked.com', 'E2E Tests', 'agency_admin',
   (SELECT id FROM agencies WHERE slug = 'e2e-test-agency'),
   0, strftime('%s','now'));

-- 3. Long-lived session. Token is hardcoded to a recognizable hex
--    string so we can spot it in DB queries / logs. Expires in 1 year.
--    DELETE this row + re-INSERT to rotate.
INSERT OR REPLACE INTO sessions (id, user_id, expires_at, created_at, totp_verified)
VALUES (
  '0000aaaa0000bbbb0000cccc0000dddd0000eeee0000ffff0000aaaa0000bbbb',
  (SELECT id FROM users WHERE email = 'e2e-tests@neverranked.com'),
  strftime('%s','now') + 31536000,  -- +1 year
  strftime('%s','now'),
  1   -- pre-mark 2FA-verified so the gate lets us through if 2FA is ever enabled
);

-- 4. Echo the token + the user/agency we attached it to.
SELECT
  s.id AS session_token,
  u.email AS attached_user,
  u.role,
  a.slug AS attached_agency,
  s.expires_at AS expires_at_unix,
  datetime(s.expires_at, 'unixepoch') AS expires_at_iso
FROM sessions s
JOIN users u ON u.id = s.user_id
LEFT JOIN agencies a ON a.id = u.agency_id
WHERE u.email = 'e2e-tests@neverranked.com';
