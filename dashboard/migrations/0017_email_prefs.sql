-- Granular email notification preferences
ALTER TABLE users ADD COLUMN email_alerts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN email_regression INTEGER NOT NULL DEFAULT 1;
