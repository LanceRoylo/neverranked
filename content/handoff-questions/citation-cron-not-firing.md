# Citation tracking autonomy gap: cron not firing + two related fixes

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

## The broader pattern: citation tracking is too manual

The cron-not-firing bug is one symptom of a deeper design gap.
Citation tracking is supposed to be the autonomous measurement
backbone of NR. In practice today, every meaningful action
requires a human clicking a button:

- New client onboarded -> human clicks "Run now" or waits up to
  7 days for the (broken) Monday cron
- Existing client's data goes stale -> nothing alerts, nothing
  retries
- Keyword list changes -> waits for next Monday
- Cron silently dies for 30 days -> only caught by Lance asking
  "why is and-scene at zero?"

The "Run now" button exists as an ops safety valve, not as a
primary workflow. The fact that 100% of citation_runs in the
last 30 days came from manual clicks means the safety valve is
the only thing keeping the data alive. That is the bug, not the
design intent.

Three related fixes turn this from manual to autonomous:

### Fix 1: Per-client workflow for runWeeklyCitations

Mirrors `SendDigestWorkflow`. Each client gets its own 1000-
subrequest budget. Dispatched from `dashboard/src/cron.ts` in a
per-client loop, the way digests are dispatched today.

Steps:

1. Create `dashboard/src/workflows/run-citations-for-client.ts`
2. Register the workflow in `dashboard/wrangler.jsonc`
3. In `dashboard/src/cron.ts`, dispatch the workflow per-client
   inside the existing Monday gate, the way digests are
   dispatched
4. Deploy and verify next Monday at 06:00 UTC + 5 minutes that
   citation_runs rows exist for all active clients

Estimated effort: 30-45 minutes of code.

### Fix 2: Auto-fire initial scan on client onboarding

When a new client is created with at least one active keyword,
queue a one-shot citation scan immediately, the same way the
admin "Run now" button does. Eliminates the up-to-7-day window
where a newly onboarded client has no data.

Hook point: wherever the client onboarding flow inserts into
`citation_keywords` (likely `dashboard/src/routes/citations.ts`
add-keyword endpoint or a higher-level onboarding handler). On
the first active keyword for a slug with no prior runs, fire
`SCAN_CITATIONS_WORKFLOW.create({ params: { slug } })`.

Estimated effort: 30 minutes including testing.

### Fix 3: Staleness alert when citation_runs is dry

Daily admin sweep that checks: for each active client with at
least one active keyword, if `MAX(run_at)` is older than 8 days,
write an admin alert. Hook into the existing
`createAlertIfFresh()` machinery in
`dashboard/src/admin-alerts.ts`. Single SQL query per sweep,
runs in the daily 06:00 UTC cron.

Without this, the cron-firing bug went unnoticed for 30+ days.
With this, any future regression surfaces within 24 hours via
the admin inbox Lance already reads daily.

Estimated effort: 20 minutes.

## Question for the other window

Would you (other Claude window) like to take any subset of
these three fixes? They live inside `dashboard/src/` which you
have been actively patching.

Order of priority:
1. The per-client workflow (Fix 1) -- highest impact, unblocks
   the weekly cron entirely
2. Staleness alert (Fix 3) -- shortest, prevents the next silent
   failure
3. Auto-fire on onboarding (Fix 2) -- closes the new-client gap

If you would prefer these stay queued, leave a note in this
file. I will not touch `dashboard/src/cron.ts`,
`dashboard/wrangler.jsonc`, or `dashboard/src/admin-alerts.ts`
without explicit handoff.
