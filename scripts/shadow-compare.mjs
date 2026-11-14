#!/usr/bin/env node
//
// shadow-compare.mjs — the December 2026 plain-question shadow, read against
// production. READ-ONLY: every query goes through scripts/d1.mjs, which
// refuses anything but a single SELECT.
//
//   node scripts/shadow-compare.mjs            all shadow nights so far
//   node scripts/shadow-compare.mjs 2026-12-04 one night
//
// THE COMPARISON (pre-registered in content/preregistrations/2026-12-plain-question.md):
// a shadow answer is paired with the production answer for the same keyword,
// engine and UTC night. "Named" is recomputed on BOTH sides with the same
// test, in SQL: the business name appears in the answer text, ignoring case,
// names under 4 characters never match. This matches textNamesBusiness() in
// dashboard/src/lib/shadow-arms.ts. It is NOT the client-facing figure, which
// also counts links to the client's site, and it is not meant to be.
//
// Gemini shadow URLs are stored unresolved (grounding redirect links), so URL
// figures for those arms are not comparable. Nothing here uses URLs.

import { execFileSync } from "node:child_process";

const night = process.argv[2];
if (night && !/^\d{4}-\d{2}-\d{2}$/.test(night)) {
  console.error("usage: node scripts/shadow-compare.mjs [YYYY-MM-DD]");
  process.exit(2);
}

function q(sql) {
  const out = execFileSync("node", [new URL("./d1.mjs", import.meta.url).pathname, "--json", sql], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out);
}

const nightFilter = night ? `AND s.night = '${night}'` : "";

// One production row per (keyword, engine, night): the first of the night.
const rows = q(`
WITH biz AS (
  SELECT cu.client_slug, COALESCE(ic.business_name, cu.name) AS name
    FROM customers cu
    LEFT JOIN injection_configs ic ON ic.client_slug = cu.client_slug
),
prod AS (
  SELECT c.keyword_id, c.engine, date(c.run_at, 'unixepoch') AS night,
         c.response_text, c.cited_entities,
         ROW_NUMBER() OVER (PARTITION BY c.keyword_id, c.engine, date(c.run_at, 'unixepoch') ORDER BY c.run_at) AS rn
    FROM citation_runs c
   WHERE c.run_at >= unixepoch('2026-12-01')
)
SELECT s.night, s.arm, s.engine, s.keyword_id,
       s.failure IS NOT NULL AS shadow_failed,
       CASE WHEN length(b.name) >= 4 AND instr(lower(s.response_text), lower(b.name)) > 0 THEN 1 ELSE 0 END AS shadow_named,
       s.entity_count AS shadow_entities,
       p.response_text IS NOT NULL AS has_prod,
       CASE WHEN length(b.name) >= 4 AND instr(lower(p.response_text), lower(b.name)) > 0 THEN 1 ELSE 0 END AS prod_named,
       CASE WHEN json_valid(p.cited_entities) THEN json_array_length(p.cited_entities) END AS prod_entities,
       s.cost_usd
  FROM engine_shadow_runs s
  LEFT JOIN biz b ON b.client_slug = s.client_slug
  LEFT JOIN prod p ON p.keyword_id = s.keyword_id AND p.engine = s.engine AND p.night = s.night AND p.rn = 1
 WHERE 1 = 1 ${nightFilter}
`);

if (rows.length === 0) {
  console.log("No shadow rows yet" + (night ? ` for ${night}` : "") + ".");
  process.exit(0);
}

const median = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) : "n/a");

const byArm = new Map();
for (const r of rows) {
  const a = byArm.get(r.arm) ?? { engine: r.engine, rows: 0, failed: 0, unpaired: 0, pairs: 0, prodNamed: 0, shadowNamed: 0, prodEnt: [], shadowEnt: [], cost: 0 };
  a.rows++;
  a.cost += r.cost_usd ?? 0;
  if (r.shadow_failed) a.failed++;
  else if (!r.has_prod) a.unpaired++;
  else {
    a.pairs++;
    a.prodNamed += r.prod_named;
    a.shadowNamed += r.shadow_named;
    a.prodEnt.push(r.prod_entities);
    a.shadowEnt.push(r.shadow_entities);
  }
  byArm.set(r.arm, a);
}

const nights = [...new Set(rows.map((r) => r.night))].sort();
console.log(`Shadow nights: ${nights.join(", ")}`);
for (const n of nights) {
  const kws = new Set(rows.filter((r) => r.night === n).map((r) => r.keyword_id)).size;
  const usd = rows.filter((r) => r.night === n).reduce((s, r) => s + (r.cost_usd ?? 0), 0);
  console.log(`  ${n}: ${kws} keywords with shadow rows, $${usd.toFixed(2)} estimated`);
}
console.log("");
console.log("arm                     engine      pairs  instructed named   plain named       points  failed unpaired  median ents (instr / plain)");
for (const [arm, a] of [...byArm].sort()) {
  const instr = `${a.prodNamed}/${a.pairs} (${pct(a.prodNamed, a.pairs)}%)`;
  const plain = `${a.shadowNamed}/${a.pairs} (${pct(a.shadowNamed, a.pairs)}%)`;
  const pts = a.pairs ? ((100 * (a.shadowNamed - a.prodNamed)) / a.pairs).toFixed(1) : "n/a";
  const ents = ["gemma", "anthropic"].includes(a.engine) ? `${median(a.prodEnt) ?? "n/a"} / ${median(a.shadowEnt) ?? "n/a"}` : "";
  console.log(`${arm.padEnd(23)} ${a.engine.padEnd(11)} ${String(a.pairs).padStart(5)}  ${instr.padEnd(17)} ${plain.padEnd(17)} ${String(pts).padStart(6)}  ${String(a.failed).padStart(6)} ${String(a.unpaired).padStart(8)}  ${ents}`);
}
console.log("");
console.log("points = plain rate minus instructed rate, on the same pairs. Exploratory arms (new models) carry no prediction.");
