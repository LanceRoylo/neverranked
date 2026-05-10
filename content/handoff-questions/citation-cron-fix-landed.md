# Citation cron fix landed -- handoff back to parallel session

**Status:** Shipped on main as `ca719b3` 2026-05-10 ~02:30 HST.
**Author:** Claude Code (the in-flight session you handed off to).
**Closes:** `citation-cron-not-firing.md`. Likely unblocks two of the
three threads in `autonomy-audit-2026-05-09.md` (see "free wins"
below).

## What landed

Architecture went one level finer than your recommendation. You
suggested per-client workflow instances; I shipped per-(client,
keyword) instances. Same pattern, smaller blast radius per
invocation.

- New `dashboard/src/workflows/citation-keyword.ts` -- single
  (client, keyword) tuple per workflow instance. Each gets a fresh
  1000-subrequest budget.
- `WeeklyExtrasWorkflow` is now snapshot/alerts/GSC/backup only.
  No more per-keyword work inside it. Reads citation_runs from
  the prior `lookbackDays` (param) instead of holding state across
  step boundaries.
- Daily cron in `runDailyTasks` dispatches N `CitationKeywordWorkflow`
  instances (one per active keyword across all clients) every 06:00
  UTC. Mondays additionally dispatch `WeeklyExtrasWorkflow` for the
  7-day snapshot rollup + GSC + backup.
- `runWeeklyScans` (Monday-only) no longer dispatches WeeklyExtras
  -- daily path handles it. Avoids double-dispatch on Mondays.
- Sampling cadence flipped from 3 weekly → 1 daily = 7 samples/
  week per (keyword, engine). More stable, smaller per-step CPU
  footprint.
- `engines_breakdown` aggregator in snapshots now includes `bing`
  + `google_ai_overview`. Was hardcoded to the 4 LLM engines, so
  even when DataForSEO rows landed they were invisible in dashboards
  and digest emails. Confirmed snapshot row from tonight's manual
  run shows all 6 engines present.
- Manual "Run citation scan now" button uses the same fan-out
  pattern. Plus `lookbackDays=1` snapshot at the end for fresh
  same-day feedback.
- Per-keyword "Run" buttons in admin UI for triage/demo. Plus
  immediate UI state feedback ("Starting scan..." / "Scan
  running...") since the previous version had no signal that the
  POST went through.

## Why per-keyword instead of per-client

Your filing was right that subrequest exhaustion was the cause.
Empirical confirmation from a per-keyword-as-steps attempt
(instance 3bf7120b 2026-05-10): kw 9 wrote 6 rows in 12s, kw 10
wrote 6 rows in 21s, then kw 11-15 each "succeeded" with 0
rows in 0 seconds because every fetch() inside `Promise.allSettled`
was throwing "Too many subrequests" silently and the closure
returned without re-raising.

Per-client (your suggestion) probably works too -- 5-15 keywords
× 6 engines × ~5-10 internal subrequests each could theoretically
exhaust the per-client 1000 budget on a 15-keyword client.
Per-keyword caps each instance at ~50-100 subrequests. Safer,
small dispatcher overhead trade.

## Verification

Tonight on neverranked slug:

- 89 of 90 expected rows landed (15 keywords × 6 engines × 1 run,
  minus 1 AIO non-render which is normal).
- Snapshot row written at 2026-05-10 10:24 UTC, `total_queries=150`
  (lookback=1 picked up earlier same-day test runs too),
  `engines_breakdown` shows all 6 engine keys populating.
- All citation counts are 0/150 -- expected, neverranked is too
  new to be cited for these queries. Demo proves measurement,
  not citation rate.

Production smoke test result captured in commit message.

## Heartbeat expectations

The next 12:00 UTC heartbeat run after the 06:00 UTC cron should
show:

- `keyword-completion` invariant: FAIL → OK across all 3 tracked
  clients (was 14-20%, will be ~100%)
- `engine-coverage` invariant: FAIL → OK (was 0 bing/aio rows
  per week from cron, will be 7/week per keyword now)
- State of AEO public report's data-integrity banner clears
  automatically on next regen

If any of those don't flip on schedule, ping me back here.

## Likely free wins (untested)

Two threads in `autonomy-audit-2026-05-09.md` shared the
`WeeklyExtrasWorkflow` subrequest budget that citations was
exhausting. With citations no longer running inside that workflow:

1. **GSC pull (29 days dead).** Now isolated. Should run cleanly
   on Mondays at 06:00 UTC. Watch the next Monday cron.
2. **Weekly digest fanout (12 days dead).** Already in its own
   `SendDigestWorkflow` per user, but the cron handler was also
   sharing budget. Cleaner now. Next Monday will tell us.

Did NOT explicitly touch either path. If they don't recover with
the citations work alone, they'll need their own targeted fixes.

## What I did NOT touch (your zone)

- `dashboard/src/state-of-aeo.ts` -- kept your import in cron.ts
  and the optional param threading in email.ts intact.
- `audits/asb-hawaii-2026-05/`, `content/asb-mvnp-*` -- meeting
  prep, locked, untouched.
- `mcp-server/` -- still at v0.1.2 on npm + registry. The parallel
  Claude correctly noted my v0.1.2 ship in the heartbeat. Nothing
  in this fix touches MCP code paths -- the MCP exposes `aeo_scan`,
  `llms_txt_check`, `agent_readiness_check`, none of which call
  the citation infrastructure. Public claims about the MCP remain
  defensible.

## Open from my side, not blocking

- Banner copy "Takes 2-4 minutes" was deployed reflecting the
  parallel-instance dispatch reality. Earlier copies said 7-10 or
  3-5; cleaned up.
- dist/* artifacts in my working tree are stale (modified locally
  on top of origin/main) -- left alone, they'll regenerate next
  site build. If you do a build pass, mine will get overwritten
  cleanly.
- Per-keyword "Run" admin UI button color/treatment polish is
  fine but not great. Lance flagged the ugliness. Real polish
  pass deferred to post-May-18.

## One thing for Lance

Confirm `CLOUDFLARE_ACCOUNT_ID` repo secret exists for
`daily-heartbeat.yml`. The `weekly-state-of-aeo.yml` workflow
runs successfully so it's probably already there, but worth a
glance at GitHub repo settings → Secrets to confirm.

---

Author note: this was a long debug session. Three failed attempts
(parallelize engines, per-keyword steps, slug-filtered single
workflow) before the per-instance pattern worked. All three are
documented inline in `dashboard/src/workflows/weekly-extras.ts`
and `dashboard/src/workflows/citation-keyword.ts` with empirical
evidence (instance IDs, row counts, durations) so the next time
someone hits a "Workflows succeed silently with no rows" symptom,
they have a starting point.
