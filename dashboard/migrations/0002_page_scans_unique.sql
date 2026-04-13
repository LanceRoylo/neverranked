-- Add unique constraint on page_scans for upsert support
-- and unique constraint on monitored_pages to prevent duplicates

CREATE UNIQUE INDEX IF NOT EXISTS idx_page_scans_domain_url ON page_scans(domain_id, url);
CREATE UNIQUE INDEX IF NOT EXISTS idx_monitored_pages_domain_url ON monitored_pages(domain_id, url);
