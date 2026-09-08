#!/usr/bin/env node
/**
 * probe-memo-inputs — show exactly what the memo writer will be handed, for
 * any client, at any date, WITHOUT generating a draft or burning an LLM call.
 *
 *   node scripts/probe-memo-inputs.mjs prince-waikiki
 *   node scripts/probe-memo-inputs.mjs prince-waikiki 2026-10-24
 *
 * WHY THIS EXISTS. Memo drafts used to generate only on the 24th, one day
 * before delivery. On 2026-09-07 this probe was run by hand against
 * prince-waikiki 17 days before their first paid memo and found three
 * compounding defects that would otherwise have shipped:
 *
 *   - a pre-engagement free scan was being read as "last month", producing a
 *     prior share and positive movement across a window containing ZERO runs
 *   - owned citations were summed across BOTH measurement layers (URL
 *     citations + model-knowledge name mentions), while competitors were
 *     counted in URL citations only
 *   - cohort rank used indexOf() on a sorted array, so a coincidental tie
 *     promoted the customer to the top of the tied group
 *
 * All three are fixed, and a preview pass now runs on the 15th. This stays as
 * the on-demand check: run it before any delivery you care about, and read the
 * numbers rather than trusting that the guards held.
 *
 * Read-only. It executes gatherMemoInputs against REMOTE D1 through wrangler,
 * so it needs wrangler auth and it costs a handful of queries.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DASHBOARD = join(HERE, "..", "dashboard");

const slug = process.argv[2];
const asOf = process.argv[3] ? new Date(`${process.argv[3]}T06:00:00Z`) : new Date();
if (!slug) {
  console.error("usage: node scripts/probe-memo-inputs.mjs <client_slug> [YYYY-MM-DD]");
  process.exit(2);
}

const esc = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  return "'" + String(v).replace(/'/g, "''") + "'";
};

function run(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "neverranked-app", "--remote", "--json", "--command", sql],
    { cwd: DASHBOARD, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
  );
  const d = JSON.parse(out);
  return (Array.isArray(d) ? d[0].results : d.result[0].results) || [];
}

// Minimal D1 shim: substitutes bound params into the SQL and proxies to
// wrangler. Read-only -- .run() is a no-op so nothing can be written by
// accident from a diagnostic tool.
const DB = {
  prepare(sql) {
    const exec = (bound) => ({
      async first() { return run(bound)[0] ?? null; },
      async all() { return { results: run(bound) }; },
      async run() { return {}; },
    });
    return {
      bind(...args) {
        let i = 0;
        return exec(sql.replace(/\?/g, () => esc(args[i++])));
      },
      ...exec(sql),
    };
  },
};

const { gatherMemoInputs } = await import(join(DASHBOARD, "src", "lib", "memo-inputs.ts"));
const i = await gatherMemoInputs({ DB }, slug, asOf);

const pad = (v, n) => String(v).padStart(n);
console.log(`\nmemo inputs — ${i.customer.name} (${slug}) as of ${asOf.toISOString().slice(0, 10)}`);
console.log(`first memo: ${i.is_first_memo}   prior memo: ${i.prior_memo ? i.prior_memo.month_key : "none"}`);
console.log(`window: ${i.window.current_start} .. ${i.window.current_end}   (prior from ${i.window.prior_start})\n`);

console.log("OVERALL");
console.log(`  current  ${pad(i.overall.current.cited, 6)} of ${i.overall.current.runs}  = ${i.overall.current.share_pct}%`);
console.log(`  prior    ${pad(i.overall.prior.cited, 6)} of ${i.overall.prior.runs}  = ${i.overall.prior.share_pct}%`);
console.log(`  delta    ${i.overall.share_delta_pp} pp`);
if (i.overall.prior.runs === 0 && i.overall.share_delta_pp !== 0) {
  console.log("  !! MOVEMENT REPORTED AGAINST A WINDOW WITH ZERO RUNS -- this is the 2026-09-07 defect");
}

console.log(`\nCOHORT   rank ${i.cohort.rank} of ${i.cohort.members.length + 1}   your citations ${i.cohort.customer_mentions}`);
for (const m of i.cohort.members.slice(0, 6)) {
  console.log(`  ${pad(m.mentions, 6)}  ${pad(m.share_pct + "%", 7)}  ${m.label || m.domain}`);
}
const ahead = i.cohort.members.filter((m) => m.mentions > i.cohort.customer_mentions).length;
if (i.cohort.rank !== null && i.cohort.rank !== ahead + 1) {
  console.log(`  !! RANK MISMATCH: ${ahead} competitors are ahead, so rank should be ${ahead + 1}`);
}

console.log("\nBY ENGINE");
for (const e of i.by_engine) {
  const flag = e.no_cohort_signal ? "  (no cohort signal)" : "";
  console.log(`  ${pad(e.current_share_pct + "%", 5)}  prior ${pad(e.prior_share_pct + "%", 5)}  delta ${pad(e.delta_pp, 6)}  ${e.engine}${flag}`);
}

const weakest = i.by_question.slice(0, 5);
console.log(`\nWEAKEST QUESTIONS (${i.by_question.length} tracked)`);
for (const q of weakest) console.log(`  ${pad(q.current_pct + "%", 5)}  ${q.keyword}`);
console.log("");
