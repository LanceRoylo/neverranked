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
    description: 'Weekly customer digest fanout (Monday SEND_DIGEST_WORKFLOW)',
    sql: `SELECT MAX(created_at) as latest FROM email_log WHERE type='digest'`,
    maxAgeSec: 8 * 86400,
    cadence: 'weekly',
  },
  {
    name: 'gsc_snapshots',
    description: 'Google Search Console pull (Monday WeeklyExtrasWorkflow.gsc-pull)',
    sql: `SELECT CAST(strftime('%s', MAX(date_end)) AS INTEGER) as latest FROM gsc_snapshots`,
    maxAgeSec: 8 * 86400,
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
  {
    name: 'email_log/all',
    description: 'Any email send (auth, digest, drip, alerts)',
    sql: `SELECT MAX(created_at) as latest FROM email_log`,
    maxAgeSec: 36 * 3600,
    cadence: 'daily',
  },
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
    description: 'Every active keyword should have at least one citation_run in the last 8 days',
    run: () => {
      const rows = runD1(`
        SELECT k.client_slug,
               COUNT(DISTINCT k.id) as active_kw,
               COUNT(DISTINCT CASE WHEN r.run_at > unixepoch() - 8*86400 THEN k.id END) as kw_with_runs
        FROM citation_keywords k
        LEFT JOIN citation_runs r ON r.keyword_id = k.id
        WHERE k.active = 1
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
    description: 'Every active citation engine should have runs in the last 8 days',
    run: () => {
      const rows = runD1(`
        SELECT engine, COUNT(*) as runs
        FROM citation_runs
        WHERE run_at > unixepoch() - 8*86400
        GROUP BY engine
      `);
      const expected = ['perplexity', 'openai', 'gemini', 'anthropic'];
      const seen = new Set(rows.map(r => r.engine));
      const missing = expected.filter(e => !seen.has(e));
      if (missing.length === 0) return { pass: true, detail: `${rows.length} engines active` };
      return { pass: false, detail: `missing engines: ${missing.join(', ')}` };
    },
  },
  {
    name: 'digest-delivery-per-user',
    description: 'Every email_digest=1 user should have received a digest in the last 8 days',
    run: () => {
      const opted = runD1(`SELECT COUNT(*) as n FROM users WHERE email_digest = 1`)[0]?.n || 0;
      if (opted === 0) return { pass: true, detail: 'no opted-in users' };
      const recent = runD1(`
        SELECT COUNT(DISTINCT email) as n
        FROM email_log
        WHERE type = 'digest' AND created_at > unixepoch() - 8*86400
      `)[0]?.n || 0;
      const pct = Math.round((recent / opted) * 100);
      if (pct >= 80) return { pass: true, detail: `${recent}/${opted} users (${pct}%) received` };
      return { pass: false, detail: `${recent}/${opted} users (${pct}%) received in last 8 days` };
    },
  },
  {
    name: 'gsc-coverage-per-client',
    description: 'Every active client with gsc_property should have a snapshot in the last 8 days',
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
      const cutoff = new Date(Date.now() - 8 * 86400 * 1000).toISOString().slice(0, 10);
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
  {
    name: 'state-of-aeo-latest',
    description: 'state-of-aeo/latest.json fresh and parseable',
    url: 'https://neverranked.com/state-of-aeo/latest.json',
    expectStatus: 200,
    validate: async (res) => {
      try {
        const json = await res.json();
        if (!json.url || !json.headline) return { ok: false, detail: 'malformed payload' };
        // Accept up to 14 days old; weekly cadence + grace.
        const generated = new Date(json.generated);
        const ageDays = (Date.now() - generated.getTime()) / 86400000;
        if (ageDays > 14) return { ok: false, detail: `${Math.round(ageDays)}d old (max 14d)` };
        return { ok: true, detail: `${json.slug}, ${Math.round(ageDays)}d old` };
      } catch (e) {
        return { ok: false, detail: `parse failed: ${e.message}` };
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
