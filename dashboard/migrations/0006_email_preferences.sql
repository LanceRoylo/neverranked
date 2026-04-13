-- Email digest preferences: clients opt in by default.
ALTER TABLE users ADD COLUMN email_digest INTEGER NOT NULL DEFAULT 1;
