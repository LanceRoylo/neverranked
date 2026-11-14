-- From the sweep of 2026-12-01 UTC, a Google AI Overview call that DataForSEO
-- refuses transiently is asked again 10 and 30 minutes later instead of being
-- recorded as a failure. That recovers readings the old method lost, so run
-- counts on this surface rise. "We changed the adapter" is discoverable from
-- nothing else (see 0126), and the step detector needs a far larger move.
--
-- Dated to the start of the month on purpose. November stays wholly on the old
-- method and December wholly on the new, so October against November is clean,
-- November against December is withheld for this surface, and December against
-- January is clean again: loadInstrumentEvents excludes an event at exactly the
-- start of the span.
INSERT OR IGNORE INTO instrument_events (occurred_at, kind, scope, engine, client_slug, detail, source)
VALUES (
  1796083200,
  'engine_adapter_changed',
  'engine',
  'google_ai_overview',
  NULL,
  'Transient DataForSEO failures are retried 10 and 30 minutes later inside the keyword workflow, so readings the old method lost are now recovered.',
  'migration'
);
