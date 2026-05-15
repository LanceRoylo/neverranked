-- Outreach mutable runtime config -> D1 (migration Phase 3, Option A)
--
-- The Node tool reads config.json off disk via lib/limiter.js
-- readConfig()/writeConfig(). Workers have no filesystem. Decision
-- (Lance, 2026-05-15): single-row JSON table, NOT key/value, NOT KV.
--   - Single-row JSON = lowest blast radius: limiter.ts readConfig()
--     is one SELECT, writeConfig() one UPDATE; every `config.foo`
--     access site in the rest of the codebase is untouched (the
--     config object shape is preserved exactly as config.json).
--   - D1 (not KV) because apollo_next_page is incremented and
--     `paused` toggled and both are read every run — KV's eventual
--     consistency would re-fetch stale state (the exact Apollo
--     page-1 bug we already fixed). D1 is strongly consistent.
--
-- SECRETS ARE EXCLUDED. The 7 secret keys (anthropic/apollo/hunter/
-- smtp/cf/admin) do NOT live here — they go to `wrangler secret`
-- and are read from Worker env. Putting them in a queryable table
-- would recreate the plaintext-key leak flagged on the local
-- /api/config endpoint. Only the 30 mutable runtime keys are seeded.
--
-- CHECK(id=1) enforces exactly one row.
CREATE TABLE IF NOT EXISTS outreach_config (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  config_json TEXT NOT NULL,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
