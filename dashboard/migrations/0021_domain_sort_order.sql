-- NeverRanked Dashboard -- Manual ordering for competitor comparison rows
--
-- Adds sort_order to domains so users can drag-and-drop reorder their
-- tracked competitors on the AEO Score Comparison page. Lower sort_order
-- renders earlier. The primary (is_competitor = 0) row is always pinned
-- to the top regardless of this value.
--
-- Seeds existing rows with their row id so the current visible order is
-- preserved (the page previously ordered by domain alphabetically; we
-- accept a small one-time reshuffle here in exchange for stable ids).
--
-- If per-user ordering is ever needed, pivot to a join table like
-- user_domain_order(user_id, domain_id, sort_order) -- do NOT repurpose
-- this column, which is a property of the domain row itself.

ALTER TABLE domains ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Seed: existing domains get sort_order = id so the initial order is
-- stable and deterministic. New competitors added after this migration
-- will get sort_order = 0 by default; the route handler assigns a
-- trailing sort_order on insert so they land at the end of the list.
UPDATE domains SET sort_order = id;

CREATE INDEX idx_domains_sort_order ON domains(client_slug, is_competitor, sort_order);
