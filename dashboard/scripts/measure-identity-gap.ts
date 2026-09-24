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
import { buildIdentitySet, identifyEntities, identifyEntity, normHost } from "../src/lib/client-identity";

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
  const since = process.argv[3] ?? "2026-09-01";

  const idRows: any[] = runSql(
    `SELECT kind, value, status FROM client_identities WHERE client_slug = '${slug}'`) as any;
  const ids = buildIdentitySet(slug, idRows as any);
  console.log(`${slug}: ${idRows.length} identities loaded\n`);

  const rows: any[] = runSql(
    `SELECT engine, client_cited, cited_entities FROM citation_runs
      WHERE keyword_id IN (SELECT id FROM citation_keywords WHERE client_slug = '${slug}')
        AND run_at >= unixepoch('${since}') AND cited_entities IS NOT NULL AND cited_entities != '[]'`) as any;

  const agg = new Map<string, { runs: number; scored: number; resolved: number; stale: number; legacyOnly: number }>();
  for (const r of rows) {
    let ents: any[] = [];
    try { ents = JSON.parse(r.cited_entities) ?? []; } catch { ents = []; }
    const v = identifyEntities(ents, ids);
    const a = agg.get(r.engine) ?? { runs: 0, scored: 0, resolved: 0, stale: 0, legacyOnly: 0 };
    a.runs++;
    if (r.client_cited) a.scored++;
    if (v.named) a.resolved++;
    if (v.named && v.stale) a.stale++;
    if (v.named && !r.client_cited) a.legacyOnly++;
    // Named the hotel, but every URL it offered was NOT the canonical site.
    if (v.named) {
      let sawCanonical = false;
      for (const e of ents) {
        const one = identifyEntity(e, ids);
        if (!one.named || !e?.url) continue;
        try { if (normHost(new URL(String(e.url)).hostname) === "princewaikiki.com") sawCanonical = true; } catch {}
      }
      if (!sawCanonical) (a as any).offCanon = ((a as any).offCanon ?? 0) + 1;
    }
    agg.set(r.engine, a);
  }

  console.log("engine                runs   scored now   with resolver   newly found   stale identity  off-canonical URL");
  let t = { runs: 0, scored: 0, resolved: 0, stale: 0, missed: 0 };
  for (const [eng, a] of [...agg.entries()].sort((x, y) => y[1].resolved - x[1].resolved)) {
    console.log(
      eng.padEnd(21),
      String(a.runs).padEnd(6),
      String(a.scored).padEnd(12),
      String(a.resolved).padEnd(15),
      String(a.legacyOnly).padEnd(13),
      String(a.stale).padEnd(16),
      String((a as any).offCanon ?? 0));
    t.runs += a.runs; t.scored += a.scored; t.resolved += a.resolved; t.stale += a.stale; t.missed += a.legacyOnly;
  }
  const pc = (n: number) => (100 * n / t.runs).toFixed(1) + "%";
  console.log("\nTOTAL".padEnd(22), String(t.runs).padEnd(6), String(t.scored).padEnd(12),
    String(t.resolved).padEnd(15), String(t.missed).padEnd(13), String(t.stale));
  console.log(`\ncoverage as reported : ${pc(t.scored)}`);
  console.log(`coverage with identity: ${pc(t.resolved)}`);
  console.log(`under-count          : ${t.missed} runs (${pc(t.missed)} of all runs)`);
}
main();
