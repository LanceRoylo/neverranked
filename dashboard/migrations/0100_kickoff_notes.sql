-- Kickoff meeting guide: one JSON blob of the guided-intake answers per client.
-- Admin opens /admin/kickoff/<slug> during the kickoff call, reads the prompts,
-- and types the customer's answers; each field auto-saves here.
CREATE TABLE IF NOT EXISTS kickoff_notes (
  client_slug  TEXT PRIMARY KEY,
  answers_json TEXT NOT NULL DEFAULT '{}',
  updated_at   TEXT NOT NULL
);
