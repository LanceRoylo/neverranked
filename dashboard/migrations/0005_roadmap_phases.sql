-- Phased roadmap system: each client gets multiple phases that unlock sequentially.
-- When Phase 1 hits 100%, Phase 2 becomes active. AEO is never "done."

CREATE TABLE IF NOT EXISTS roadmap_phases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug     TEXT NOT NULL,
  phase_number    INTEGER NOT NULL DEFAULT 1,
  title           TEXT NOT NULL,
  subtitle        TEXT,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'active',   -- active | completed | locked
  completed_at    INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_phases_client_number ON roadmap_phases(client_slug, phase_number);
CREATE INDEX IF NOT EXISTS idx_phases_client ON roadmap_phases(client_slug);

-- Link existing roadmap_items to phases
ALTER TABLE roadmap_items ADD COLUMN phase_id INTEGER REFERENCES roadmap_phases(id);

-- Backfill: create Phase 1 for every client that already has roadmap items,
-- then link those items to their Phase 1.
-- (Run these manually after applying the migration since D1 doesn't support
--  INSERT ... SELECT in migrations reliably. Use the seeding queries below.)
