-- Mission-control checker self-test canaries.
--
-- Two permanent, non-customer citation_snapshots rows with KNOWN shapes.
-- The hub self-test (dashboard/src/routes/hub.ts) asserts the split-brain
-- detector classifies them correctly: _canary_legacy must read as BROKEN
-- (legacy shape), _canary_readout must read as CLEAN (readout shape). This
-- verifies the whole detector query path end to end, not just the pure
-- function. If either canary is missing or misclassified, the self-test
-- tile goes red: the monitor itself is not to be trusted.
--
-- These slugs are NOT in the customers table, so they never surface on any
-- customer-facing tile, the customer strip, or the real split-brain
-- detector (which is scoped to customers WHERE status IN ('active','pilot')).
-- week_start = 0 is a clear sentinel; the real weekly writer never targets
-- these slugs.
INSERT OR REPLACE INTO citation_snapshots
  (client_slug, week_start, total_queries, client_citations, citation_share, top_competitors, keyword_breakdown, engines_breakdown, created_at)
VALUES
  ('_canary_legacy', 0, 10, 2, 0.0,
   '[{"name":"Example","count":3}]', '[]',
   '{"google_ai_overview":{"queries":10,"citations":2}}', unixepoch()),
  ('_canary_readout', 0, 19, 5, 26.3,
   '{"htc_venue_share_pct":20,"competitors":[]}', '[]',
   '{"Perplexity":{"citations":5,"total":19,"share_pct":26.3}}', unixepoch());
