-- Performance indexes for hot queries
--
-- The audit flagged a handful of indexed-by-default-only queries that
-- will get slow at >1k clients. None hurt at current scale (single-
-- digit clients) but adding them now is cheap and prevents future
-- "everything is slow" panic refactors. SQLite create-index-if-not-
-- exists is a no-op if any of these already implicitly exist.

-- Latest scan per domain (cron + dashboard hot path)
CREATE INDEX IF NOT EXISTS idx_scan_results_domain_scanned ON scan_results(domain_id, scanned_at DESC);

-- Roadmap items completion query (used in monthly recap, dormancy check, agency dashboard)
CREATE INDEX IF NOT EXISTS idx_roadmap_items_client_status_completed ON roadmap_items(client_slug, status, completed_at);

-- Schema injections lookup by client (used in roadmap render, monthly recap)
CREATE INDEX IF NOT EXISTS idx_schema_injections_client_status ON schema_injections(client_slug, status);

-- Citation snapshots lookup by client + week_start (used everywhere citation data is read)
CREATE INDEX IF NOT EXISTS idx_citation_snapshots_client_week ON citation_snapshots(client_slug, week_start DESC);

-- GSC snapshots lookup by client + date_end
CREATE INDEX IF NOT EXISTS idx_gsc_snapshots_client_date ON gsc_snapshots(client_slug, date_end DESC);

-- Page views: queried by user_id + path for engagement analytics
CREATE INDEX IF NOT EXISTS idx_page_views_user_created ON page_views(user_id, created_at DESC);

-- Sessions: lookup-by-id is the primary key (already indexed). Add
-- expires_at scan index for the cleanup cron's WHERE expires_at < ?
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Magic links: cleanup queries hit (used, expires_at, created_at)
CREATE INDEX IF NOT EXISTS idx_magic_links_cleanup ON magic_links(used, expires_at, created_at);

-- Domains: hot scan + agency lookups
CREATE INDEX IF NOT EXISTS idx_domains_active_competitor ON domains(active, is_competitor);
CREATE INDEX IF NOT EXISTS idx_domains_agency ON domains(agency_id, is_competitor, active);
