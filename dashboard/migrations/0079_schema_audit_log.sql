-- Append-only audit log for every schema change that gets deployed to a
-- customer's live site via the /inject/:slug.js snippet.
--
-- WHY: defense-in-depth against the "infrastructure compromised, attacker
-- pushes malicious schema" scenario. Cryptographic signing of payloads
-- would require keys to live outside the Worker (cold-storage signing on
-- a separate machine), which is operational friction we are not yet
-- ready for at our customer scale. A append-only audit log gives us
-- the next best thing: every push is recorded with a SHA-256 hash, the
-- approver, a timestamp, and the prior payload's hash for edits.
-- Detection of unauthorized pushes goes from "hours" (waiting on a
-- customer to notice) to "minutes" (alert on every new row).
--
-- APPEND-ONLY ENFORCEMENT: by convention in application code (no UPDATE
-- or DELETE statements target this table anywhere). Future migration can
-- add a SQLite trigger that hard-blocks UPDATE/DELETE if we want
-- belt-and-suspenders.
--
-- READ PATH: surfaced at /admin/inject and (future) the public
-- /security/audit/<client_slug> endpoint so customers can verify
-- everything we have ever pushed to their site.

CREATE TABLE IF NOT EXISTS schema_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug TEXT NOT NULL,
  schema_injection_id INTEGER,  -- FK to schema_injections.id (nullable because injections can be archived)
  schema_type TEXT NOT NULL,    -- e.g., "Organization", "FAQPage", "Event"
  action TEXT NOT NULL,         -- 'approve' | 'edit' | 'pause' | 'archive' | 'unapprove'
  json_ld_hash TEXT NOT NULL,   -- SHA-256 hex of the json_ld payload as of this audit row
  json_ld_preview TEXT,         -- first 280 chars of the payload for human readability
  prior_hash TEXT,              -- previous payload's hash; populated on 'edit' actions
  actor_user_id INTEGER NOT NULL,
  actor_email TEXT,
  ip_hash TEXT,                 -- SHA-256 of approver's IP, truncated to 16 hex chars
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_schema_audit_client ON schema_audit_log(client_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schema_audit_injection ON schema_audit_log(schema_injection_id);
