---
title: "Phase 1 scope: system health page + anomaly detection"
status: scoped, awaiting Wednesday post-launch build
target_build_window: 2026-05-13 (Wednesday, after Tuesday MCP launch)
target_ship: 2026-05-15 (end of week)
authors: Claude + Lance, 2026-05-11 ~02:00 HST
related: long-term Lance-agent foundation
---

# Phase 1: System health page + anomaly detection

The thing that makes Lance step away from the day-to-day.

## What problem this solves

Tonight, 2026-05-11, we discovered three production engines had been
silently broken for an unknown duration: OpenAI out of quota (empty
rows), Claude on a dead model name (empty rows), Gemma never producing
rows (wrong model name). Nothing alerted. Discovery was happenstance
during MCP launch prep.

This pattern will keep happening. APIs change. Keys expire. Rate
limits surprise us. The current architecture has 20+ cron paths and
zero self-monitoring. Lance has no way to know if anything's broken
without manually clicking through and reading logs.

The fix is a single page that answers: **is the system actually
working right now?** Plus alerts that ping Lance when it isn't.

## What gets built

### 1. `/admin/health` page

A single-screen status board. No tabs, no scrolling. Loads in under
1 second. Reads as red/yellow/green at a glance from across the room.

**Sections, top to bottom:**

#### Citation engines (7 rows)

For each engine (Perplexity, OpenAI, Gemini, Claude, Bing, Google AIO,
Gemma):

- Status dot (green / yellow / red)
- Rows produced in last 24h
- Rows produced in last 7 days
- Empty-row percentage in last 24h (>20% = yellow, >50% = red)
- Last successful row timestamp
- One-line reason if degraded (e.g. "OpenAI: 429 quota exceeded")

Query backing this:

```sql
SELECT engine,
       COUNT(*) as runs_24h,
       SUM(CASE WHEN length(response_text) = 0 THEN 1 ELSE 0 END) as empty_24h,
       MAX(run_at) as last_run
FROM citation_runs
WHERE run_at > strftime('%s','now') - 86400
GROUP BY engine
```

#### Cron paths (the daily heartbeat)

For each scheduled task in cron.ts:

- Status dot
- Last successful run timestamp
- Expected cadence (daily / weekly / Mondays)
- "Missed last run" badge if expected_next < now - grace_window

Cron tasks to monitor:

- Daily citation runs (twice daily 6am + 5pm)
- Monday weekly snapshots
- Weekly digest emails
- Sentiment scoring backfill
- NVI runner
- Roadmap reconciler
- Audit-credit expiry sweep
- Free-tier weekly digest
- Hawaii Theatre events refresh

Storage: a `cron_runs` table (new). Each cron task INSERTs a row on
success or failure. Health page reads MAX(run_at) per task_name.

```sql
CREATE TABLE cron_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success','partial','failure')),
  ran_at INTEGER NOT NULL,
  duration_ms INTEGER,
  detail TEXT
);
CREATE INDEX idx_cron_runs_task_ranat ON cron_runs(task_name, ran_at DESC);
```

#### Workflow instances (last 24h)

Count of CitationKeywordWorkflow, ScanDomainWorkflow,
WeeklyExtrasWorkflow, SendDigestWorkflow instances. Status breakdown:
running / completed / errored.

#### External API health

Last successful and failed call per upstream API (Perplexity, OpenAI,
Anthropic, Gemini, Together, DataForSEO, Resend, Stripe, Anthropic).
Surface 4xx/5xx rates so we see quota / auth issues before they
silently break a downstream feature.

This piggybacks on the existing engine status data since most calls
flow through there. New separate tracking for Resend (email) and
Stripe (billing).

#### Pending approvals queue

How many items waiting for Lance's click, by type:

- Schema drafts awaiting approval
- Content drafts awaiting publish
- NVI reports awaiting send
- Weekly briefs awaiting approval
- Roadmap suggestions awaiting review

Each linked. One-click to its admin surface.

#### Recent admin alerts (top 5 unread)

Inlined. So Lance can clear them without leaving the page.

### 2. Anomaly detection cron

Runs daily at 7am Pacific (one hour after the morning citation cron
finishes). Compares last-24h metrics to a 14-day rolling baseline.

**Triggers an admin_alert when:**

- Engine empty-row rate jumps from <10% baseline to >30% today
- Engine row count drops below 50% of baseline
- A cron task didn't run within 2x its expected cadence
- A workflow class has >30% error rate in last 24h
- An external API returns >20% failures in last 24h

Threshold tuning happens after we see real baselines. Initial values
are conservative.

**Alert payload:**

```
{
  "type": "system_anomaly",
  "title": "Gemma: empty-row rate spiked to 67% (baseline 4%)",
  "detail": "Last known good run: 2026-05-08 06:00 HST. Most recent error log: \"model_not_available google/gemma-3-27b-it\". Investigate dashboard/src/citations.ts:67",
  "created_at": <ts>
}
```

Lance gets a same-day signal instead of finding out two weeks later.

### 3. Outbound uptime monitoring

External pinger (BetterStack free tier, or Cronitor, or even a free
GitHub Action) hits these every 5 minutes:

- `https://neverranked.com/` (200 OK)
- `https://app.neverranked.com/health-public` (returns `{ok:true}` if
  worker + D1 are reachable)
- `https://check.neverranked.com/` (200 OK)

If two consecutive checks fail, email + SMS to Lance.

The `/health-public` endpoint is new. Returns a tiny JSON with a
SELECT 1 from D1 and a current timestamp. Public so we don't have to
authenticate the monitor. No sensitive data.

### 4. Weekly summary email to lance@neverranked.com

Fires every Monday at 7am Pacific (after the weekend's cron passes
have completed). Reads the same data the health page reads, formatted
as plain text:

```
NeverRanked weekly summary -- week of 2026-05-11

System: green
Citation runs this week: 632 (down 4% from last week)
Engines all reporting: yes
Cron paths all running: yes
Outbound APIs all healthy: yes

Need your attention:
- 3 schema drafts awaiting approval (oldest: 2 days)
- 1 alert unread for 4 days
- ASB meeting Tuesday May 18

That's it.
```

## What this does NOT include (out of scope for Phase 1)

- Self-healing actions (Phase 4)
- Batch approval UI (Phase 3)
- Decision log infrastructure (toward Lance-agent, separate scope)
- Anomaly detection for non-citation features (free-tier scans, GSC
  pulls, schema deploys) -- add in iteration 2 once baselines are seen

## Build sequence (Wednesday onward)

1. Add `cron_runs` table migration. Wire INSERT into every existing
   cron task (just a one-line `await logCronRun(env, "task_name", "success")`).
   Backfill: assume any task that has run in last 24h is "healthy"
   until we have real data.
2. Build `/admin/health` page. Static rendering first, no client-side
   refresh yet. Each section is one D1 query.
3. Add `/health-public` endpoint.
4. Wire up an external uptime monitor (10 min of clicking through
   BetterStack signup).
5. Add the anomaly-detection cron. Initially writes admin_alerts only.
6. Add the weekly summary email cron (new task in cron.ts).
7. Tighten alert thresholds after one week of real baseline data.

## Estimated effort

- Iteration 1 (steps 1-4): one focused session, ~3 hours
- Iteration 2 (steps 5-7): a second session, ~2 hours
- Total: 5 hours across two sessions to ship Phase 1

## Why this is the right next thing

This is the layer between "Lance has to babysit every system" and
"Lance can build an agent on top." You can't agent-ify what you can't
measure. The health page is the measurement. The agent (eventually)
becomes a consumer of the same JSON the page renders, plus an action
layer that triggers events.

Tonight's debug session was the proof. If `/admin/health` had existed,
we'd have seen "OpenAI 100% empty, Claude 100% empty, Gemma 0 rows"
on the dashboard the morning after each of those broke. We wouldn't
have been hours into the wrong rabbit hole.

The amount of mental load this removes from Lance per week is the
real product.
