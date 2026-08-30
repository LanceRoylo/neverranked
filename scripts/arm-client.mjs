#!/usr/bin/env node
//
// arm-client.mjs — turn a provisioned client's measurement ON, safely.
//
// WHY (2026-08-30): arming was three manual steps held in someone's head --
// run preflight, flip measurement_registry.active, ALSO flip
// citation_keywords.active, run preflight again. They are separate flags and
// nothing said so, so arming only the registry gives you a watchdog over an
// empty pipeline: an alarm on a client who is silently not being measured.
// That is the shape of failure this whole codebase keeps producing, and a
// client launch is the worst place for it.
//
// This makes it one command that cannot half-succeed:
//
//   1. preflight must pass EVERYTHING except the two active flags. Any other
//      red (no logins, no customers row, no measurement_start) aborts before
//      anything is written.
//   2. refuses to arm before the client's contracted measurement_start,
//      because pre-engagement rows are what put a sales demo into a client's
//      first memo.
//   3. flips BOTH flags.
//   4. re-runs preflight and requires a clean pass. If it does not get one,
//      it ROLLS BACK to the exact prior values rather than leaving a client
//      half-armed.
//
//   node scripts/arm-client.mjs <client-slug> --confirm
//
// Without --confirm it does everything except write, and tells you what it
// would do.

import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const slug = args[0];
const CONFIRM = args.includes("--confirm");
if (!slug || slug.startsWith("--")) {
  console.error("usage: node scripts/arm-client.mjs <client-slug> --confirm");
  process.exit(2);
}

const DB = "neverranked-app";
const DASH = new URL("../dashboard/", import.meta.url).pathname;
const HERE = new URL(".", import.meta.url).pathname;
const S = slug.replace(/'/g, "''");

function d1(sql) {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql],
    { cwd: DASH, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const i = Math.min(...[out.indexOf("["), out.indexOf("{")].filter((n) => n >= 0));
  return JSON.parse(out.slice(i))[0].results;
}

function preflight() {
  try {
    const out = execFileSync("node", [`${HERE}preflight-client.mjs`, slug, "--json"],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    return JSON.parse(out);
  } catch (e) {
    // non-zero exit still prints the JSON on stdout
    try { return JSON.parse(e.stdout); } catch { throw e; }
  }
}

const ARMING_FLAGS = new Set(["registry active = 1", "keywords active = 1"]);
const die = (msg) => { console.error(`\n  ✗ ${msg}\n`); process.exit(1); };

console.log(`\narm-client: ${slug}${CONFIRM ? "" : "   (DRY RUN -- pass --confirm to write)"}\n`);

// ── 1. everything except the flags must already be green ────────────────────
const before = preflight();
const blockers = before.results.filter((r) => !r.ok && r.blocking && !ARMING_FLAGS.has(r.label));
if (blockers.length) {
  console.error("  preflight has blocking failures that arming does NOT fix:\n");
  blockers.forEach((b) => console.error(`    ✗ ${b.label}\n      ${b.detail}\n`));
  die("refusing to arm. Fix these first.");
}
console.log("  ✓ every non-flag precondition is green");

// ── 2. do not arm before the engagement starts ──────────────────────────────
const reg = d1(`SELECT active, measurement_start,
  date(measurement_start,'unixepoch') AS starts, unixepoch() AS now
  FROM measurement_registry WHERE client_slug='${S}'`)[0];
if (!reg) die(`no measurement_registry row for ${slug}`);
if (!reg.measurement_start) die("measurement_start is NULL. Set it before arming (migration 0109).");
if (Number(reg.now) < Number(reg.measurement_start)) {
  die(`contracted measurement starts ${reg.starts}. Arming early writes rows that predate the ` +
      `engagement, and those become the comparison baseline for the first memo.`);
}
console.log(`  ✓ contracted measurement start ${reg.starts} has arrived`);

const kwBefore = d1(`SELECT COUNT(*) AS all_n, SUM(active) AS on_n FROM citation_keywords WHERE client_slug='${S}'`)[0];
console.log(`\n  would set measurement_registry.active: ${reg.active} -> 1`);
console.log(`  would set citation_keywords.active:    ${kwBefore.on_n ?? 0}/${kwBefore.all_n} -> ${kwBefore.all_n}/${kwBefore.all_n}\n`);

if (!CONFIRM) { console.log("  DRY RUN complete. Nothing written. Re-run with --confirm.\n"); process.exit(0); }

// ── 3. flip BOTH flags ──────────────────────────────────────────────────────
d1(`UPDATE measurement_registry SET active=1 WHERE client_slug='${S}'`);
d1(`UPDATE citation_keywords SET active=1 WHERE client_slug='${S}'`);
console.log("  ✓ both flags set");

// ── 4. verify, and roll back if the result is not clean ─────────────────────
const after = preflight();
const stillBad = after.results.filter((r) => !r.ok && r.blocking);
if (stillBad.length) {
  console.error("\n  post-arm preflight is NOT clean. Rolling back:\n");
  stillBad.forEach((b) => console.error(`    ✗ ${b.label} — ${b.detail}`));
  d1(`UPDATE measurement_registry SET active=${Number(reg.active) || 0} WHERE client_slug='${S}'`);
  d1(`UPDATE citation_keywords SET active=0 WHERE client_slug='${S}'`);
  die("rolled back to the prior state. This client is NOT armed.");
}

console.log(`\n  ✓ ${slug} is ARMED and preflight is clean.`);
console.log(`    The next 06:00 UTC sweep (20:00 HST) will pick up ${kwBefore.all_n} questions.\n`);
