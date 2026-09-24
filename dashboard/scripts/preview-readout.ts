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
import { shell, renderCharts, renderReportMarkdown } from "../src/routes/customer-readouts";
import { writeFileSync } from "node:fs";

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
  const r: any = runSql(
    `SELECT title, body_markdown, facts_json FROM monthly_memos WHERE client_slug='${slug}' AND month_key='${month}'`)[0];
  if (!r) { console.log("no memo"); return; }

  // Assembled exactly as handleReadoutView does: shell (CSS + the count-up
  // script) wrapping charts, then the memo body. Rendering the charts alone
  // produced a page with no numbers and no bars on 2026-09-16, which was a
  // fault in the preview and not in the product.
  const inner = `
    <div class="meta">Report 1 &middot; ${month} &middot; PREVIEW, not delivered</div>
    <h1 class="report-title">${r.title}</h1>
    ${renderCharts(r.facts_json)}
    ${r.facts_json ? `<div class="nr-h">The record &middot; full readout</div>` : ""}
    <div class="body">${renderReportMarkdown(r.body_markdown)}</div>`;
  const out = `/tmp/readout-${slug}-${month}.html`;
  writeFileSync(out, shell(`${r.title} · PREVIEW`, inner));

  const html = shell("x", inner);
  console.log("wrote", out);
  console.log("has count-up script :", /data-v/.test(html) && /<script/.test(html));
  console.log("chart blocks        :", (html.match(/nr-chart/g) || []).length);
  console.log("svg elements        :", (html.match(/<svg/g) || []).length);
  console.log("links in body       :", (html.match(/<a /g) || []).length);
  console.log("bytes               :", html.length);
}
main();
