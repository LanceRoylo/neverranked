/* Audit a memo against the database, before it reaches a customer.
 *
 *   npx tsx scripts/audit-memo.ts <client-slug> [YYYY-MM]
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



/* WHY THIS EXISTS.
 *
 * On 2026-09-25, auditing the first paid deliverable BY HAND found things no
 * gate caught: a cohort count padded with URL path segments ("Information",
 * "Rooms"), a methodology line describing three laptop passes when the month
 * had run on 25 separate days, and a citation figure that could not be
 * reproduced under any definition. Two of those were caught sixty seconds
 * before delivery because Lance stopped and asked for one more look.
 *
 * Hand-reading works at one customer and fails at four. This is the same read,
 * as a command.
 *
 * It REPORTS. It gates nothing and writes nothing, so a false finding here
 * costs a minute rather than blocking a delivery. The fail-closed gates in the
 * delivery path are unchanged. */

type Finding = { severity: "FAIL" | "WARN"; what: string; detail: string };
const findings: Finding[] = [];
const fail = (what: string, detail: string) => findings.push({ severity: "FAIL", what, detail });
const warn = (what: string, detail: string) => findings.push({ severity: "WARN", what, detail });

const BANNED: Array<[RegExp, string]> = [
  [/\bcopilot\b/i, "names Copilot; there is no Copilot data"],
  [/seven\s+(ai\s+)?(engines|tools)/i, "counts the control as an AI tool; house form is six plus a Bing control"],
  [/45[^0-9]{1,4}95/, "the retracted 45-to-95 figure"],
  [/14\s*of\s*19/i, "the retracted 14-of-19 figure"],
  [/citation[- ]grade/i, "the citation-grade tier, removed from public copy"],
  [/—/, "em dash; house style forbids it"],
  [/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, "emoji"],
  [/\b(that is why|this is because|the reason is)\b/i, "states a cause the measurement may not establish"],
];

/** Words that name a page rather than a business. Mirrors venue-attribution. */
const PAGE_WORDS = new Set(["information","info","rooms","room","en","us","hotel","hotels","resort",
  "resorts","overview","amenities","dining","about","contact","booking","rates","offers","home","index"]);
const isPageLabel = (label: string): boolean => {
  const w = String(label).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return w.length > 0 && w.every((x) => PAGE_WORDS.has(x));
};

const numWord: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50 };
function wordToNum(s: string): number | null {
  const m = s.toLowerCase().match(/^(twenty|thirty|forty|fifty)[- ]?(one|two|three|four|five|six|seven|eight|nine)?$/);
  if (!m) return null;
  const ones: Record<string, number> = { one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9 };
  return numWord[m[1]] + (m[2] ? ones[m[2]] : 0);
}

async function main() {
  const slug = process.argv[2] ?? "prince-waikiki";
  const month = process.argv[3] ?? new Date().toISOString().slice(0, 7);

  const row: any = runSql(
    `SELECT id, body_markdown, facts_json, COALESCE(rules_hash,'') rules,
            COALESCE(delivered_at,0) delivered, datetime(updated_at,'unixepoch') updated
       FROM monthly_memos WHERE client_slug='${slug}' AND month_key='${month}'`)[0];
  if (!row) { console.log(`no memo for ${slug} ${month}`); process.exit(2); }
  const b: string = row.body_markdown || "";
  const f = JSON.parse(row.facts_json || "{}");
  const monthStart = `${month}-01`;

  console.log(`\nAUDIT  ${slug} ${month}  memo ${row.id}  ${row.delivered ? "DELIVERED" : "draft"}  updated ${row.updated}`);
  console.log(`       ${b.length} chars, ${(b.match(/^###?\s/gm) || []).length} sections\n`);

  // 1. Structure.
  if (!/\n\s*Lance\s*$/.test(b.trimEnd() + "\n")) fail("structure", "does not end on the sign-off; may be truncated");
  if ((b.match(/^###?\s/gm) || []).length < 4) fail("structure", "fewer than four sections");

  // 2. Banned claims and house style.
  for (const [re, label] of BANNED) {
    const m = b.match(re);
    if (m) fail("claim/style", `${label} -> ${JSON.stringify(m[0])}`);
  }

  // 3. Greeting matches the contact on file.
  const greet = b.match(/^\s*([A-Z][a-z]+),\s/m);
  const contact: any = runSql(`SELECT primary_contact_name n FROM customers WHERE client_slug='${slug}'`)[0];
  const first = contact?.n ? String(contact.n).split(" ")[0] : null;
  if (greet && first && greet[1] !== first) fail("greeting", `memo says "${greet[1]}", contact on file is "${first}"`);
  if (greet && !first) warn("greeting", `memo addresses "${greet[1]}" but no contact is on file`);

  // 4. Cohort claims. The 2026-09-25 defect: "third among 38" counted URL
  //    path segments as hotels.
  const venue = (f.venue?.rows || []).filter((r: any) => r && typeof r.label === "string");
  const pageish = venue.filter((r: any) => isPageLabel(r.label));
  if (pageish.length) fail("cohort", `page labels counted as businesses: ${pageish.map((r: any) => r.label).join(", ")}`);
  const dupes = new Map<string, string[]>();
  for (const r of venue) {
    const k = String(r.label).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean).sort().join(" ");
    const near = [...dupes.keys()].find((x) => x.includes(k) || k.includes(x));
    if (near) dupes.get(near)!.push(r.label); else dupes.set(k, [r.label]);
  }
  for (const [, labels] of dupes) if (labels.length > 1) warn("cohort", `possible duplicate venues: ${labels.join(" / ")}`);
  for (const m of b.matchAll(/among\s+([a-z-]+|\d+)\s+[A-Za-z ]*?(hotels|venues|businesses)/gi)) {
    const claimed = /^\d+$/.test(m[1]) ? Number(m[1]) : wordToNum(m[1]);
    if (claimed === null) continue;
    if (Math.abs(claimed - venue.length) > 1)
      fail("cohort", `claims "among ${m[1]}" but facts hold ${venue.length} venue rows`);
  }

  // 5. Cadence. The memo must describe the instrument from data, never from
  //    the frozen plan, which on 2026-09-25 said "three full passes".
  const days: any = runSql(
    `SELECT COUNT(DISTINCT date(cr.run_at,'unixepoch')) d FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id=cr.keyword_id
      WHERE ck.client_slug='${slug}' AND cr.run_at >= unixepoch('${monthStart}')
        AND cr.run_at < unixepoch('${monthStart}','+1 month')`)[0];
  const measuredDays = Number(days?.d ?? 0);
  const passClaim = b.match(/(\w+)\s+full\s+passes/i);
  if (passClaim) fail("cadence", `describes the month as "${passClaim[0]}"; it ran on ${measuredDays} separate days`);
  for (const m of b.matchAll(/across\s+(\d+)\s+days/gi)) {
    if (Number(m[1]) !== measuredDays) fail("cadence", `claims ${m[1]} measurement days, database says ${measuredDays}`);
  }

  // 6. Movement language with no prior to compare against.
  const priorMemo: any = runSql(
    `SELECT month_key FROM monthly_memos WHERE client_slug='${slug}' AND delivered_at IS NOT NULL
        AND month_key < '${month}' ORDER BY month_key DESC LIMIT 1`)[0];
  if (!priorMemo) {
    for (const m of b.matchAll(/[^.\n]*\b(held flat|stayed level|was unchanged|did not move|rose from|fell from|up from|down from)\b[^.\n]*\./gi))
      fail("movement", `no prior delivered memo, yet: ${m[0].trim().slice(0, 120)}`);
  }

  // 7. A crawl remedy aimed at a surface that fetches nothing.
  const mk = (f.engines || []).filter((e: any) => e.layer === "model_knowledge").map((e: any) => e.name);
  for (const m of b.matchAll(/[^.\n]*(robots\.txt|schema|crawl|index)[^.\n]*\./gi)) {
    for (const name of mk) if (new RegExp(`\\b${name}\\b`, "i").test(m[0]))
      fail("layer", `${name} fetches nothing, yet a crawl-side remedy names it: ${m[0].trim().slice(0, 120)}`);
  }

  // 8. Every per-question percentage, traced to citation_runs.
  const qrows: any[] = runSql(
    `SELECT ck.keyword kw, COUNT(*) n, ROUND(100.0*SUM(cr.client_cited)/COUNT(*),1) pct
       FROM citation_runs cr JOIN citation_keywords ck ON ck.id=cr.keyword_id
      WHERE ck.client_slug='${slug}' AND cr.run_at >= unixepoch('${monthStart}')
        AND cr.run_at < unixepoch('${monthStart}','+1 month')
      GROUP BY ck.id`) as any;
  const byKw = new Map(qrows.map((r) => [String(r.kw).toLowerCase(), Number(r.pct)]));
  let checked = 0, matched = 0;
  for (const m of b.matchAll(/"([^"]{10,120})"[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*%/g)) {
    const actual = byKw.get(m[1].toLowerCase());
    if (actual === undefined) continue;
    checked++;
    if (Math.abs(actual - Number(m[2])) <= 0.15) matched++;
    else fail("figure", `"${m[1].slice(0, 50)}" quoted at ${m[2]}%, database says ${actual}%`);
  }
  // A CHECK THAT CHECKED NOTHING MUST SAY SO.
  //
  // On its first run against hawaii-theatre this traced 0 of 0 figures,
  // because the quoted-question pattern did not match that memo's phrasing,
  // and the audit still printed "no findings". A checker that silently
  // inspects nothing and reports clean is the failure this whole file exists
  // to catch, so it is not allowed to happen here either.
  if (checked === 0) {
    warn("coverage", `traced NO per-question figures; the quote pattern matched nothing in this memo, so that check proved nothing`);
  }
  console.log(`       per-question figures traced: ${matched}/${checked} matched\n`);

  // 9. A question described as losing citations must actually have been asked.
  //
  // 2026-09-24, hawaii-theatre: the draft reported twelve questions returning
  // zero citations after citing heavily the month before, and made verifying
  // that loss the first punch-list item. All twelve had been switched off. The
  // generator no longer writes this, and the audit checks it independently
  // rather than trusting that.
  const inactive: any[] = runSql(
    `SELECT ck.keyword kw FROM citation_keywords ck
      WHERE ck.client_slug='${slug}' AND ck.active=0`) as any;
  const offNames = inactive.map((r) => String(r.kw).toLowerCase());
  const lossWords = /\b(returned zero|zero citations|dropped|fell|declined|crashed|lost citations|went to zero|stopped)\b/i;
  for (const sentence of b.split(/(?<=\.)\s+/)) {
    if (!lossWords.test(sentence)) continue;
    for (const q of sentence.matchAll(/"([^"]{10,140})"/g)) {
      if (offNames.includes(q[1].toLowerCase()))
        fail("not-asked", `"${q[1].slice(0, 60)}" is INACTIVE and cannot have lost anything: ${sentence.trim().slice(0, 110)}`);
    }
  }

  // Report.
  const fails = findings.filter((x) => x.severity === "FAIL");
  if (!findings.length) console.log("  no findings\n");
  for (const x of findings) console.log(`  ${x.severity}  [${x.what}] ${x.detail}`);
  console.log(`\n  ${fails.length} FAIL, ${findings.length - fails.length} WARN\n`);
  process.exit(fails.length ? 1 : 0);
}
main();
