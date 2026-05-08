#!/usr/bin/env node
/**
 * CLI: citation-gap-scan
 *
 * Audits real AI-engine citation_runs from production D1 for a given
 * client and outputs a per-source gap report + action briefs.
 *
 * The strategic counterpart to the reddit tracker: instead of guessing
 * which threads AI engines might cite, this tool reads what they
 * actually cite for THIS client's tracked keywords, identifies which
 * sources are missing the client (or naming the client only weakly),
 * and produces source-appropriate action briefs (Wikipedia edit,
 * TripAdvisor review push, press release pitch, etc.).
 *
 * Usage:
 *   node scripts/citation-gap-scan.mjs \
 *     --client-slug "hawaii-theatre" \
 *     --client-domains "hawaiitheatre.com" \
 *     --since-days 90 \
 *     --top 8 \
 *     --format markdown
 *
 * Requires `wrangler` installed in dashboard/ (uses production D1).
 */

import { spawnSync } from "node:child_process";
import { analyzeCitationGaps } from "../tools/citation-gap/src/analyze.mjs";
import { generateSourceBrief, renderSourceBriefMarkdown } from "../tools/citation-gap/src/brief.mjs";

function parseArgs(argv) {
  const out = {
    clientSlug: null,
    clientDomains: [],
    sinceDays: 90,
    topBriefs: 8,
    format: "markdown",
    minRuns: 1,
    quiet: false,
    db: "neverranked-app",
    remote: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--client-slug":
        out.clientSlug = next; i++; break;
      case "--client-domains":
        out.clientDomains = (next || "").split(",").map((s) => s.trim()).filter(Boolean); i++; break;
      case "--since-days":
        out.sinceDays = Math.max(1, parseInt(next, 10) || 90); i++; break;
      case "--top":
      case "-t":
        out.topBriefs = Math.max(1, Math.min(50, parseInt(next, 10) || 8)); i++; break;
      case "--min-runs":
        out.minRuns = Math.max(1, parseInt(next, 10) || 1); i++; break;
      case "--format":
      case "-f":
        out.format = (next || "").toLowerCase(); i++; break;
      case "--db":
        out.db = next; i++; break;
      case "--local":
        out.remote = false; break;
      case "--quiet":
      case "-q":
        out.quiet = true; break;
      case "--help":
      case "-h":
        printHelp(); process.exit(0);
      default:
        if (arg.startsWith("--")) {
          console.error(`Unknown flag: ${arg}`);
          printHelp(); process.exit(2);
        }
    }
  }
  return out;
}

function printHelp() {
  console.log(`citation-gap-scan -- audit real AI engine citations and surface source-level gaps

Usage:
  node scripts/citation-gap-scan.mjs --client-slug <slug> [options]

Required:
  --client-slug <slug>       Client slug (matches citation_keywords.client_slug)

Options:
  --client-domains <csv>     Comma-separated client-owned domains (so the analyzer
                              can distinguish "client cited via own site" from gaps)
  --since-days <n>           Window for citation runs (default 90)
  --top, -t <n>              How many briefs to output (default 8, max 50)
  --min-runs <n>             Drop sources cited fewer than n times (default 1)
  --format, -f <fmt>         markdown | json | summary (default markdown)
  --db <name>                D1 database name (default neverranked-app)
  --local                    Use --local instead of --remote when invoking wrangler
  --quiet, -q                Suppress progress on stderr
  --help, -h                 Show this help

Example:
  node scripts/citation-gap-scan.mjs \\
    --client-slug "hawaii-theatre" \\
    --client-domains "hawaiitheatre.com" \\
    --since-days 90 \\
    --top 8 \\
    --format markdown
`);
}

/**
 * Run a wrangler d1 query and parse JSON results. Returns the rows
 * array or throws.
 */
function runD1Query(db, sql, { remote = true, quiet = false } = {}) {
  if (!quiet) process.stderr.write(`  · running D1 query (${remote ? "remote" : "local"})...\n`);
  const args = ["wrangler", "d1", "execute", db, remote ? "--remote" : "--local", "--json", "--command", sql];
  const res = spawnSync("npx", args, { cwd: "dashboard", encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`wrangler d1 execute failed: ${res.stderr || res.stdout}`);
  }
  // Output is a JSON array of result envelopes; we use the first.
  const parsed = JSON.parse(res.stdout);
  const env = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!env.success) throw new Error(`D1 query unsuccessful: ${JSON.stringify(env.errors || env)}`);
  return env.results || [];
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.clientSlug) {
    console.error("error: --client-slug is required\n");
    printHelp();
    process.exit(2);
  }
  if (!["markdown", "json", "summary"].includes(args.format)) {
    console.error(`error: --format must be one of: markdown, json, summary (got "${args.format}")`);
    process.exit(2);
  }

  const log = args.quiet ? () => {} : (m) => process.stderr.write(`${m}\n`);

  // 1. Pull citation runs for this client_slug within the window.
  log(`[1/3] Querying D1 for ${args.clientSlug} (last ${args.sinceDays} days)...`);
  const cutoffSec = Math.floor(Date.now() / 1000) - args.sinceDays * 86400;
  const sql = `SELECT ck.client_slug, ck.keyword, cr.engine, cr.client_cited, cr.cited_urls, cr.run_at
               FROM citation_runs cr
               JOIN citation_keywords ck ON cr.keyword_id = ck.id
               WHERE ck.client_slug = '${args.clientSlug.replace(/'/g, "''")}'
                 AND cr.run_at >= ${cutoffSec}
                 AND cr.cited_urls IS NOT NULL
                 AND cr.cited_urls != '[]'
               ORDER BY cr.run_at DESC`;
  let runs;
  try {
    runs = runD1Query(args.db, sql, { remote: args.remote, quiet: args.quiet });
  } catch (err) {
    console.error(`D1 query failed: ${err.message}`);
    process.exit(1);
  }
  log(`     pulled ${runs.length} citation runs with non-empty cited_urls`);

  if (runs.length === 0) {
    process.stdout.write(args.format === "json"
      ? JSON.stringify({ client_slug: args.clientSlug, summary: { total_runs: 0 }, sources: [], briefs: [] }, null, 2) + "\n"
      : `# Citation gap audit -- ${args.clientSlug}\n\n(no citation runs with cited URLs in the last ${args.sinceDays} days)\n`);
    return;
  }

  // 2. Run gap analysis.
  log(`[2/3] Analyzing source-level gaps...`);
  const report = analyzeCitationGaps(runs, {
    slug: args.clientSlug,
    domains: args.clientDomains,
  });
  log(`     ${report.summary.unique_sources} unique sources; ${report.summary.sources_with_meaningful_gap} with meaningful gap`);

  // 3. Generate briefs for top-N gap sources (filtered by min-runs).
  const briefCandidates = report.sources_with_gap.filter((s) => s.total_runs >= args.minRuns);
  const top = briefCandidates.slice(0, args.topBriefs);
  log(`[3/3] Generating ${top.length} source-appropriate briefs...`);

  const briefs = top.map((s) => generateSourceBrief(s, { slug: args.clientSlug, domains: args.clientDomains }));

  if (args.format === "json") {
    process.stdout.write(JSON.stringify({
      client_slug: args.clientSlug,
      since_days: args.sinceDays,
      run_at: new Date().toISOString(),
      summary: report.summary,
      sources: report.sources,
      briefs,
    }, null, 2) + "\n");
    return;
  }

  if (args.format === "summary") {
    process.stdout.write(renderSummary(report, briefs, args));
    return;
  }

  // Markdown (default)
  process.stdout.write(renderMarkdown(report, briefs, args));
}

function renderSummary(report, briefs, args) {
  const lines = [];
  lines.push(`Client: ${args.clientSlug}  ·  window: ${args.sinceDays}d`);
  lines.push(`Runs: ${report.summary.total_runs}  ·  named in ${report.summary.total_runs_naming_client} (${Math.round(report.summary.runs_naming_client_ratio * 100)}%)`);
  lines.push(`Unique sources: ${report.summary.unique_sources}  ·  with meaningful gap: ${report.summary.sources_with_meaningful_gap}`);
  lines.push("");
  lines.push("Top gap sources:");
  for (const b of briefs) {
    lines.push(`  · [${b.evidence.gap_score.toFixed(2)}] ${b.source_label} (${b.domain})  -- cited ${b.evidence.runs_citing_source}x, named in ${b.evidence.client_named_runs}`);
    lines.push(`      action: ${b.action}`);
  }
  return lines.join("\n") + "\n";
}

function renderMarkdown(report, briefs, args) {
  const lines = [];
  lines.push(`# Citation gap audit -- ${args.clientSlug}`);
  lines.push("");
  lines.push(`Window: last ${args.sinceDays} days  ·  Generated ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`## Top-line`);
  lines.push("");
  lines.push(`- **${report.summary.total_runs}** citation runs captured across ${report.summary.top_keywords.length} tracked keywords`);
  lines.push(`- **${report.summary.total_runs_naming_client}** of those (${Math.round(report.summary.runs_naming_client_ratio * 100)}%) named the client in the response`);
  lines.push(`- **${report.summary.unique_sources}** unique source domains were cited`);
  lines.push(`- **${report.summary.sources_with_meaningful_gap}** sources show a meaningful gap (cite this category but not the client, or only weakly)`);
  lines.push("");

  if (report.summary.top_keywords.length > 0) {
    lines.push(`## Most-active keywords`);
    lines.push("");
    for (const k of report.summary.top_keywords) {
      lines.push(`- \`${k.keyword}\` -- ${k.runs} runs`);
    }
    lines.push("");
  }

  if (briefs.length === 0) {
    lines.push(`## Briefs`);
    lines.push("");
    lines.push("(no sources crossed the gap threshold)");
    lines.push("");
  } else {
    lines.push(`## Source-level action briefs (top ${briefs.length})`);
    lines.push("");
    for (const b of briefs) {
      lines.push(renderSourceBriefMarkdown(b));
      lines.push("---");
      lines.push("");
    }
  }

  // Full source table for transparency.
  lines.push(`## All cited sources (full)`);
  lines.push("");
  lines.push(`| Domain | Type | Runs | Client named | Gap | Engines |`);
  lines.push(`|--------|------|------|--------------|-----|---------|`);
  for (const s of report.sources) {
    lines.push(`| ${s.domain} | ${s.source_type} | ${s.total_runs} | ${s.client_named_runs} (${Math.round(s.client_named_ratio * 100)}%) | ${s.gap_score.toFixed(2)} | ${s.engines.join(", ")} |`);
  }
  lines.push("");

  return lines.join("\n");
}

main().catch((err) => {
  console.error(`citation-gap-scan failed: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
