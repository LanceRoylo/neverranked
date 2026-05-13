-- Reddit-aware FAQ deployments.
--
-- Persists the output of buildFAQDeployment() so the dashboard can
-- show the latest deployment for a client, track which JSON-LD
-- block is live on their site, and run weekly drift checks against
-- new Reddit citations without burning Claude $ on every page load.
--
-- One row per generated deployment. The schema_injection_id FK
-- links the build to the row in the existing schema_injections
-- table, which is what the client-side snippet actually serves.

CREATE TABLE IF NOT EXISTS reddit_faq_deployments (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug           TEXT NOT NULL,
  generated_at          INTEGER NOT NULL,
  faq_count             INTEGER NOT NULL,
  source_thread_count   INTEGER NOT NULL DEFAULT 0,
  faqs_json             TEXT NOT NULL,           -- full FAQEntry[] with evidence
  schema_json_ld        TEXT NOT NULL,
  schema_size_bytes     INTEGER NOT NULL,
  schema_injection_id   INTEGER,                 -- FK to schema_injections.id (null until deployed)
  status                TEXT NOT NULL DEFAULT 'draft',
                                                 -- draft | deployed | superseded
  deployed_at           INTEGER,
  last_cited_check_at   INTEGER,
  cited_in_engines_json TEXT,                    -- {"chatgpt": 3, "perplexity": 1}
  business_context_hash TEXT,                    -- hash of business name+desc at build time
  created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (schema_injection_id) REFERENCES schema_injections(id)
);

CREATE INDEX idx_reddit_faq_client ON reddit_faq_deployments(client_slug, status);
CREATE INDEX idx_reddit_faq_generated ON reddit_faq_deployments(client_slug, generated_at DESC);
