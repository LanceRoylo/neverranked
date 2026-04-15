-- Auto-approve any remaining pending competitor suggestions
-- and add them to the domains table.
-- This aligns with the new flow where suggestions are approved immediately on submission.

-- First, add any pending suggestions as competitor domains (skip if already exists)
INSERT OR IGNORE INTO domains (client_slug, domain, is_competitor, competitor_label, active, created_at, updated_at)
SELECT cs.client_slug, cs.domain, 1, cs.label, 1, cs.created_at, cs.created_at
FROM competitor_suggestions cs
WHERE cs.status = 'pending'
AND NOT EXISTS (
  SELECT 1 FROM domains d WHERE d.domain = cs.domain AND d.client_slug = cs.client_slug
);

-- Then mark all pending suggestions as approved
UPDATE competitor_suggestions SET status = 'approved' WHERE status = 'pending';
