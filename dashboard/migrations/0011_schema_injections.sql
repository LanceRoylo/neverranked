-- Schema injection system: stores generated JSON-LD blocks and client business info

CREATE TABLE IF NOT EXISTS schema_injections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug     TEXT NOT NULL,
  schema_type     TEXT NOT NULL,
  json_ld         TEXT NOT NULL,
  target_pages    TEXT NOT NULL DEFAULT '*',
  status          TEXT NOT NULL DEFAULT 'draft',
  roadmap_item_id INTEGER,
  approved_at     INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (roadmap_item_id) REFERENCES roadmap_items(id)
);

CREATE INDEX idx_injections_client ON schema_injections(client_slug, status);
CREATE INDEX idx_injections_roadmap ON schema_injections(roadmap_item_id);

CREATE TABLE IF NOT EXISTS injection_configs (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug           TEXT NOT NULL UNIQUE,
  enabled               INTEGER NOT NULL DEFAULT 1,
  cache_ttl             INTEGER NOT NULL DEFAULT 3600,
  snippet_token         TEXT NOT NULL,
  business_name         TEXT,
  business_url          TEXT,
  business_description  TEXT,
  business_phone        TEXT,
  business_email        TEXT,
  business_address      TEXT,
  business_logo_url     TEXT,
  business_social       TEXT,
  created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at            INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX idx_injection_config_slug ON injection_configs(client_slug);
