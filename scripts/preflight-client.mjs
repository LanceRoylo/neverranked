#!/usr/bin/env node
//
// preflight-client.mjs — refuse to start a paid engagement on unverified state.
//
// WHY THIS EXISTS (2026-08-28):
// check-claims blocks a deploy when a retired claim reaches a page. Nothing
// did the equivalent for whether we are actually OPERATING. On 2026-08-28,
// four days before a paying client's start date, we found by hand:
//
//   - measurement_registry.active = 0        (no watchdog, no digest, no Atlas)
//   - citation_keywords.active    = 0 (all)  (the sweep never picks them up)
//   - zero users                             (client bounces to /login forever)
//   - a runbook gate reading "DONE" for a signature that was never given
//
// Every one failed SILENTLY. An inactive client is not failing, it is skipped,
// and skipped things raise nothing. The two active flags are separate and
// nothing anywhere said so: arming only the registry gives you an alarm over
// an empty pipeline.
//
// This script asserts what must be true and exits non-zero when it is not.
// Run it BEFORE arming a client, and treat a red result as a stop.
//
//   node scripts/preflight-client.mjs <client-slug>
//
// Read-only. It never writes.

import { execFileSync } from "node:child_process";

const slug = process.argv[2];
if (!slug) {
  console.error("usage: node scripts/preflight-client.mjs <client-slug>");
  process.exit(2);
}

const DB = "neverranked-app";
const DASH = new URL("../dashboard/", import.meta.url).pathname;

function q(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql],
    { cwd: DASH, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  // wrangler prints a banner before the JSON; take from the first [ or {.
  const i = Math.min(...[out.indexOf("["), out.indexOf("{")].filter((n) => n >= 0));
  return JSON.parse(out.slice(i))[0].results;
}
const one = (sql) => q(sql)[0] ?? {};
const esc = (s) => String(s).replace(/'/g, "''");
const S = esc(slug);

// Every check lands in ONE array with a stable label, so other tooling
// (scripts/arm-client.mjs) can reason about WHICH check failed instead of
// scraping prose. --json emits it.
const JSON_MODE = process.argv.includes("--json");
const results = [];
const check = (ok, label, detail, blocking = true) => {
  results.push({ label, ok: !!ok, blocking, detail: ok ? null : detail });
};
const notes = [];
const say = (...a) => { if (!JSON_MODE) console.log(...a); };

say(`\npreflight: ${slug}\n`);

// ── 1. measurement_registry: arms the WATCHDOG ──────────────────────────────
const reg = one(
  `SELECT active, category, full_target, run_days, measurement_start FROM measurement_registry WHERE client_slug='${S}'`,
);
check(reg.category !== undefined, "registry row exists",
  "no measurement_registry row: this client cannot be watched or measured");
check(reg.measurement_start != null && Number(reg.measurement_start) > 0,
  "measurement_start set",
  "measurement_registry.measurement_start is NULL. report-facts decides whether a month is a BASELINE by asking if prior-window rows exist, so any pre-sale teardown, demo or dry run sitting in the prior month becomes the comparison baseline for this client's first memo. See migration 0109");

check(Number(reg.active) === 1, "registry active = 1",
  `active is ${reg.active ?? "MISSING"}. Arms the watchdog, the pass-cadence digest, Atlas context and the customer view. See KICKOFF-RUNBOOK Gate 6`);

// ── 2. citation_keywords: makes the measurement RUN ─────────────────────────
const kw = one(
  `SELECT SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS on_n, COUNT(*) AS all_n
     FROM citation_keywords WHERE client_slug='${S}'`,
);
check(Number(kw.all_n) > 0, "keywords exist", "no citation_keywords rows at all");
check(Number(kw.on_n) > 0, "keywords active = 1",
  `${kw.on_n ?? 0} of ${kw.all_n ?? 0} active. planCitationRun filters WHERE active=1, so the sweep never picks this client up. THIS IS A SEPARATE FLAG FROM THE REGISTRY. See Gate 8`);

// ── 3. the client can actually open the thing they pay for ──────────────────
const u = one(`SELECT COUNT(*) AS n FROM users WHERE client_slug='${S}'`);
check(Number(u.n) > 0, "client logins exist",
  "zero users. handleReadoutView redirects to /login, so the customer lands on a login page for an account that does not exist");

// ── 4. cohort ───────────────────────────────────────────────────────────────
const d = one(
  `SELECT SUM(CASE WHEN is_competitor=0 THEN 1 ELSE 0 END) AS own,
          SUM(CASE WHEN is_competitor=1 THEN 1 ELSE 0 END) AS comp
     FROM domains WHERE client_slug='${S}'`,
);
check(Number(d.own) > 0, "own domain registered", "no non-competitor domain: prominence cannot be computed");
check(Number(d.comp) > 0, "competitor cohort registered", "no competitor rows: there is nothing to measure against");

// ── 5. contract + memo grading ──────────────────────────────────────────────
const c = one(
  `SELECT status, CASE WHEN plan_markdown IS NULL THEN 0 ELSE 1 END AS has_plan
     FROM customers WHERE client_slug='${S}'`,
);
check(c.status !== undefined, "customers row exists", "no customers row");
check(Number(c.has_plan) === 1, "plan_markdown set",
  "customers.plan_markdown is NULL. The monthly memo generator grades each memo against it, so this client has nothing to be graded against", false);

// ── 6. does the pipeline actually produce rows? (only meaningful once armed) ─
if (Number(reg.active) === 1) {
  const r = one(
    `SELECT COUNT(*) AS n, COUNT(DISTINCT engine) AS engines
       FROM citation_runs cr JOIN citation_keywords ck ON ck.id=cr.keyword_id
      WHERE ck.client_slug='${S}' AND cr.run_at > unixepoch()-86400*3`,
  );
  check(Number(r.n) > 0, "runs landing in the last 3 days",
    "armed, but no citation_runs. The watchdog will alarm before anyone notices the pipeline is dry");
  check(Number(r.engines) >= 6, "all surfaces writing",
    `only ${r.engines ?? 0} distinct engines wrote. Expect 7 (six AI tools plus the Bing control); AI Overviews legitimately skips on a real empty answer`, false);
} else {
  notes.push("run check skipped — client is not armed yet, so an empty pipeline is expected");
}

// ── report ──────────────────────────────────────────────────────────────────
const fail = results.filter((r) => !r.ok && r.blocking);
const warn = results.filter((r) => !r.ok && !r.blocking);

if (JSON_MODE) {
  console.log(JSON.stringify({ slug, ok: fail.length === 0, results }, null, 2));
  process.exit(fail.length ? 1 : 0);
}
for (const r of results.filter((r) => r.ok)) console.log(`  ✓ ${r.label}`);
for (const w of warn) console.log(`  ! ${w.label} — ${w.detail}`);
for (const n of notes) console.log(`  ! ${n}`);
if (fail.length) {
  console.error(`\n✗ preflight FAILED for ${slug}: ${fail.length} blocking issue(s)\n`);
  fail.forEach((f) => console.error(`  ✗ ${f.label} — ${f.detail}`));
  console.error("\n  Do NOT start or arm this client until these are green.\n");
  process.exit(1);
}
console.log(`\n✓ preflight: ${slug} is ready${warn.length ? ` (${warn.length} advisory)` : ""}.\n`);
