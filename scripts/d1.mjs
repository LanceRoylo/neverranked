#!/usr/bin/env node
//
// d1.mjs — read-only D1 query that fails LOUDLY.
//
// WHY THIS EXISTS (2026-09-16). Twice in one session I read an empty result as
// a finding when the query had actually errored:
//
//   SELECT ... message    FROM admin_alerts     -- column is `title`/`detail`
//   SELECT ... created_at FROM engine_failures  -- column is `failed_at`
//
// Both were run as `npx wrangler d1 execute ... 2>/dev/null | grep ...`. The
// error went to stderr, into the void, and the grep found nothing. "No rows"
// and "your SQL is wrong" then look identical, and the second one reads as
// evidence of absence. On the engine_failures query that nearly became a
// report that ChatGPT had failed silently, when in fact it had logged a clean
// 500 from OpenAI.
//
// The rule this enforces: an empty result is only evidence when the query ran.
//
//   node scripts/d1.mjs "SELECT ..."          table output
//   node scripts/d1.mjs --json "SELECT ..."   JSON rows on stdout
//
// REFUSES anything that is not a single SELECT. Audit work on this database is
// read-only, and the one script that deletes citation_runs is exactly the one
// nobody should reach for by reflex.

import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const sql = args.filter((a) => a !== "--json").join(" ").trim();

if (!sql) {
  console.error('usage: node scripts/d1.mjs [--json] "SELECT ..."');
  process.exit(2);
}

// Single statement, SELECT or WITH only. A trailing semicolon is fine; a
// second statement after it is not.
const stripped = sql.replace(/;\s*$/, "");
if (/;/.test(stripped)) {
  console.error("refused: multiple statements. Run them one at a time.");
  process.exit(2);
}
if (!/^\s*(SELECT|WITH)\b/i.test(stripped)) {
  console.error(`refused: read-only. This helper runs SELECT and WITH, nothing else.\n  got: ${stripped.slice(0, 60)}`);
  process.exit(2);
}

const DASH = new URL("../dashboard/", import.meta.url).pathname;
let out;
try {
  out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "neverranked-app", "--remote", "--json", "--command", stripped],
    { cwd: DASH, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
  );
} catch (e) {
  // THE POINT OF THIS FILE. wrangler exits non-zero on a SQL error and puts
  // the reason on stderr; surface both instead of letting the shell eat them.
  console.error("D1 query FAILED (this is not an empty result):");
  console.error(String(e.stderr || e.stdout || e.message).trim().slice(0, 1200));
  process.exit(1);
}

const i = Math.min(...[out.indexOf("["), out.indexOf("{")].filter((n) => n >= 0));
if (!Number.isFinite(i)) {
  console.error("D1 returned no parseable JSON:");
  console.error(out.slice(0, 600));
  process.exit(1);
}
const parsed = JSON.parse(out.slice(i));
// An error can also arrive on a zero exit, shaped as {error:{...}}.
if (parsed && !Array.isArray(parsed) && parsed.error) {
  console.error("D1 query FAILED (this is not an empty result):");
  console.error(JSON.stringify(parsed.error, null, 2).slice(0, 1200));
  process.exit(1);
}
const rows = parsed[0]?.results ?? [];

if (asJson) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
if (!rows.length) { console.log("(0 rows — query ran successfully)"); process.exit(0); }

const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").slice(0, 60).length)));
const line = (cells) => cells.map((c, j) => String(c).padEnd(w[j])).join("  ");
console.log(line(cols));
console.log(w.map((n) => "-".repeat(n)).join("  "));
for (const r of rows) console.log(line(cols.map((c) => String(r[c] ?? "").slice(0, 60).replace(/\s+/g, " "))));
console.log(`\n(${rows.length} row${rows.length === 1 ? "" : "s"})`);
