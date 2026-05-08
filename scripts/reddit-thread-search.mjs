#!/usr/bin/env node
/**
 * CLI: reddit-thread-search
 *
 * Discover reddit threads likely to be cited by AI engines for a
 * given category. Phase 1: read-only, prints to stdout, no DB writes.
 *
 * Usage:
 *   node scripts/reddit-thread-search.mjs \
 *     --category "best CRM for real estate" \
 *     --region "Hawaii" \
 *     --limit 20 \
 *     --format table
 *
 * Formats: table (default) | json | markdown
 */

import { discoverThreads } from "../tools/reddit-tracker/src/search.mjs";

function parseArgs(argv) {
  const out = {
    category: null,
    region: null,
    limit: 20,
    format: "table",
    quiet: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--category":
      case "-c":
        out.category = next; i++; break;
      case "--region":
      case "-r":
        out.region = next; i++; break;
      case "--limit":
      case "-l":
        out.limit = Math.max(1, Math.min(100, parseInt(next, 10) || 20)); i++; break;
      case "--format":
      case "-f":
        out.format = (next || "").toLowerCase(); i++; break;
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
  console.log(`reddit-thread-search — discover reddit threads likely to be cited by AI engines

Usage:
  node scripts/reddit-thread-search.mjs --category <text> [options]

Required:
  --category, -c <text>   Category query, e.g. "best CRM for real estate"

Options:
  --region,   -r <text>   Optional region filter, e.g. "Hawaii"
  --limit,    -l <n>      Top-N results to return (default 20, max 100)
  --format,   -f <fmt>    Output format: table | json | markdown (default table)
  --quiet,    -q          Suppress progress messages on stderr
  --help,     -h          Show this help

Examples:
  node scripts/reddit-thread-search.mjs -c "best CRM for real estate" -r Hawaii
  node scripts/reddit-thread-search.mjs -c "AI listing tools for realtors" -f markdown -l 10
`);
}

function fmtAge(ts) {
  if (!ts) return "?";
  const days = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (days < 60) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

function truncate(s, n) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function renderTable(rows) {
  if (rows.length === 0) return "(no on-topic threads found — try widening the category or relaxing the relevance floor)";
  const lines = [];
  lines.push("Rank  Score  Relev  Recency  Upvote  Likely  Sub                  Age   Title");
  lines.push("----  -----  -----  -------  ------  ------  -------------------  ----  ----------------------------------------");
  rows.forEach((r, i) => {
    const rank = String(i + 1).padStart(2, " ");
    const score = r.composite_score.toFixed(3);
    const rel = (r.topic_relevance ?? 0).toFixed(2);
    const rec = r.recency_score.toFixed(2);
    const up = r.upvote_score.toFixed(2);
    const lk = r.citation_likelihood.toFixed(2);
    const sub = truncate("r/" + r.subreddit, 19).padEnd(19, " ");
    const age = fmtAge(r.posted_at).padStart(4, " ");
    const title = truncate(r.title, 60);
    lines.push(`  ${rank}  ${score}   ${rel}    ${rec}    ${up}    ${lk}  ${sub}  ${age}  ${title}`);
  });
  lines.push("");
  rows.forEach((r, i) => {
    lines.push(`[${i + 1}] ${r.url}`);
  });
  return lines.join("\n");
}

function renderMarkdown(rows, opts) {
  const lines = [];
  lines.push(`# Reddit thread discovery — ${opts.category}${opts.region ? ` (${opts.region})` : ""}`);
  lines.push("");
  lines.push(`Run at: ${new Date().toISOString()}  ·  ${rows.length} threads`);
  lines.push("");
  lines.push("| # | Score | Sub | Age | Upvotes | Comments | Title |");
  lines.push("|---|-------|-----|-----|---------|----------|-------|");
  rows.forEach((r, i) => {
    const title = `[${truncate(r.title, 80).replace(/\|/g, "\\|")}](${r.url})`;
    lines.push(`| ${i + 1} | ${r.composite_score.toFixed(3)} | r/${r.subreddit} | ${fmtAge(r.posted_at)} | ${r.op_score} | ${r.comment_count} | ${title} |`);
  });
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.category) {
    console.error("error: --category is required\n");
    printHelp();
    process.exit(2);
  }
  if (!["table", "json", "markdown"].includes(args.format)) {
    console.error(`error: --format must be one of: table, json, markdown (got "${args.format}")`);
    process.exit(2);
  }

  const onProgress = args.quiet ? () => {} : (msg) => process.stderr.write(`${msg}\n`);

  const threads = await discoverThreads({
    category: args.category,
    region: args.region,
    limit: args.limit,
    onProgress,
  });

  if (args.format === "json") {
    process.stdout.write(JSON.stringify({
      category: args.category,
      region: args.region,
      run_at: new Date().toISOString(),
      threads,
    }, null, 2) + "\n");
  } else if (args.format === "markdown") {
    process.stdout.write(renderMarkdown(threads, args) + "\n");
  } else {
    process.stdout.write(renderTable(threads) + "\n");
  }
}

main().catch((err) => {
  console.error(`reddit-thread-search failed: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
