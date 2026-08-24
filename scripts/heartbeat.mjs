#!/usr/bin/env node
'use strict';

/**
 * scripts/heartbeat.mjs
 *
 * Autonomy heartbeat for NeverRanked. Queries production D1 for the
 * latest activity timestamp in each critical automation table,
 * compares against the expected cadence, and reports OK / STALE per
 * check. Non-zero exit code if anything is stale, so CI / cron
 * runners can detect failure without parsing output.
 *
 * Why this exists: the 2026-05-09 audit discovered that the Monday
 * weekly citation cron had not fired in 30+ days and nobody noticed
 * until Lance asked "why is and-scene at zero?" Two more silent
 * crons (digest fanout, GSC pull) surfaced once we looked. A
 * standalone heartbeat that runs from independent infrastructure
 * (GitHub Actions, not the dashboard cron) catches the next silent
 * failure within 24 hours.
 *
 * Dependencies: wrangler CLI on PATH, with CLOUDFLARE_API_TOKEN +
 * CLOUDFLARE_ACCOUNT_ID set in env (CI provides via secrets).
 *
 * Usage:
 *   node scripts/heartbeat.mjs                  -- pretty output
 *   node scripts/heartbeat.mjs --json           -- machine-readable
 *   node scripts/heartbeat.mjs --silent-on-ok   -- only print stale
 *
 * Exit codes:
 *   0 -- all checks healthy
 *   1 -- one or more checks stale
 *   2 -- usage / runtime error
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DASHBOARD_DIR = resolve(REPO_ROOT, 'dashboard');
const DB_NAME = 'neverranked-app';

// -----------------------------------------------------------------
// Args
// -----------------------------------------------------------------

const args = {
  json: process.argv.includes('--json'),
  silentOnOk: process.argv.includes('--silent-on-ok'),
  logToFile: process.argv.includes('--log-to-file'),
};

// -----------------------------------------------------------------
// D1 query helper -- same pattern as state-of-aeo-generate.mjs
// -----------------------------------------------------------------

function runD1(sql) {
  const cmd = ['wrangler', 'd1', 'execute', DB_NAME, '--remote', '--json', '--command', sql];
  const res = spawnSync(cmd[0], cmd.slice(1), { cwd: DASHBOARD_DIR, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  if (res.status !== 0) {
    throw new Error(`wrangler d1 execute failed: ${res.stderr || res.stdout}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(res.stdout);
  } catch (err) {
    throw new Error(`wrangler returned non-JSON: ${res.stdout.slice(0, 300)}`);
  }
  const env = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!env.success) throw new Error(`D1 query failed: ${JSON.stringify(env.errors || env)}`);
  return env.results || [];
}

// -----------------------------------------------------------------
// Checks
// -----------------------------------------------------------------

/**
 * Each check declares: a friendly name, the SQL query that returns
 * { latest: <unix epoch> } for the most recent activity, the maximum
 * acceptable age (in seconds), and a description of what the check
 * is verifying. The runner queries each check, computes age, and
 * classifies as OK / STALE / EMPTY.
 */
const CHECKS = [
  {
    name: 'citation_runs',
    description: 'Weekly citation tracking (Monday cron + admin "Run now")',
    sql: `SELECT MAX(run_at) as latest FROM citation_runs`,
    maxAgeSec: 8 * 86400, // weekly + 1 day grace
    cadence: 'weekly',
  },
  {
    name: 'scan_results',
    description: 'Per-domain weekly scans (Monday SCAN_DOMAIN_WORKFLOW)',
    sql: `SELECT MAX(scanned_at) as latest FROM scan_results`,
    maxAgeSec: 8 * 86400,
    cadence: 'weekly',
  },
  {
    name: 'email_log/digest',
    description: 'Weekly customer digest actually DELIVERED (Monday SEND_DIGEST_WORKFLOW)',
    // Repointed 2026-07-27 from email_log to email_delivery_log, and
    // narrowed to status='queued'. The digest path logs via
    // logEmailDelivery() into email_delivery_log; email_log is the older
    // table that now only receives magic_link and onboarding_drip. More
    // importantly, counting ANY digest row would count the 51 failures
    // recorded since 2026-05-11 as evidence the digest works. Only a
    // handoff Resend accepted counts.
    //
    // This check is a TRUE positive today and is expected to stay red
    // until the digest sends again. It is the one red that should not be
    // silenced: three real Hawaii Theatre recipients have had nothing
    // since 2026-05-11.
    sql: `SELECT MAX(created_at) as latest FROM email_delivery_log WHERE type='digest' AND status='queued'`,
    maxAgeSec: 8 * 86400,
    cadence: 'weekly',
  },
  {
    name: 'gsc_snapshots',
    description: 'Google Search Console pull (Monday WeeklyExtrasWorkflow.gsc-pull)',
    // MEASURES date_end, NOT created_at: how fresh the DATA is, not when the
    // job last ran. That is the right thing to measure and it is why the
    // threshold cannot be 8 days.
    //
    // Google Search Console reports lag 2-3 days behind real time, so the
    // freshest date_end this pull can ever produce is already 2-3 days old on
    // the Monday it lands. It then ages another 7 before the next run. Worst
    // case is 3 + 7 = 10 days on a completely healthy system.
    //
    // At 8 days it fired 2026-08-08 against a job that had run correctly on
    // Monday 2026-08-03 and pulled everything Google had (through 07-31).
    // A guard that alarms every Friday on correct behaviour stops being read,
    // and then it cannot report the week something is actually wrong.
    //
    // 12 days clears the healthy worst case with two days to spare and still
    // catches a genuinely missed Monday, which would reach 17.
    sql: `SELECT CAST(strftime('%s', MAX(date_end)) AS INTEGER) as latest FROM gsc_snapshots`,
    maxAgeSec: 12 * 86400,
    cadence: 'weekly',
  },
  {
    name: 'roadmap_items',
    description: 'Roadmap items writes (citation-gap and manual)',
    sql: `SELECT MAX(created_at) as latest FROM roadmap_items`,
    maxAgeSec: 36 * 3600, // daily expected
    cadence: 'daily',
  },
  {
    name: 'admin_alerts',
    description: 'Admin alert sweeps (regression, drift, low-queue, etc.)',
    sql: `SELECT MAX(created_at) as latest FROM admin_alerts`,
    maxAgeSec: 8 * 86400, // weekly is the minimum we expect
    cadence: 'weekly',
  },
  // RETIRED 2026-07-27: email_log/all.
  //
  // It asserted "some email was sent in the last 36 hours" as a proxy for
  // "the email system is alive". But the dominant contributor to that
  // table is magic_link, which only writes when Lance logs in. On
  // 2026-07-27 it read STALE at 20 days for exactly that reason: he had
  // not logged in since 2026-07-07. A monitor that goes red because the
  // founder was busy is measuring the founder, not the automation.
  //
  // The real signal it was reaching for is now covered better and in two
  // places. email_log/digest above watches actual accepted deliveries, and
  // the heartbeat's own alert path is a live Resend canary: if Resend
  // stops accepting mail, the notification fails and writes NOT SENT into
  // the git-tracked autonomy log rather than passing silently.
];

// -----------------------------------------------------------------
// Invariant checks: go beyond "did anything happen?" and verify
// system-level promises are upheld. These are the checks that catch
// the partial-completion bug (the cron fired, rows landed, but only
// 14% of the active keyword set actually got queried).
//
// Each invariant returns { pass, detail }. pass=false flips the
// overall heartbeat to non-zero exit just like a stale check.
// -----------------------------------------------------------------

const INVARIANTS = [
  {
    name: 'keyword-completion',
    description: 'Every active keyword older than the grace window should have a citation_run in the last 8 days',
    run: () => {
      // The 48h grace window is load-bearing, not a fudge factor.
      //
      // The keyword auto-expander runs AFTER the measurement job on the
      // same Monday morning: on 2026-07-27 the run was 06:01:08 and three
      // new and-scene keywords were created 06:08:18, seven minutes later.
      // Identical pattern on 2026-07-20 (created 06:07:17; those keywords
      // now carry 46-65 runs each). A keyword born minutes after a run
      // legitimately has zero runs until the next one.
      //
      // Without the grace window this check reported and-scene 10/13 (77%)
      // and failed the 80% threshold every Monday, recovering every
      // Tuesday. Harmless while nobody read the output. Now that failures
      // email on transition, it would have produced a "1 new failure"
      // message every Monday and a "1 recovered" every Tuesday, in
      // perpetuity, which is how an alert channel becomes noise and then
      // becomes ignored. That is the failure mode this whole heartbeat
      // exists to prevent, so the check has to be right about what counts
      // as broken.
      const rows = runD1(`
        SELECT k.client_slug,
               COUNT(DISTINCT k.id) as active_kw,
               COUNT(DISTINCT CASE WHEN r.run_at > unixepoch() - 8*86400 THEN k.id END) as kw_with_runs
        FROM citation_keywords k
        LEFT JOIN citation_runs r ON r.keyword_id = k.id
        WHERE k.active = 1
          AND k.created_at < unixepoch() - 2*86400
        GROUP BY k.client_slug
        HAVING active_kw > 0
      `);
      const failing = rows
        .map(r => ({ ...r, pct: r.active_kw > 0 ? Math.round((r.kw_with_runs / r.active_kw) * 100) : 0 }))
        .filter(r => r.pct < 80);
      if (failing.length === 0) return { pass: true, detail: `${rows.length} clients all >= 80% complete` };
      return {
        pass: false,
        detail: failing
          .map(r => `${r.client_slug} ${r.kw_with_runs}/${r.active_kw} (${r.pct}%)`)
          .join(', '),
      };
    },
  },
  {
    name: 'engine-coverage',
    description: 'Every active citation engine should have USABLE runs (non-empty responses) in the last 8 days',
    run: () => {
      // "Usable" is the load-bearing word. The OpenAI account ran out
      // of credits on 2026-07-24 and the worker kept writing rows with
      // empty response_text for nine days -- 330 of them -- while this
      // check counted rows and reported "7 engines active". A row is
      // evidence a call was attempted; only a response is evidence the
      // engine measured anything. Same disease as digest-dispatch's
      // old "dispatched=8/8": activity mistaken for outcome. The
      // 5-char floor matches the diagnostic that found the dead rows;
      // no genuine engine answer is shorter.
      const rows = runD1(`
        SELECT engine,
               COUNT(*) as runs,
               SUM(CASE WHEN LENGTH(COALESCE(response_text,'')) >= 5 THEN 1 ELSE 0 END) as usable
        FROM citation_runs
        WHERE run_at > unixepoch() - 8*86400
        GROUP BY engine
      `);
      const expected = ['perplexity', 'openai', 'gemini', 'anthropic'];
      const usableBy = new Map(rows.map(r => [r.engine, Number(r.usable) || 0]));
      const dead = expected.filter(e => (usableBy.get(e) ?? 0) === 0);
      // An engine writing rows but zero usable responses is the worst
      // case: it looks alive to every row-count query. Name it as such.
      const zombie = dead.filter(e => (rows.find(r => r.engine === e)?.runs ?? 0) > 0);
      if (dead.length === 0) {
        const live = rows.filter(r => Number(r.usable) > 0).length;
        return { pass: true, detail: `${live} engines returning usable responses` };
      }
      const parts = dead.map(e => zombie.includes(e)
        ? `${e} (writing rows but every response empty -- dead key or spent quota)`
        : `${e} (no runs at all)`);
      return { pass: false, detail: parts.join(', ') };
    },
  },
  {
    // Nightly outreach prep (outreach worker, 02:00 HST weekdays) acquires
    // prospects, finds emails, and writes + grades copy. It never sends.
    // Without this check it is exactly the failure the 2026-07-27 dig was
    // about: a background job whose silence looks identical to a quiet
    // week. An empty review queue every morning is indistinguishable from
    // a dead cron unless something watches.
    //
    // Skipped entirely when prep is off, so turning it off is not a red.
    name: 'nightly-prep',
    description: 'Nightly outreach prep must have run recently and left drafts to review',
    run: () => {
      const cfgRow = runD1(`SELECT config_json FROM outreach_config WHERE id = 1`)[0];
      let cfg = {};
      try { cfg = JSON.parse(cfgRow?.config_json || '{}'); } catch { /* treat as off */ }
      if (!cfg.nightly_prep_enabled) return { pass: true, detail: 'nightly prep is off' };
      const row = runD1(`
        SELECT status, detail, ran_at,
               CAST((unixepoch() - ran_at) / 86400 AS INT) AS age_days
        FROM cron_runs
        WHERE task_name = 'nightly-prep'
        ORDER BY ran_at DESC
        LIMIT 1
      `)[0];
      if (!row) return { pass: false, detail: 'nightly prep is enabled but has never run' };
      // Weekday job: a healthy latest run is <= 4 days old (covers a long weekend).
      if (row.age_days > 4) {
        return { pass: false, detail: `last prep run was ${row.age_days}d ago (${row.detail || 'no detail'})` };
      }
      if (row.status !== 'success') {
        return { pass: false, detail: `last prep run left nothing to review: ${row.detail || 'no detail'}` };
      }
      return { pass: true, detail: `${row.age_days}d ago, ${row.detail || 'ok'}` };
    },
  },
  {
    // EMAIL_GLOBAL_PAUSE suppresses every non-auth send and, by design,
    // "reports a synthetic success so callers neither retry nor raise
    // admin alerts". That is the single most dangerous behaviour in the
    // stack: a deliberate 2026-05-18 pause was still on 2026-08-23, three
    // months later, and the only reason it surfaced was a human reading a
    // delivery log by hand. Pauses are legitimate. SILENT pauses are not.
    //
    // Detects the pause by its EFFECT (suppressed rows) rather than by
    // reading the secret, so it cannot be fooled by a stale config, a
    // second worker, or someone setting the flag somewhere else.
    name: 'email-pause-active',
    description: 'No client email may be silently suppressed -- a pause must announce itself daily',
    run: () => {
      // Reads the MOST RECENT attempt, not "any suppression in 8 days".
      // The first version of this check used an 8-day window and so stayed
      // red for a week after a CORRECT lift (observed 2026-08-24: pause
      // lifted 18:56 UTC, check still failing on 06:15 rows from before
      // it). An alarm that keeps firing after the fix is its own cry-wolf.
      // The live question is only ever: was the last thing we tried to
      // send suppressed?
      const row = runD1(`
        SELECT status,
               date(created_at, 'unixepoch') AS on_date,
               CAST((unixepoch() - created_at) / 86400 AS INT) AS age_days
        FROM email_delivery_log
        ORDER BY created_at DESC
        LIMIT 1
      `)[0];
      if (!row) return { pass: true, detail: 'no send attempts logged yet' };
      if (row.status !== 'suppressed') {
        return { pass: true, detail: `latest attempt ${row.on_date} was '${row.status}' -- not suppressed, pause is off` };
      }
      return {
        pass: false,
        detail: `latest send attempt (${row.on_date}, ${row.age_days}d ago) was SUPPRESSED -- EMAIL_GLOBAL_PAUSE is ON. Clients receive nothing and every send logs as success. Lift: cd dashboard && wrangler secret delete EMAIL_GLOBAL_PAUSE`,
      };
    },
  },
  {
    // Reads the authoritative cron_runs row written by
    // dispatchWeeklyDeliveries(), NOT an 8-day email_log window. The old
    // window-based check could be masked for a full week by a single
    // manual /admin/digest/test fire -- which is why a dead cron read
    // "63% OK" for ~12 days. A manual test-fire does not write a
    // digest_dispatch cron_run, so it can no longer hide a failure.
    name: 'digest-dispatch-result',
    description: 'Latest digest_dispatch cron run must be a recent success (weekly Monday job)',
    run: () => {
      const opted = runD1(`SELECT COUNT(*) as n FROM users WHERE email_digest = 1`)[0]?.n || 0;
      if (opted === 0) return { pass: true, detail: 'no opted-in users' };
      const row = runD1(`
        SELECT status, detail, ran_at,
               CAST((unixepoch() - ran_at) / 86400 AS INT) AS age_days
        FROM cron_runs
        WHERE task_name = 'digest_dispatch'
        ORDER BY ran_at DESC
        LIMIT 1
      `)[0];
      if (!row) {
        return { pass: false, detail: 'digest_dispatch has never run (opted-in users exist)' };
      }
      // Weekly Monday job: a healthy latest run is <= 8 days old.
      if (row.age_days > 8) {
        return { pass: false, detail: `last digest_dispatch ${row.age_days}d ago (status=${row.status}) -- weekly job missed` };
      }
      if (row.status !== 'success') {
        return { pass: false, detail: `last digest_dispatch status=${row.status} (${row.detail || 'no detail'})` };
      }
      return { pass: true, detail: `last run ${row.age_days}d ago, success (${row.detail || ''})` };
    },
  },
  {
    name: 'gsc-coverage-per-client',
    description: 'Every active client with gsc_property should have a snapshot in the last 12 days',
    run: () => {
      const rows = runD1(`
        SELECT g.client_slug,
               MAX(g.date_end) as latest_snapshot
        FROM gsc_snapshots g
        GROUP BY g.client_slug
      `);
      // Note: not all clients have GSC connected; this check measures
      // freshness across the slugs that have ever produced a snapshot.
      // A separate check would need to read the GSC connection table
      // to find clients that SHOULD have data but don't.
      // 12 days, not 8. The GSC job runs WEEKLY (Sundays ~06:06 UTC) and
      // Search Console data always lags 3 days, so date_end ages from 3 days
      // old right after a run to 10 just before the next one. An 8-day
      // threshold therefore FAILS every week for the day or two before the
      // Sunday run, then heals itself when the job fires -- verified
      // 2026-08-23, which alerted at 02:53 on Aug-14 data and was fixed by
      // the 20:06 run writing Aug-21. A monitor that cries wolf on schedule
      // trains you to skim the emails that matter, which is how the
      // 2026-08-21 engine outage stayed hidden for two days. 7-day cadence
      // + 3-day lag + 2-day buffer. One genuinely missed week still trips
      // it (data would be 17 days old).
      const cutoff = new Date(Date.now() - 12 * 86400 * 1000).toISOString().slice(0, 10);
      const stale = rows.filter(r => r.latest_snapshot < cutoff);
      if (stale.length === 0 && rows.length > 0) {
        return { pass: true, detail: `${rows.length} clients all fresh` };
      }
      if (rows.length === 0) {
        return { pass: false, detail: 'no GSC snapshots ever recorded for any client' };
      }
      return {
        pass: false,
        detail: stale.map(r => `${r.client_slug} last ${r.latest_snapshot}`).join(', '),
      };
    },
  },
];

// -----------------------------------------------------------------
// Run checks
// -----------------------------------------------------------------

function fmtAge(seconds) {
  if (seconds === null || seconds === undefined) return 'never';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function fmtMaxAge(seconds) {
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

const nowSec = Math.floor(Date.now() / 1000);
const results = [];

// Staleness checks
for (const check of CHECKS) {
  let row, err;
  try {
    [row] = runD1(check.sql);
  } catch (e) {
    err = e.message;
  }

  const latest = row && row.latest != null ? Number(row.latest) : null;
  const ageSec = latest !== null ? nowSec - latest : null;

  let status;
  if (err) status = 'ERROR';
  else if (latest === null) status = 'EMPTY';
  else if (ageSec > check.maxAgeSec) status = 'STALE';
  else status = 'OK';

  results.push({
    kind: 'staleness',
    name: check.name,
    description: check.description,
    cadence: check.cadence,
    status,
    latestUnix: latest,
    ageSec,
    maxAgeSec: check.maxAgeSec,
    error: err || null,
  });
}

// HTTP checks: external surfaces NeverRanked promises to keep alive.
// Independent of D1 (lower-blast-radius failures: marketing site
// outage, npm registry outage, public latest.json out of date).
const HTTP_CHECKS = [
  {
    name: 'marketing-site',
    description: 'neverranked.com homepage returns 200',
    url: 'https://neverranked.com/',
    expectStatus: 200,
  },
  // REMOVED 2026-07-27: state-of-aeo-latest.
  //
  // It reported FAIL every day from 2026-05-21, 67 consecutive days, and it
  // was right that the URL 404s. But the URL 404s on purpose: the
  // State of AEO web surface was retired 2026-07-01 with a 301 map to
  // /teardowns/ (see _redirects and the pruned DIRS list in
  // scripts/build.sh). Verified 2026-07-27 that /state-of-aeo/ and the
  // dated permalinks all 301 correctly and land 200, so no visitor is
  // broken. Only latest.json 404s, and the only thing that ever requested
  // it was this check plus the digest block, both now retired.
  //
  // Keeping a check on a deliberately-retired surface is worse than
  // useless. It is what made this monitor red every single day of its
  // life, and a monitor that is always red trains the operator to ignore
  // it -- which is precisely how 79 real alerts went unread.
  {
    // ADDED 2026-08-10. Between the BetterStack cancellation and this
    // check, NOTHING watched app.neverranked.com -- the surface that
    // serves every client readout, the login and the review console.
    // The /health-public endpoint has existed the whole time for exactly
    // this purpose and had no caller. A guard with no notification path
    // is not shipped.
    //
    // Deliberately asserts the BODY, not just the status. The Worker can
    // return 200 while D1 is unreachable behind it, and a readout with no
    // data is the failure that actually costs a client.
    name: 'app-dashboard',
    description: 'app.neverranked.com reachable and D1 responding',
    url: 'https://app.neverranked.com/health-public',
    expectStatus: 200,
    validate: async (res) => {
      try {
        const json = await res.json();
        if (json.ok !== true) {
          return { ok: false, detail: `health-public reports ok=${JSON.stringify(json.ok)} (${JSON.stringify(json).slice(0, 120)})` };
        }
        return { ok: true, detail: 'worker + D1 healthy' };
      } catch (e) {
        return { ok: false, detail: `health-public returned unparseable body: ${e.message}` };
      }
    },
  },
  {
    name: 'mcp-npm-package',
    description: '@neverranked/mcp present in npm registry',
    url: 'https://registry.npmjs.org/@neverranked/mcp',
    expectStatus: 200,
    validate: async (res) => {
      try {
        const json = await res.json();
        const latest = json['dist-tags']?.latest;
        if (!latest) return { ok: false, detail: 'no dist-tags.latest in registry response' };
        return { ok: true, detail: `latest version ${latest}` };
      } catch (e) {
        return { ok: false, detail: `parse failed: ${e.message}` };
      }
    },
  },
];

// Invariant checks
const invariantResults = [];
for (const inv of INVARIANTS) {
  let res, err;
  try {
    res = inv.run();
  } catch (e) {
    err = e.message;
  }
  let status;
  if (err) status = 'ERROR';
  else if (res.pass) status = 'OK';
  else status = 'FAIL';
  invariantResults.push({
    kind: 'invariant',
    name: inv.name,
    description: inv.description,
    status,
    detail: res?.detail || null,
    error: err || null,
  });
}

// -----------------------------------------------------------------
// Output
// -----------------------------------------------------------------

// HTTP checks run after D1-driven checks. Async fetch with a 10s
// timeout each so a slow endpoint cannot stall the entire heartbeat.
const httpResults = [];
for (const check of HTTP_CHECKS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(check.url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.status !== check.expectStatus) {
      httpResults.push({
        kind: 'http',
        name: check.name,
        description: check.description,
        status: 'FAIL',
        detail: `HTTP ${res.status} (expected ${check.expectStatus})`,
        error: null,
      });
      continue;
    }
    if (check.validate) {
      const v = await check.validate(res);
      httpResults.push({
        kind: 'http',
        name: check.name,
        description: check.description,
        status: v.ok ? 'OK' : 'FAIL',
        detail: v.detail,
        error: null,
      });
    } else {
      httpResults.push({
        kind: 'http',
        name: check.name,
        description: check.description,
        status: 'OK',
        detail: `HTTP ${res.status}`,
        error: null,
      });
    }
  } catch (e) {
    clearTimeout(timer);
    httpResults.push({
      kind: 'http',
      name: check.name,
      description: check.description,
      status: 'ERROR',
      detail: null,
      error: e.message || String(e),
    });
  }
}

const stale = results.filter((r) => r.status === 'STALE' || r.status === 'EMPTY' || r.status === 'ERROR');
const failedInvariants = invariantResults.filter((r) => r.status === 'FAIL' || r.status === 'ERROR');
const failedHttp = httpResults.filter((r) => r.status === 'FAIL' || r.status === 'ERROR');
const allOk = stale.length === 0 && failedInvariants.length === 0 && failedHttp.length === 0;

if (args.json) {
  process.stdout.write(JSON.stringify({
    timestamp: new Date().toISOString(),
    healthy: allOk,
    stale_count: stale.length,
    failed_invariant_count: failedInvariants.length,
    failed_http_count: failedHttp.length,
    staleness_checks: results,
    invariants: invariantResults,
    http_checks: httpResults,
  }, null, 2) + '\n');
} else {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  if (!args.silentOnOk || !allOk) {
    process.stdout.write(`NeverRanked autonomy heartbeat\n${stamp} UTC\n\n`);
    process.stdout.write(`Staleness checks:\n`);
  }
  for (const r of results) {
    if (args.silentOnOk && r.status === 'OK') continue;
    const tag = r.status === 'OK' ? '[OK]   '
      : r.status === 'STALE' ? '[STALE]'
      : r.status === 'EMPTY' ? '[EMPTY]'
      : '[ERR]  ';
    const age = fmtAge(r.ageSec);
    const max = fmtMaxAge(r.maxAgeSec);
    const flag = r.status !== 'OK' ? ' <-- ALERT' : '';
    process.stdout.write(`${tag} ${r.name.padEnd(22)} last seen ${age.padEnd(10)} (${r.cadence}, max ${max})${flag}\n`);
    if (r.error) process.stdout.write(`         error: ${r.error}\n`);
  }
  if (!args.silentOnOk || failedInvariants.length > 0) {
    process.stdout.write(`\nInvariant checks:\n`);
  }
  for (const r of invariantResults) {
    if (args.silentOnOk && r.status === 'OK') continue;
    const tag = r.status === 'OK' ? '[OK]   '
      : r.status === 'FAIL' ? '[FAIL] '
      : '[ERR]  ';
    const flag = r.status !== 'OK' ? ' <-- ALERT' : '';
    process.stdout.write(`${tag} ${r.name.padEnd(28)} ${(r.detail || '').slice(0, 90)}${flag}\n`);
    if (r.error) process.stdout.write(`         error: ${r.error}\n`);
  }
  if (!args.silentOnOk || failedHttp.length > 0) {
    process.stdout.write(`\nHTTP checks:\n`);
  }
  for (const r of httpResults) {
    if (args.silentOnOk && r.status === 'OK') continue;
    const tag = r.status === 'OK' ? '[OK]   '
      : r.status === 'FAIL' ? '[FAIL] '
      : '[ERR]  ';
    const flag = r.status !== 'OK' ? ' <-- ALERT' : '';
    process.stdout.write(`${tag} ${r.name.padEnd(28)} ${(r.detail || '').slice(0, 90)}${flag}\n`);
    if (r.error) process.stdout.write(`         error: ${r.error}\n`);
  }
  if (!allOk) {
    const issues = stale.length + failedInvariants.length + failedHttp.length;
    process.stdout.write(`\n${issues} issue${issues === 1 ? '' : 's'} (${stale.length} stale, ${failedInvariants.length} invariant fail${failedInvariants.length === 1 ? '' : 's'}, ${failedHttp.length} http fail${failedHttp.length === 1 ? '' : 's'}).\n`);
    process.stdout.write(`See content/handoff-questions/autonomy-audit-2026-05-09.md\n`);
  } else if (!args.silentOnOk) {
    process.stdout.write(`\nAll ${results.length + invariantResults.length + httpResults.length} checks healthy.\n`);
  }
}

// -----------------------------------------------------------------
// Transition-based notification.
//
// Why: this heartbeat ran correctly for 79 consecutive days and
// escalated by opening a GitHub issue. On 2026-07-27 there were 79
// open heartbeat issues and zero closed. Detection was never the
// problem. The hop from detection to a human was, and it was the
// only broken link. A guard that refuses silently is not a guard,
// it is a silent failure with extra steps -- which is the exact
// class of bug this script was written in May to catch.
//
// Alerts fire on TRANSITION, not on daily state, so steady green is
// silent and a NEW failure is loud. A check that stays red is
// re-raised every REALERT_AFTER_DAYS so a permanent red cannot go
// quiet again the way state-of-aeo did for 67 days.
//
// State lives beside the markdown logs in content/autonomy-log/,
// which the daily workflow already commits, so no new storage is
// introduced and every transition is auditable in git history.
//
// Gated on --log-to-file because that is the CI path where state
// persists. A local run must never mark a failure as "already
// alerted" and rob CI of the notification.
// -----------------------------------------------------------------

const REALERT_AFTER_DAYS = 7;
let notifyOutcome = 'not attempted';

if (args.logToFile) {
  const STATE_FILE = resolve(REPO_ROOT, 'content/autonomy-log/_state.json');
  const notifyUrl = process.env.OPS_NOTIFY_URL || '';
  const notifyToken = process.env.MEASUREMENT_TOKEN || '';
  const today = new Date().toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.floor((Date.parse(a) - Date.parse(b)) / 86400000);

  let prevChecks = {};
  if (existsSync(STATE_FILE)) {
    try {
      prevChecks = (JSON.parse(readFileSync(STATE_FILE, 'utf8')) || {}).checks || {};
    } catch {
      prevChecks = {}; // malformed state -> treat every red as new, never crash
    }
  }

  const newlyRed = [];
  const recovered = [];
  const staleRed = [];
  const nextChecks = {};

  for (const r of [...results, ...invariantResults, ...httpResults]) {
    const was = prevChecks[r.name];
    const wasRed = !!was && was.status !== 'OK';
    // Staleness checks carry ageSec/maxAgeSec rather than a detail string.
    // Without this branch they render as a bare "STALE", which tells the
    // reader nothing and is precisely the kind of uninformative alert that
    // gets ignored.
    const detail = String(
      r.detail ||
        r.error ||
        (r.ageSec != null
          ? `last seen ${fmtAge(r.ageSec)} (${r.cadence}, max ${fmtMaxAge(r.maxAgeSec)})`
          : r.status || ''),
    ).slice(0, 200);

    if (r.status === 'OK') {
      if (wasRed) recovered.push({ name: r.name, since: was.since || 'unknown' });
      nextChecks[r.name] = { status: 'OK', since: null, lastAlerted: null };
      continue;
    }

    const since = wasRed && was.since ? was.since : today;
    const lastAlerted = wasRed ? was.lastAlerted || null : null;
    const entry = { name: r.name, status: r.status, detail, since, ageDays: daysBetween(today, since) };
    if (!wasRed) newlyRed.push(entry);
    else if (!lastAlerted || daysBetween(today, lastAlerted) >= REALERT_AFTER_DAYS) staleRed.push(entry);
    nextChecks[r.name] = { status: r.status, since, lastAlerted };
  }

  const alerting = [...newlyRed, ...staleRed];
  const shouldNotify = alerting.length > 0 || recovered.length > 0;

  if (!shouldNotify) {
    notifyOutcome = 'no transition (silent by design)';
  } else if (!notifyUrl || !notifyToken) {
    // Loud on purpose. A missing notify config is itself the failure
    // this whole block exists to prevent, so it must never read as OK.
    notifyOutcome = 'NOT SENT -- OPS_NOTIFY_URL or MEASUREMENT_TOKEN missing';
  } else {
    const subjectBits = [];
    if (newlyRed.length) subjectBits.push(`${newlyRed.length} new`);
    if (staleRed.length) subjectBits.push(`${staleRed.length} still red`);
    if (recovered.length) subjectBits.push(`${recovered.length} recovered`);
    const subject = `NeverRanked heartbeat: ${subjectBits.join(', ')}`;

    const body = [];
    if (newlyRed.length) {
      body.push('NEW FAILURES (first seen today):');
      for (const e of newlyRed) body.push(`  - ${e.name} [${e.status}] ${e.detail}`);
      body.push('');
    }
    if (staleRed.length) {
      body.push(`STILL FAILING (re-raised every ${REALERT_AFTER_DAYS}d so it cannot go quiet):`);
      for (const e of staleRed) body.push(`  - ${e.name} [${e.status}] red for ${e.ageDays}d since ${e.since}: ${e.detail}`);
      body.push('');
    }
    if (recovered.length) {
      body.push('RECOVERED:');
      for (const e of recovered) body.push(`  - ${e.name} (was red since ${e.since})`);
      body.push('');
    }
    body.push(`Full log: content/autonomy-log/${today}.md`);

    try {
      const res = await fetch(notifyUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-measurement-token': notifyToken },
        body: JSON.stringify({ subject, body: body.join('\n') }),
      });
      if (res.ok) {
        notifyOutcome = `sent (${subjectBits.join(', ')})`;
        // Only stamp lastAlerted on a CONFIRMED send. If delivery failed,
        // the next run must try again rather than assume Lance was told.
        for (const e of alerting) nextChecks[e.name].lastAlerted = today;
      } else {
        notifyOutcome = `NOT SENT -- HTTP ${res.status}`;
      }
    } catch (e) {
      notifyOutcome = `NOT SENT -- ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  try {
    mkdirSync(resolve(REPO_ROOT, 'content/autonomy-log'), { recursive: true });
    writeFileSync(
      STATE_FILE,
      JSON.stringify({ updated: new Date().toISOString(), checks: nextChecks }, null, 2) + '\n',
      'utf8',
    );
  } catch (e) {
    notifyOutcome += ` | state write failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// -----------------------------------------------------------------
// Optional: write a dated summary into content/autonomy-log/ so the
// system health signal is discoverable from git history. Each day
// produces one markdown file. If a file for today already exists,
// the new run is appended as a fresh section, so multiple runs in
// one day produce a chronologically ordered log without overwriting.
// -----------------------------------------------------------------

if (args.logToFile) {
  const date = new Date().toISOString().slice(0, 10);
  const time = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const logDir = resolve(REPO_ROOT, 'content/autonomy-log');
  mkdirSync(logDir, { recursive: true });
  const logFile = resolve(logDir, `${date}.md`);

  const header = existsSync(logFile)
    ? `\n\n## Run ${time} UTC\n`
    : `# Autonomy heartbeat log, ${date}\n\nDaily record of NeverRanked autonomy posture. Each section is one heartbeat run. Generated by \`scripts/heartbeat.mjs --log-to-file\`. Source of truth lives in production D1; this file is the durable, git-tracked snapshot.\n\n## Run ${time} UTC\n`;

  const lines = [];
  lines.push(`Status: ${allOk ? 'HEALTHY' : `${stale.length + failedInvariants.length} ISSUE${stale.length + failedInvariants.length === 1 ? '' : 'S'}`}`);
  lines.push(`Notification: ${notifyOutcome}`);
  lines.push(``);
  lines.push(`### Staleness`);
  lines.push(``);
  lines.push(`| Check | Status | Last seen | Cadence | Max age |`);
  lines.push(`|---|---|---|---|---|`);
  for (const r of results) {
    lines.push(`| ${r.name} | ${r.status} | ${fmtAge(r.ageSec)} | ${r.cadence} | ${fmtMaxAge(r.maxAgeSec)} |`);
  }
  lines.push(``);
  lines.push(`### Invariants`);
  lines.push(``);
  lines.push(`| Check | Status | Detail |`);
  lines.push(`|---|---|---|`);
  for (const r of invariantResults) {
    const detail = (r.detail || r.error || '').replace(/\|/g, '\\|').slice(0, 140);
    lines.push(`| ${r.name} | ${r.status} | ${detail} |`);
  }
  lines.push(``);
  lines.push(`### HTTP`);
  lines.push(``);
  lines.push(`| Check | Status | Detail |`);
  lines.push(`|---|---|---|`);
  for (const r of httpResults) {
    const detail = (r.detail || r.error || '').replace(/\|/g, '\\|').slice(0, 140);
    lines.push(`| ${r.name} | ${r.status} | ${detail} |`);
  }
  lines.push(``);

  const content = (existsSync(logFile) ? readFileSync(logFile, 'utf8') : '') + header + lines.join('\n');
  writeFileSync(logFile, content, 'utf8');
  if (!args.json && !args.silentOnOk) {
    process.stdout.write(`\nLogged to ${logFile.replace(REPO_ROOT + '/', '')}\n`);
  }
}

process.exit(allOk ? 0 : 1);
