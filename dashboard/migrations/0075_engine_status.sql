-- Engine self-healing status tracking. Phase 4.
--
-- Tracks per-engine health state with full audit history. Every status
-- transition writes a new row, so we can answer "when did this engine
-- start being broken" and "did it auto-recover or did Lance disable it"
-- from the same table.
--
-- Status meanings:
--   active   -- engine is producing valid responses, run normally
--   degraded -- engine is in a persistently-broken state (>40% empty
--               responses over 7+ days). Cron still calls it (we want
--               to detect recovery), but it's flagged loudly in the
--               health page and an admin_alert is raised. Self-healing:
--               when empty rate drops below 20% in last 24h, the engine
--               auto-transitions back to active.
--   disabled -- Lance manually paused this engine to stop wasting
--               quota. Cron SKIPS calling it. Only re-enabled by Lance
--               clicking the "re-enable" button.
--
-- The "current" status for an engine is the row with the most recent
-- changed_at. Older rows are the audit trail.

CREATE TABLE IF NOT EXISTS engine_status (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  engine      TEXT NOT NULL,
  status      TEXT NOT NULL CHECK(status IN ('active','degraded','disabled')),
  reason      TEXT,
  changed_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_engine_status_engine_changed ON engine_status(engine, changed_at DESC);
CREATE INDEX idx_engine_status_changed ON engine_status(changed_at DESC);

-- Seed all known engines as 'active' on day one. The first run of
-- engine_health_check will transition any persistently-broken engine
-- to 'degraded' based on actual data.
INSERT INTO engine_status (engine, status, reason, changed_at) VALUES
  ('perplexity',         'active', 'initial seed', unixepoch()),
  ('openai',             'active', 'initial seed', unixepoch()),
  ('gemini',             'active', 'initial seed', unixepoch()),
  ('anthropic',          'active', 'initial seed', unixepoch()),
  ('bing',               'active', 'initial seed', unixepoch()),
  ('google_ai_overview', 'active', 'initial seed', unixepoch()),
  ('gemma',              'active', 'initial seed', unixepoch());
