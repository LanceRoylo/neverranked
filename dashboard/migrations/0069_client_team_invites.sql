-- Direct-client team invites
--
-- agency_invites was originally agency-only with agency_id NOT NULL.
-- Direct retail customers (no agency) need the same flow scoped to
-- client_slug instead. SQLite cannot drop NOT NULL on an existing
-- column without rebuilding the table, so we rebuild.
--
-- Behavior:
--   - agency_admin invites: agency_id IS NOT NULL, client_slug nullable
--     (existing flow, unchanged)
--   - client team invites:  agency_id IS NULL, client_slug NOT NULL
--     (new flow for direct retail customers like Hawaii Theatre)
--
-- The accept handler already supports both shapes — see
-- routes/agency-invites.ts:handleInviteAccept which inserts user with
-- whatever agency_id and client_slug the invite carries.

CREATE TABLE agency_invites_v2 (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id     INTEGER REFERENCES agencies(id),
  email         TEXT NOT NULL,
  role          TEXT NOT NULL,         -- agency_admin | client
  client_slug   TEXT,                  -- required when role='client'
  token         TEXT NOT NULL UNIQUE,
  expires_at    INTEGER NOT NULL,
  used_at       INTEGER,
  invited_by    INTEGER,
  created_at    INTEGER NOT NULL,
  -- One of agency_id or client_slug must be set, otherwise the invite
  -- has no scoping context.
  CHECK (agency_id IS NOT NULL OR client_slug IS NOT NULL)
);

INSERT INTO agency_invites_v2
  (id, agency_id, email, role, client_slug, token, expires_at, used_at, invited_by, created_at)
SELECT
   id, agency_id, email, role, client_slug, token, expires_at, used_at, invited_by, created_at
FROM agency_invites;

DROP TABLE agency_invites;

ALTER TABLE agency_invites_v2 RENAME TO agency_invites;

CREATE INDEX idx_agency_invites_token   ON agency_invites(token);
CREATE INDEX idx_agency_invites_agency  ON agency_invites(agency_id);
CREATE INDEX idx_agency_invites_client  ON agency_invites(client_slug);
