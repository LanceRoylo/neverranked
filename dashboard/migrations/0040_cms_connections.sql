-- Multi-CMS publishing support.
--
-- Replaces the WordPress-specific wp_connections table with a generic
-- cms_connections table that holds one row per (client_slug, platform).
-- Platform-specific fields live in config_json (encrypted secrets stay
-- AES-GCM-encrypted via WP_ENCRYPTION_KEY at the application layer).
--
-- This migration:
--   1. Creates cms_connections.
--   2. Copies every existing wp_connections row into cms_connections
--      with platform='wordpress' and config_json built from the WP
--      columns. Encrypted passwords carry over as-is -- no re-encrypt.
--   3. Leaves wp_connections in place for now. A later migration will
--      drop it once all call sites are off the legacy table.

CREATE TABLE cms_connections (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug          TEXT NOT NULL,
  platform             TEXT NOT NULL,
  -- JSON blob with platform-specific config + encrypted secrets.
  -- WordPress shape:  { site_url, wp_username, wp_app_password, seo_plugin, default_category_id }
  -- Webflow shape:    { site_id, collection_id, api_token, body_field, slug_field, title_field }
  -- Shopify shape:    { shop_domain, blog_id, access_token }
  config_json          TEXT NOT NULL,
  default_post_status  TEXT NOT NULL DEFAULT 'future',
  last_tested_at       INTEGER,
  last_test_status     TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  UNIQUE(client_slug, platform)
);

CREATE INDEX idx_cms_connections_slug ON cms_connections(client_slug);

-- Backfill from wp_connections. SQLite has json_object() since 3.38;
-- D1 ships a recent SQLite that supports it. We build the config blob
-- inline so no application-layer re-encrypt is needed.
INSERT INTO cms_connections (
  client_slug, platform, config_json, default_post_status,
  last_tested_at, last_test_status, created_at, updated_at
)
SELECT
  client_slug,
  'wordpress',
  json_object(
    'site_url',            site_url,
    'wp_username',         wp_username,
    'wp_app_password',     wp_app_password,
    'seo_plugin',          seo_plugin,
    'default_category_id', default_category_id
  ),
  default_post_status,
  last_tested_at,
  last_test_status,
  created_at,
  updated_at
FROM wp_connections;
