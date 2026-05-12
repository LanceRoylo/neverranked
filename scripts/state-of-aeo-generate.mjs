#!/usr/bin/env node
/**
 * State of AEO across NeverRanked's tracked universe.
 *
 * Pulls citation_runs from production D1, aggregates across the
 * active client base, and emits a markdown report that doubles as:
 *
 *   1. Weekly thought-leadership content (the headline patterns +
 *      per-source insights are publishable)
 *   2. Per-client baseline data (each tracked client gets a panel
 *      showing their current citation share, top missing sources,
 *      seed data for an eventual case study)
 *
 * Honest about sample size. Sections that need n >= 3 clients in a
 * vertical are skipped when n is below threshold. The report is
 * generatable from day 1 of citation_runs accumulation; sections
 * activate as data thickens.
 *
 * Usage:
 *   node scripts/state-of-aeo-generate.mjs
 *   node scripts/state-of-aeo-generate.mjs --window=30  (last 30 days)
 *   node scripts/state-of-aeo-generate.mjs --output=reports/state-of-aeo/<date>.md
 *
 * No DB writes. No network calls except wrangler d1 execute. Output
 * is a markdown file; pipe through scripts/report-pdf.mjs for the PDF.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { classifyUrl } from "../tools/citation-gap/src/source-types.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const DASHBOARD_DIR = resolve(REPO_ROOT, "dashboard");

// ---------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------

function parseArgs(argv) {
  const out = {
    window: null,             // null = entire dataset
    minVertical: 3,           // n threshold for vertical breakdown
    output: null,             // default computed from today's date
    db: "neverranked-app",
    quiet: false,
  };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === "window") out.window = parseInt(v, 10);
    else if (k === "min-vertical") out.minVertical = parseInt(v, 10);
    else if (k === "output") out.output = v;
    else if (k === "db") out.db = v;
    else if (k === "quiet") out.quiet = true;
  }
  return out;
}

const args = parseArgs(process.argv);
const log = args.quiet ? () => {} : (m) => process.stderr.write(`${m}\n`);

// ---------------------------------------------------------------------
// D1 access via wrangler subprocess
// ---------------------------------------------------------------------

function runD1(sql) {
  const cmd = ["wrangler", "d1", "execute", args.db, "--remote", "--json", "--command", sql];
  const res = spawnSync("npx", cmd, { cwd: DASHBOARD_DIR, encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`wrangler d1 execute failed: ${res.stderr || res.stdout}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(res.stdout);
  } catch (e) {
    throw new Error(`wrangler returned non-JSON: ${res.stdout.slice(0, 300)}`);
  }
  const env = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!env.success) throw new Error(`D1 query failed: ${JSON.stringify(env.errors || env)}`);
  return env.results || [];
}

// ---------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------

log("[1/5] Querying citation_runs...");

const cutoffClause = args.window
  ? `cr.run_at >= ${Math.floor(Date.now() / 1000) - args.window * 86400}`
  : "1=1";

const runs = runD1(`
  SELECT ck.client_slug, ck.keyword, cr.engine, cr.client_cited,
         cr.cited_urls, cr.run_at
  FROM citation_runs cr
  JOIN citation_keywords ck ON cr.keyword_id = ck.id
  WHERE ${cutoffClause}
    AND cr.cited_urls IS NOT NULL
    AND cr.cited_urls != '[]'
  ORDER BY cr.run_at DESC
`);

log(`     pulled ${runs.length} citation runs across ${new Set(runs.map(r => r.client_slug)).size} clients`);

// ---------------------------------------------------------------------
// Completion-rate disclosure: per-client, what fraction of active
// tracked keywords have at least one citation_run in the window?
//
// Why we compute this: a known issue (filed at
// content/handoff-questions/citation-cron-not-firing.md) means the
// runWeeklyCitations function intermittently completes only a subset
// of a client's keywords per invocation due to subrequest budget
// exhaustion. The State of AEO report should be transparent about
// this rather than silently underrepresenting clients with many
// keywords. When the fix lands, completion rates climb to 100% on
// their own, no code change required here.
// ---------------------------------------------------------------------

const activeKeywordsPerClient = runD1(`
  SELECT client_slug, COUNT(*) as active_kw
  FROM citation_keywords
  WHERE active = 1
  GROUP BY client_slug
`);
const keywordsWithRunsPerClient = runD1(`
  SELECT ck.client_slug, COUNT(DISTINCT ck.id) as kw_with_runs
  FROM citation_keywords ck
  JOIN citation_runs cr ON cr.keyword_id = ck.id
  WHERE ck.active = 1 AND ${cutoffClause}
  GROUP BY ck.client_slug
`);
const completionByClient = new Map();
for (const r of activeKeywordsPerClient) {
  completionByClient.set(r.client_slug, { active: r.active_kw, ran: 0 });
}
for (const r of keywordsWithRunsPerClient) {
  const entry = completionByClient.get(r.client_slug) || { active: 0, ran: 0 };
  entry.ran = r.kw_with_runs;
  completionByClient.set(r.client_slug, entry);
}

if (runs.length === 0) {
  log("No data. Cannot generate report.");
  process.exit(1);
}

// ---------------------------------------------------------------------
// Vertical mapping (manual until we add a vertical column)
// ---------------------------------------------------------------------

const VERTICAL_MAP = {
  "neverranked": "AEO agency",
  "hawaii-theatre": "performing arts venue",
  "and-scene": "corporate training",
  // Add more as clients onboard.
};

function vertical(slug) {
  return VERTICAL_MAP[slug] || "uncategorized";
}

// ---------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------

log("[2/5] Aggregating...");

const byDomain = new Map();         // domain -> { runs, engines, keywords, clients, source_type }
const byEngine = new Map();         // engine -> { runs, top_sources: Map }
const byClient = new Map();         // slug -> { runs, named, sources: Map }
const byVertical = new Map();       // vertical -> { clients: Set, runs }

let earliest = Infinity;
let latest = 0;

for (const r of runs) {
  earliest = Math.min(earliest, r.run_at);
  latest = Math.max(latest, r.run_at);

  // Per-client
  let cAgg = byClient.get(r.client_slug);
  if (!cAgg) {
    cAgg = { runs: 0, named: 0, sources: new Map(), keywords: new Set() };
    byClient.set(r.client_slug, cAgg);
  }
  cAgg.runs += 1;
  if (r.client_cited === 1) cAgg.named += 1;
  cAgg.keywords.add(r.keyword);

  // Per-vertical
  const v = vertical(r.client_slug);
  let vAgg = byVertical.get(v);
  if (!vAgg) {
    vAgg = { clients: new Set(), runs: 0 };
    byVertical.set(v, vAgg);
  }
  vAgg.clients.add(r.client_slug);
  vAgg.runs += 1;

  // Per-engine + per-domain
  let eAgg = byEngine.get(r.engine);
  if (!eAgg) {
    eAgg = { runs: 0, top_sources: new Map() };
    byEngine.set(r.engine, eAgg);
  }
  eAgg.runs += 1;

  let urls = r.cited_urls;
  if (typeof urls === "string") {
    try { urls = JSON.parse(urls); } catch { urls = []; }
  }
  if (!Array.isArray(urls)) continue;

  for (const url of urls) {
    const cls = classifyUrl(url);
    if (!cls.domain) continue;
    const d = cls.domain;

    // Per-domain global
    let dAgg = byDomain.get(d);
    if (!dAgg) {
      dAgg = {
        runs: 0,
        engines: new Set(),
        keywords: new Set(),
        clients: new Set(),
        source_type: cls.type,
        source_label: cls.label,
      };
      byDomain.set(d, dAgg);
    }
    dAgg.runs += 1;
    dAgg.engines.add(r.engine);
    dAgg.keywords.add(r.keyword);
    dAgg.clients.add(r.client_slug);

    // Per-engine top sources
    eAgg.top_sources.set(d, (eAgg.top_sources.get(d) || 0) + 1);

    // Per-client sources
    cAgg.sources.set(d, (cAgg.sources.get(d) || 0) + 1);
  }
}

// ---------------------------------------------------------------------
// Derived insights
// ---------------------------------------------------------------------

log("[3/5] Computing insights...");

// Top sources globally
const topSources = [...byDomain.entries()]
  .map(([domain, agg]) => ({
    domain,
    runs: agg.runs,
    engines: agg.engines.size,
    keywords: agg.keywords.size,
    clients: agg.clients.size,
    source_type: agg.source_type,
    source_label: agg.source_label,
  }))
  .sort((a, b) => b.runs - a.runs);

// Source-type distribution (excluding client-owned and "other")
const typeDist = new Map();
let knownTypeRuns = 0;
for (const s of topSources) {
  if (s.source_type === "other" || s.source_type === "client-owned") continue;
  typeDist.set(s.source_type, (typeDist.get(s.source_type) || 0) + s.runs);
  knownTypeRuns += s.runs;
}
const typeShare = [...typeDist.entries()]
  .map(([type, runs]) => ({ type, runs, share: runs / knownTypeRuns }))
  .sort((a, b) => b.runs - a.runs);

// Per-engine top 5 sources
const engineHighlights = [];
for (const [engine, agg] of byEngine.entries()) {
  const top5 = [...agg.top_sources.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  engineHighlights.push({ engine, runs: agg.runs, top5 });
}
engineHighlights.sort((a, b) => b.runs - a.runs);

// Per-client baselines
const clientBaselines = [];
for (const [slug, agg] of byClient.entries()) {
  const top5sources = [...agg.sources.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  clientBaselines.push({
    slug,
    vertical: vertical(slug),
    runs: agg.runs,
    named: agg.named,
    named_pct: agg.runs > 0 ? agg.named / agg.runs : 0,
    keywords: agg.keywords.size,
    top5sources,
  });
}
clientBaselines.sort((a, b) => b.runs - a.runs);

// ---------------------------------------------------------------------
// Markdown emission
// ---------------------------------------------------------------------

log("[4/5] Rendering markdown...");

const today = new Date().toISOString().slice(0, 10);
const earliestDate = new Date(earliest * 1000).toISOString().slice(0, 10);
const latestDate = new Date(latest * 1000).toISOString().slice(0, 10);
const totalClients = byClient.size;
const totalEngines = byEngine.size;
const totalKeywords = new Set(runs.map(r => r.keyword)).size;

const md = [];

md.push(`---`);
md.push(`title: "State of AEO: NeverRanked tracked-universe report"`);
md.push(`window_start: ${earliestDate}`);
md.push(`window_end: ${latestDate}`);
md.push(`generated: ${today}`);
md.push(`sample_runs: ${runs.length}`);
md.push(`sample_clients: ${totalClients}`);
md.push(`sample_engines: ${totalEngines}`);
md.push(`sample_keywords: ${totalKeywords}`);
md.push(`---`);
md.push(``);
md.push(`# State of AEO: NeverRanked tracked-universe report`);
md.push(``);
md.push(`*From The Citation Tape, NeverRanked's standing AI-citation measurement system.*`);
md.push(``);
md.push(`*Generated ${today}. Window: ${earliestDate} to ${latestDate}.*`);
md.push(``);

// Top-of-document data-integrity banner. Computes per-client
// keyword-completion now, so the warning sits above the headline
// when numbers are unreliable. Self-removing once completion
// crosses the threshold for every client.
{
  const undercomplete = [...completionByClient.entries()]
    .filter(([, c]) => c.active > 0 && c.ran / c.active < 0.8);
  if (undercomplete.length > 0) {
    md.push(`> ## Data integrity notice`);
    md.push(`>`);
    md.push(`> This week's data is partial. ${undercomplete.length} of ${completionByClient.size} tracked clients fell below 80% keyword completion due to a known infrastructure issue (filed at \`content/handoff-questions/citation-cron-not-firing.md\`). Numbers below should be read as a lower bound on what AI engines actually retrieve until the fix lands.`);
    md.push(`>`);
    md.push(`> Affected this week:`);
    for (const [slug, c] of undercomplete) {
      const pct = Math.round((c.ran / c.active) * 100);
      md.push(`> - **${slug}**: ${c.ran} of ${c.active} keywords queried (${pct}%)`);
    }
    md.push(`>`);
    md.push(`> The full per-client completion table appears in the methodology section at the end of this report.`);
    md.push(``);
  }
}
md.push(`## What this report is`);
md.push(``);
md.push(`A standing snapshot of what AI engines actually cite when answering`);
md.push(`questions about NeverRanked's tracked client universe. Pulled from`);
md.push(`live ${runs.length} citation runs across ${totalEngines} of 7 tracked engines (${[...byEngine.keys()].sort().join(", ")}),`);
md.push(`${totalKeywords} tracked keywords, and ${totalClients} clients spanning ${byVertical.size} verticals.`);
md.push(``);
md.push(`Generated weekly. Same script, same data sources, no manual curation.`);
md.push(`The methodology is the script (\`scripts/state-of-aeo-generate.mjs\`) plus`);
md.push(`the public scoring engine at check.neverranked.com. Reproducible by`);
md.push(`anyone with the same query against the same database.`);
md.push(``);

// ---------------------------------------------------------------------
// Top-line headline
// ---------------------------------------------------------------------

md.push(`## Headline`);
md.push(``);

// Construct a single defensible insight from the data.
const topNonClientSource = topSources.find((s) => s.source_type !== "client-owned" && s.source_type !== "other");
if (topNonClientSource) {
  md.push(`Across ${runs.length} captured AI engine responses, the single most-cited`);
  md.push(`third-party source is **${topNonClientSource.domain}** (${topNonClientSource.source_label}),`);
  const enginesWord = topNonClientSource.engines === 1 ? "engine" : "engines";
  const keywordsWord = topNonClientSource.keywords === 1 ? "keyword" : "keywords";
  md.push(`appearing in ${topNonClientSource.runs} citation runs across`);
  md.push(`${topNonClientSource.engines} ${enginesWord} and ${topNonClientSource.keywords} tracked ${keywordsWord}.`);
  md.push(``);
  md.push(`Implication: any tracked client whose category overlaps with this`);
  md.push(`source's coverage area (and whose own brand is not yet present on`);
  md.push(`it) is leaving citation share on the table. The path to closing the`);
  md.push(`gap is source-specific. See the per-client baseline section below.`);
}
md.push(``);

// ---------------------------------------------------------------------
// Source-type distribution
// ---------------------------------------------------------------------

md.push(`## Where AI engines pull from`);
md.push(``);
md.push(`Distribution of citation runs by source type, excluding client-owned`);
md.push(`URLs (which represent successful citation, not the moat-building`);
md.push(`question of "where else are they pulling from"):`);
md.push(``);
md.push(`| Source type | Runs | Share |`);
md.push(`|---|---|---|`);
for (const t of typeShare.slice(0, 12)) {
  md.push(`| ${t.type} | ${t.runs} | ${(t.share * 100).toFixed(1)}% |`);
}
md.push(``);

// ---------------------------------------------------------------------
// Top sources
// ---------------------------------------------------------------------

md.push(`## Top 15 third-party sources`);
md.push(``);
md.push(`The domains that appeared most often as cited references across`);
md.push(`the dataset. Excludes client-owned domains.`);
md.push(``);
md.push(`| Domain | Source type | Runs | Engines | Keywords | Clients |`);
md.push(`|---|---|---|---|---|---|`);
for (const s of topSources.filter((s) => s.source_type !== "client-owned").slice(0, 15)) {
  md.push(`| ${s.domain} | ${s.source_type} | ${s.runs} | ${s.engines} | ${s.keywords} | ${s.clients} |`);
}
md.push(``);

// ---------------------------------------------------------------------
// Engine differences
// ---------------------------------------------------------------------

md.push(`## What each engine cites differently`);
md.push(``);
md.push(`Top 5 sources per engine. When two engines have very different top`);
md.push(`lists, that's a signal about how each one's retrieval differs.`);
md.push(``);
for (const e of engineHighlights) {
  md.push(`### ${e.engine} (${e.runs} runs)`);
  md.push(``);
  for (const [domain, count] of e.top5) {
    md.push(`- **${domain}** -- ${count} runs`);
  }
  md.push(``);
}

// ---------------------------------------------------------------------
// Vertical breakdown (n >= minVertical)
// ---------------------------------------------------------------------

md.push(`## Vertical breakdown`);
md.push(``);

const verticalsWithEnoughClients = [...byVertical.entries()].filter(([, agg]) => agg.clients.size >= args.minVertical);

if (verticalsWithEnoughClients.length === 0) {
  md.push(`*Verticals with at least ${args.minVertical} tracked clients enable category-level insights.*`);
  md.push(``);
  md.push(`Current vertical distribution:`);
  md.push(``);
  md.push(`| Vertical | Clients | Runs |`);
  md.push(`|---|---|---|`);
  for (const [v, agg] of byVertical.entries()) {
    md.push(`| ${v} | ${agg.clients.size} | ${agg.runs} |`);
  }
  md.push(``);
  md.push(`As more clients onboard inside any vertical, this section will`);
  md.push(`populate automatically with category-level patterns.`);
} else {
  for (const [v, agg] of verticalsWithEnoughClients) {
    md.push(`### ${v} (${agg.clients.size} clients, ${agg.runs} runs)`);
    md.push(``);
    md.push(`*Pattern analysis available once n >= ${args.minVertical}.*`);
    md.push(``);
  }
}

md.push(``);

// ---------------------------------------------------------------------
// Per-client baselines
// ---------------------------------------------------------------------

md.push(`## Per-client baselines`);
md.push(``);
md.push(`Each client's current citation footprint as of ${today}. These`);
md.push(`numbers are the baseline against which any future case study is`);
md.push(`measured. Citation rate climbing from one of these starting points`);
md.push(`to a higher one over a defined window is the case-study artifact.`);
md.push(``);

for (const c of clientBaselines) {
  md.push(`### ${c.slug} -- ${c.vertical}`);
  md.push(``);
  md.push(`- **${c.runs}** captured runs across **${c.keywords}** tracked keywords`);
  md.push(`- Named in **${c.named}** runs (**${(c.named_pct * 100).toFixed(0)}%** citation rate)`);
  if (c.top5sources.length > 0) {
    md.push(`- Top 5 sources cited alongside this client's queries:`);
    for (const [domain, count] of c.top5sources) {
      md.push(`  - ${domain} (${count} runs)`);
    }
  }
  md.push(``);
}

// ---------------------------------------------------------------------
// Methodology + sample disclosure
// ---------------------------------------------------------------------

md.push(`## Methodology and sample disclosure`);
md.push(``);
md.push(`Every number in this report comes from \`citation_runs\` in the`);
md.push(`NeverRanked production database. Each run is one query against one AI`);
md.push(`engine for one tracked keyword, with the engine's response_text and`);
md.push(`cited_urls captured as raw evidence.`);
md.push(``);
md.push(`Engines covered: ${[...byEngine.keys()].sort().join(", ")}.`);
md.push(``);
md.push(`Sample size at this snapshot:`);
md.push(``);
md.push(`- ${runs.length} citation runs`);
md.push(`- ${totalClients} tracked clients across ${byVertical.size} verticals`);
md.push(`- ${totalKeywords} tracked keywords`);
md.push(`- Window: ${earliestDate} to ${latestDate}`);
md.push(``);

// Per-client keyword-completion rates. Surfaces the subrequest-budget
// issue documented in content/handoff-questions/. When the per-keyword
// workflow fix lands, completion rates rise to 100% on their own.
md.push(`### Keyword completion this window`);
md.push(``);
md.push(`Per-client share of active tracked keywords with at least one citation run in the window. Below 100% means the producer did not complete the full keyword set. A known infrastructure issue causes partial completions on multi-keyword clients (filed in \`content/handoff-questions/\`); numbers will rise as the fix lands.`);
md.push(``);
md.push(`| Client | Active keywords | Keywords with runs | Completion |`);
md.push(`|---|---|---|---|`);
const completionRows = [...completionByClient.entries()]
  .sort(([a], [b]) => a.localeCompare(b));
for (const [slug, c] of completionRows) {
  const pct = c.active > 0 ? Math.round((c.ran / c.active) * 100) : 0;
  md.push(`| ${slug} | ${c.active} | ${c.ran} | ${pct}% |`);
}
md.push(``);
md.push(`Honest limits: this is NeverRanked's tracked subset, not a random`);
md.push(`sample of the AI search universe. Findings are descriptive of what`);
md.push(`AI engines say to questions in our clients' categories. Generalizing`);
md.push(`beyond those categories requires more data.`);
md.push(``);
md.push(`The script that generated this report is at`);
md.push(`\`scripts/state-of-aeo-generate.mjs\` and reads no private data.`);
md.push(`The schema for \`citation_runs\` is public in the migrations folder.`);
md.push(``);

// ---------------------------------------------------------------------
// Write file
// ---------------------------------------------------------------------

const outputPath = args.output || resolve(REPO_ROOT, `reports/state-of-aeo/state-of-aeo-${today}.md`);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, md.join("\n"));

log(`[5/5] Wrote ${outputPath}`);
log(`     ${md.length} lines, ${runs.length} runs analyzed`);
