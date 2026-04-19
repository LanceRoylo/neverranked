-- Two-factor authentication (TOTP) for admin accounts
--
-- Architecture: opt-in for any user, REQUIRED for admin role at the
-- session level. Magic-link auth still works as the first factor;
-- TOTP becomes the second.
--
-- Flow:
--   1. User signs in via magic link (existing flow)
--   2. /auth/verify creates a session with totp_verified=0
--   3. If users.totp_enabled_at IS NOT NULL, the auth gate
--      intercepts and redirects to /auth/2fa-challenge
--   4. Valid TOTP code -> session.totp_verified=1, normal browsing
--      resumes
--   5. Admin routes additionally require totp_verified=1 even for
--      users who haven't enrolled (forces enrollment)
--
-- Recovery codes: 10 single-use one-time codes generated at
-- enrollment, stored as a JSON array. Each consumed code is
-- removed from the array. If a user runs out, support resets via
-- direct DB edit.

ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled_at INTEGER;
ALTER TABLE users ADD COLUMN totp_recovery_codes TEXT;

ALTER TABLE sessions ADD COLUMN totp_verified INTEGER NOT NULL DEFAULT 0;
