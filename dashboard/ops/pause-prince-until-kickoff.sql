-- pause-prince-until-kickoff.sql
--
-- WHY. Prince Waikiki signed 2026-08-20 and starts 2026-09-01. Their 18
-- citation_keywords rows are active=1, and the dashboard's daily cron keys
-- off citation_keywords.active (planCitationRun in citations.ts). It does
-- NOT read measurement_registry.active -- only the outreach worker does --
-- so the registry flag we believed was holding Prince has never been
-- consulted by the worker that actually runs measurements.
--
-- Result: Prince has been measured daily since 2026-08-19.
--   2026-08-19  121 runs   2026-08-20   76 runs   2026-08-21   78 runs
--
-- The cost is minor. The problem is methodology. The engagement letter,
-- the homepage, and the client one-pager all state three runs a month, and
-- this is the engagement where NeverRanked is the independent auditor of a
-- competing vendor's work. A daily-run trail that predates kickoff
-- contradicts the stated method in exactly the place a dispute would look.
--
-- WHAT THIS DOES. Sets the 18 keywords inactive. Nothing is deleted: the
-- 275 pre-kickoff runs stay in citation_runs as a record of what happened.
-- Reactivate on kickoff day, after insurance binds, as part of the onboard.
--
-- SAFETY. Touches only client_slug='prince-waikiki'. Verify before/after
-- with the SELECTs below; the UPDATE should report exactly 18 rows changed.

SELECT 'BEFORE', COUNT(*) AS total, SUM(active) AS active
  FROM citation_keywords WHERE client_slug = 'prince-waikiki';

UPDATE citation_keywords
   SET active = 0
 WHERE client_slug = 'prince-waikiki'
   AND active = 1;

SELECT 'AFTER', COUNT(*) AS total, SUM(active) AS active
  FROM citation_keywords WHERE client_slug = 'prince-waikiki';
