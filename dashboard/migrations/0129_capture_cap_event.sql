-- The stored-answer cap rose from 4,000 to 12,000 characters at the deploy of
-- 2026-09-16 10:25 UTC (answer-presence.ts RESPONSE_TEXT_CAP_RAISED_AT). At
-- 4,000, 64% of ChatGPT answers were cut, so whether an answer NAMES the client
-- was under-read before this instant and fully read after it. September holds
-- both regimes, October only the new one, so any month-over-month NAMED-rate
-- comparison across it partly measures us.
--
-- It does NOT touch citation counts: client_cited comes from structured
-- citations and entities, not the stored text. compare-periods sets this kind
-- aside for citation comparisons with that reason, and a presence comparison
-- must not.
--
-- Found 2026-10-05 in the September readout's own note ("we have since
-- increased how much of each answer we keep"), which disclosed it to the client
-- while nothing recorded it for the comparison layer.
INSERT OR IGNORE INTO instrument_events
  (occurred_at, detected_at, kind, scope, engine, client_slug, detail, source, created_at)
VALUES
  (1789554300, CAST(strftime('%s','2026-10-05') AS INTEGER),
   'response_capture_changed', 'global', NULL, NULL,
   'Stored answer cap raised from 4,000 to 12,000 characters. At 4,000, 64% of ChatGPT answers were truncated, so named-in-answer rates before this instant are under-read. Affects text-based measures (whether an answer names the client) only, not citation counts.',
   'migration', unixepoch());
