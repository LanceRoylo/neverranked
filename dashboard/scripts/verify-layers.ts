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
import { buildReportFacts } from "../src/lib/report-facts";

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


async function main() {
  const slug = process.argv[2] ?? "prince-waikiki";
  const month = process.argv[3] ?? "2026-09";
  const f: any = await buildReportFacts({ DB } as never, slug, month);
  if (!f) { console.log("null"); return; }
  console.log(`${slug} ${month} -- engines and resolved layer:`);
  for (const e of f.engines) {
    console.log("  " + String(e.name).padEnd(24) + " pct=" + String(e.pct).padEnd(4) + " layer=" + (e.layer ?? "(absent = citation)"));
  }
  const inReadsChart = f.engines.filter((e: any) => e.layer !== "model_knowledge").map((e: any) => e.name);
  const heldOut = f.engines.filter((e: any) => e.layer === "model_knowledge").map((e: any) => e.name);
  console.log("\n  'what AI reads' chart shows :", inReadsChart.join(", "));
  console.log("  held out (fetch nothing)    :", heldOut.join(", ") || "(none)");
}
main();
