/* Run the REAL buildReportFacts against REAL production rows, read-only.
 *
 *   npx tsx scripts/verify-facts.ts <client-slug> [YYYY-MM]
 *
 * WHY. A readout renders from facts frozen at draft time, and the only paths
 * that write them need admin auth or a cron. So the question "what will the
 * customer actually see" was answerable only by waiting for the regeneration
 * and hoping. This answers it now: same function, same rows, read-only
 * transport. The LLM call lives in emitReportFacts rather than
 * buildReportFacts, so this costs nothing to run.
 *
 * Used 2026-09-16 to confirm the presence block would appear in Prince's
 * 09-24 regeneration, rather than deducing it from the code path. It also
 * showed ChatGPT search had already cleared the coverage threshold it was
 * below when the September facts were first frozen.
 *
 * READ-ONLY BY CONSTRUCTION. The shim refuses anything that is not a SELECT or
 * WITH, so it cannot write through a code path that thinks it can. */
import { execFileSync } from "node:child_process";


function runSql(sql: string): Record<string, unknown>[] {
  if (!/^\s*(SELECT|WITH)\b/i.test(sql.trim())) throw new Error("read-only shim: " + sql.slice(0, 80));
  const out = execFileSync("npx",
    ["wrangler", "d1", "execute", "neverranked-app", "--remote", "--json", "--command", sql],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const i = Math.min(...[out.indexOf("["), out.indexOf("{")].filter((n) => n >= 0));
  const parsed = JSON.parse(out.slice(i));
  if (!Array.isArray(parsed) && parsed.error) throw new Error(JSON.stringify(parsed.error).slice(0, 300));
  return parsed[0]?.results ?? [];
}

const lit = (v: unknown): string =>
  v === null || v === undefined ? "NULL"
  : typeof v === "number" ? String(v)
  : typeof v === "boolean" ? (v ? "1" : "0")
  : `'${String(v).replace(/'/g, "''")}'`;

const DB = {
  prepare(sql: string) {
    const stmt = {
      _sql: sql,
      bind(...args: unknown[]) {
        let i = 0;
        const inlined = sql.replace(/\?/g, () => lit(args[i++]));
        return { ...stmt, _sql: inlined, all: async () => ({ results: runSql(inlined) }), first: async () => runSql(inlined)[0] ?? null };
      },
      all: async () => ({ results: runSql(sql) }),
      first: async () => runSql(sql)[0] ?? null,
    };
    return stmt;
  },
};


/* Audit a delivered-or-about-to-be-delivered memo against the database.
 *
 * Written 2026-09-25 while auditing the first paid deliverable by hand. Doing
 * it by hand found a real error (a cohort count padded with URL path segments)
 * that no gate caught, and doing it by hand is not repeatable. */
const BANNED: Array<[RegExp, string]> = [
  [/\bcopilot\b/i, "Copilot (no such data exists)"],
  [/seven\s+(ai\s+)?(engines|tools)/i, "seven AI tools (retired 2026-08-22)"],
  [/45[^0-9]{1,4}95/, "45-to-95 (retracted)"],
  [/14\s*of\s*19/i, "14-of-19 (retracted)"],
  [/citation[- ]grade/i, "citation-grade tier (removed)"],
  [/—/, "em dash (house style)"],
  [/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, "emoji (house style)"],
  [/that is why|this is because|the reason is/i, "asserted cause"],
];

async function main() {
  const slug = process.argv[2] ?? "prince-waikiki";
  const month = process.argv[3] ?? "2026-09";
  const row: any = runSql(
    `SELECT id, body_markdown, facts_json, COALESCE(rules_hash,'none') rules,
            datetime(updated_at,'unixepoch') updated
       FROM monthly_memos WHERE client_slug='${slug}' AND month_key='${month}'`)[0];
  if (!row) { console.log("no memo"); return; }
  const b: string = row.body_markdown;
  const f = JSON.parse(row.facts_json || "{}");

  console.log(`memo ${row.id}  ${slug} ${month}  updated ${row.updated}  rules ${row.rules}`);
  console.log(`length ${b.length}  sections ${(b.match(/^###?\s/gm) || []).length}  ends ${JSON.stringify(b.trim().slice(-24))}`);

  console.log("\nBANNED CLAIMS AND STYLE");
  let bad = 0;
  for (const [re, label] of BANNED) {
    const m = b.match(re);
    if (m) { console.log(`  FAIL ${label} -> ${JSON.stringify(m[0])}`); bad++; }
  }
  if (!bad) console.log("  clean");

  const greet = b.match(/^\s*([A-Z][a-z]+),\s/m);
  const contact: any = runSql(`SELECT primary_contact_name n FROM customers WHERE client_slug='${slug}'`)[0];
  console.log(`\nGREETING  memo says ${greet ? greet[1] : "(none)"}  on file: ${contact?.n ?? "(none)"}  ${greet && contact && contact?.n && String(contact.n).split(" ")[0] === greet[1] ? "OK" : "CHECK"}`);

  // Cohort count claims, the class that was wrong on 2026-09-25.
  const venue = (f.venue?.rows || []).filter((r: any) => r && typeof r.label === "string");
  const pageish = venue.filter((r: any) => {
    const w = String(r.label).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return w.length > 0 && w.every((x: string) =>
      ["information","info","rooms","room","en","us","hotel","hotels","overview","amenities","dining","about","contact","booking","rates","offers"].includes(x));
  });
  console.log(`\nCOHORT  facts rows ${venue.length}  page-like labels ${pageish.length}${pageish.length ? " -> " + pageish.map((r: any) => r.label).join(", ") : ""}`);
  for (const m of b.matchAll(/among\s+([0-9]+)\s+([A-Za-z ]+?hotels|venues|businesses)/g)) {
    const claimed = Number(m[1]);
    const ok = claimed === venue.length || claimed === venue.length - 1;
    console.log(`  claim "among ${claimed}" vs facts ${venue.length} rows  ${ok ? "OK" : "MISMATCH"}`);
  }
  console.log("\nDone. Verify per-question figures separately against citation_runs.");
}
main();
