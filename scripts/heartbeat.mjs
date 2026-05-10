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

// -----------------------------------------------------------------
// Output
// -----------------------------------------------------------------

const stale = results.filter((r) => r.status === 'STALE' || r.status === 'EMPTY' || r.status === 'ERROR');
const allOk = stale.length === 0;

if (args.json) {
  process.stdout.write(JSON.stringify({
    timestamp: new Date().toISOString(),
    healthy: allOk,
    stale_count: stale.length,
    checks: results,
  }, null, 2) + '\n');
} else {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  if (!args.silentOnOk || !allOk) {
    process.stdout.write(`NeverRanked autonomy heartbeat\n${stamp} UTC\n\n`);
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
  if (!allOk) {
    process.stdout.write(`\n${stale.length} stale automation${stale.length === 1 ? '' : 's'}.\n`);
    process.stdout.write(`See content/handoff-questions/autonomy-audit-2026-05-09.md\n`);
  } else if (!args.silentOnOk) {
    process.stdout.write(`\nAll ${results.length} automations healthy.\n`);
  }
}

process.exit(allOk ? 0 : 1);
