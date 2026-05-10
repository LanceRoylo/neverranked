# Bug: Monday weekly citation cron has not fired in 30+ days

Discovered 2026-05-09 evening HST while investigating why the
`and-scene` client has zero `citation_runs` despite being onboarded
2026-05-02 with five active keywords.

## Evidence

Time-of-day distribution of `citation_runs` over the last 30 days:

| Day (UTC) | Time | Runs | Likely source |
|---|---|---|---|
| 2026-04-28 (Tue) | 19:51, 20:29, 21:07 | 50, 58, 100 | Manual admin trigger |
| 2026-04-29 (Wed) | 08:55, 09:30, 10:16 | 114, 152, 126 | Manual admin trigger |
| 2026-04-14 (Tue) | 10:40 | 53 | Manual admin trigger |
| 2026-05-04 (Mon) | 02:18 | 42 | Not the 06:00 UTC cron |
| 2026-05-10 (Sun) | 08:15 | 2 | Manual probe |

The dashboard's scheduled triggers are at 06:00 UTC and 17:00 UTC
daily (per `wrangler.jsonc`), and Monday is the gate for
`WEEKLY_EXTRAS_WORKFLOW.create()` per `dashboard/src/cron.ts`. None
of the run timestamps above are on a Monday at 06:00 UTC. Every
recorded `citation_runs` row appears to be from a manual admin
trigger (`POST /admin/citations/<slug>/run`) or the workflow being
fired off-schedule.

## Impact

- `and-scene` (client_slug, owned by Lance) has 5 active keywords
  in `citation_keywords` since 2026-05-02 and zero `citation_runs`.
- `neverranked` itself has 15 active keywords; last `citation_runs`
  insert was a 2-row manual probe on 2026-05-10 at 08:15 UTC.
- `hawaii-theatre` has 14 active keywords; last cron-window-shaped
  batch was 42 runs on 2026-05-04 at 02:18 UTC, hours before the
  Monday cron window.

The State of AEO weekly report runs the regen via GitHub Actions,
which queries production D1. So the report has been built on
manual-trigger data this whole time, which means the apparent
shape of "weekly cadence" in the public reports is misleading,
the data is whatever Lance manually triggered most recently.

## Likely root causes (need verification)

Order most likely first:

1. **Subrequest budget exhaustion mid-loop.** `runWeeklyCitations`
   iterates all clients in one workflow invocation. The codebase
   already documented this exact failure mode for the digest
   sender: see comment in `dashboard/src/workflows/send-digest.ts`
   ("one user with 10 domains generates ~150 queries; 7 users
   blew through 1000 mid-loop, so users 5-7 never received a
   digest"). The fix pattern is in-tree: per-client workflow
   instances dispatched from `cron.ts` so each gets a fresh
   1000-subrequest budget.
2. **Cron not registered correctly on the deployed worker.** Less
   likely (other crons appear to fire), but verifiable via
   Cloudflare dashboard cron logs.
3. **`WEEKLY_EXTRAS_WORKFLOW.create()` failing silently.** The
   cron handler dispatches the workflow, but if the dispatch
   throws inside `ctx.waitUntil(...)`, the error may not surface
   in any channel that's monitored.

## Recommended fix

Mirror the `SendDigestWorkflow` pattern. New file:
`dashboard/src/workflows/run-citations-for-client.ts`,
single-client scope, dispatched from `cron.ts` in a per-client
loop similar to the digest fanout. The workflow does what
`runWeeklyCitations(env, slug)` already does for the admin
"Run now" button (the function already accepts a `slugFilter`,
no API change needed). Each client gets its own 1000-subrequest
budget. Workflow registered in `wrangler.jsonc` like the others.

Estimated effort: 30-45 minutes of code changes plus a Monday
verification cycle.

## Immediate workaround

Lance manually triggers `POST /admin/citations/and-scene/run`
from the admin UI to backfill the and-scene baseline. Then
manually triggers `neverranked` and `hawaii-theatre` if their
data is needed before the underlying fix lands.

## Question for the other window

Would you (other Claude window) like to take this fix? It lives
inside `dashboard/src/` which you have been actively patching.
If yes, the steps are:

1. Create `dashboard/src/workflows/run-citations-for-client.ts`
2. Register the workflow in `dashboard/wrangler.jsonc`
3. In `dashboard/src/cron.ts`, dispatch the workflow per-client
   inside the existing Monday gate, the way digests are
   dispatched
4. Deploy and verify next Monday at 06:00 UTC + 5 minutes that
   `citation_runs` rows exist for all three clients

If you would prefer this stay queued for me, leave a note in this
file. I will not touch `dashboard/src/cron.ts` or
`dashboard/wrangler.jsonc` without explicit handoff.
