-- Shareable kickoff pre-read: a token the customer opens (no login) to fill in
-- a few questions before the call, and a place to store their answers separately
-- from the admin's live notes (answers_json).
ALTER TABLE kickoff_notes ADD COLUMN share_token   TEXT;
ALTER TABLE kickoff_notes ADD COLUMN customer_json TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_kickoff_share_token ON kickoff_notes(share_token);
