#!/usr/bin/env node
/**
 * CLI: reddit-brief-generate
 *
 * Closes the loop on the original Phase 1 spec: "outputs a prioritized
 * list of reply briefs." Wraps the discovery -> mention -> brief
 * pipeline into a single command.
 *
 * Pipeline:
 *   1. Discover top-N threads for a category (reuses search.mjs)
 *   2. For each thread, scan for client + competitor mentions
 *   3. Generate a brief skeleton per thread
 *   4. Sort briefs by gap-priority (no-mention + many competitors > all else)
 *   5. Output as markdown (default) or JSON
 *
 * Usage:
 *   node scripts/reddit-brief-generate.mjs \
 *     --category "best CRM for real estate" \
 *     --client-slug "test-client" \
 *     --client-names "Acme CRM" \
 *     --competitors "Follow Up Boss,LionDesk,Salesforce,HubSpot" \
 *     --top 5 \
 *     --format markdown
 */

import { discoverThreads } from "../tools/reddit-tracker/src/search.mjs";
import { scanThreadForMentions } from "../tools/reddit-tracker/src/mentions.mjs";
import { generateBriefSkeleton, renderBriefMarkdown } from "../tools/reddit-tracker/src/brief.mjs";

function parseArgs(argv) {
  const out = {
    category: null,
    region: null,
    clientSlug: null,
    clientNames: [],
    clientDomains: [],
    clientAliases: [],
    competitors: [],
    requiredTokens: [],
    discoverLimit: 12,
    topBriefs: 5,
    topComments: 12,
    format: "markdown",
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
      case "--client-slug":
        out.clientSlug = next; i++; break;
      case "--client-names":
        out.clientNames = (next || "").split(",").map((s) => s.trim()).filter(Boolean); i++; break;
      case "--client-domains":
        out.clientDomains = (next || "").split(",").map((s) => s.trim()).filter(Boolean); i++; break;
      case "--client-aliases":
        out.clientAliases = (next || "").split(",").map((s) => s.trim()).filter(Boolean); i++; break;
      case "--competitors":
        out.competitors = (next || "").split(",").map((s) => s.trim()).filter(Boolean)
          .map((name) => ({ name, surfaceForms: [name] })); i++; break;
      case "--required":
        // Tokens that MUST appear in the thread title for the
        // relevance gate to pass. Use for niche categories where
        // anchor extraction lets in noise (e.g. "improv based
        // corporate training" leaks into generic corporate-training
        // threads without --required improv).
        out.requiredTokens = (next || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean); i++; break;
      case "--discover-limit":
        out.discoverLimit = Math.max(1, Math.min(50, parseInt(next, 10) || 12)); i++; break;
      case "--top":
      case "-t":
        out.topBriefs = Math.max(1, Math.min(20, parseInt(next, 10) || 5)); i++; break;
      case "--top-comments":
        out.topComments = Math.max(1, Math.min(50, parseInt(next, 10) || 12)); i++; break;
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
  console.log(`reddit-brief-generate -- discover threads, scan for mentions, output reply briefs

Usage:
  node scripts/reddit-brief-generate.mjs --category <text> --client-slug <slug> --client-names <csv> [options]

Required:
  --category, -c <text>          Category query, e.g. "best CRM for real estate"
  --client-slug <slug>           Client slug
  --client-names <csv>           Comma-separated business names

Options:
  --region, -r <text>            Optional region filter
  --client-domains <csv>         Comma-separated domains
  --client-aliases <csv>         Comma-separated product/founder names
  --competitors <csv>            Comma-separated competitors to scan for
  --discover-limit <n>           How many candidate threads to discover (default 12, max 50)
  --top, -t <n>                  How many briefs to output (default 5, max 20)
  --top-comments <n>             Comments to scan per thread (default 12, max 50)
  --format, -f <fmt>             markdown | json (default markdown)
  --quiet, -q                    Suppress progress on stderr
  --help, -h                     Show this help

Example:
  node scripts/reddit-brief-generate.mjs \\
    --category "best CRM for real estate" \\
    --region "Hawaii" \\
    --client-slug "test-client" \\
    --client-names "Acme CRM" \\
    --competitors "Follow Up Boss,LionDesk,Salesforce,HubSpot" \\
    --top 5
`);
}

/**
 * Priority score for ranking briefs. Higher means "you should reply
 * here first." Heuristic:
 *   - Big bonus when client absent + competitors named (the gap)
 *   - Smaller bonus for negative-sentiment-only mentions (need fix)
 *   - Composite discovery score is the tiebreaker
 */
function briefPriority(scan, score) {
  const summary = scan.summary;
  const compCount = summary.top_competitors ? summary.top_competitors.length : 0;
  let priority = score.composite_score || 0;
  if (!summary.client_mentioned && compCount > 0) {
    priority += 0.30 + Math.min(0.15, compCount * 0.03); // gap bonus
  } else if (!summary.client_mentioned) {
    priority += 0.10; // on-topic but no clear competitive set
  } else if (summary.client_negative > summary.client_positive) {
    priority += 0.20; // damage-control opportunity
  }
  return priority;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.category || !args.clientSlug || args.clientNames.length === 0) {
    console.error("error: --category, --client-slug, and --client-names are required\n");
    printHelp();
    process.exit(2);
  }
  if (!["markdown", "json"].includes(args.format)) {
    console.error(`error: --format must be one of: markdown, json (got "${args.format}")`);
    process.exit(2);
  }

  const log = args.quiet ? () => {} : (m) => process.stderr.write(`${m}\n`);

  // 1. Discovery
  log(`[1/3] Discovering threads for "${args.category}"${args.region ? ` in ${args.region}` : ""}...`);
  const candidates = await discoverThreads({
    category: args.category,
    region: args.region,
    limit: args.discoverLimit,
    requiredTokens: args.requiredTokens,
    onProgress: log,
  });
  log(`     ${candidates.length} candidate threads after relevance gate`);

  if (candidates.length === 0) {
    process.stdout.write(args.format === "json"
      ? JSON.stringify({ category: args.category, briefs: [] }, null, 2) + "\n"
      : `# Reply briefs -- ${args.category}\n\n(no on-topic threads found)\n`);
    return;
  }

  // 2. Mention scan + brief skeleton per thread
  log(`[2/3] Scanning mentions across ${candidates.length} threads...`);
  const enriched = [];
  for (const t of candidates) {
    log(`     · scanning r/${t.subreddit}: ${t.title.slice(0, 60)}…`);
    let scan;
    try {
      scan = await scanThreadForMentions(t.url, {
        client: {
          slug: args.clientSlug,
          names: args.clientNames,
          domains: args.clientDomains,
          aliases: args.clientAliases,
        },
        competitors: args.competitors,
        topComments: args.topComments,
      });
    } catch (err) {
      log(`       ! scan failed: ${err.message}`);
      continue;
    }
    if (!scan.thread) continue;
    const score = {
      recency_score: t.recency_score,
      upvote_score: t.upvote_score,
      citation_likelihood: t.citation_likelihood,
      composite_score: t.composite_score,
    };
    const brief = generateBriefSkeleton({ thread: t, scan, category: args.category, score });
    enriched.push({ thread: t, scan, score, brief, priority: briefPriority(scan, score) });
  }

  // 3. Sort + truncate + render
  enriched.sort((a, b) => b.priority - a.priority);
  const top = enriched.slice(0, args.topBriefs);
  log(`[3/3] Generated ${top.length} prioritized briefs.`);

  if (args.format === "json") {
    process.stdout.write(JSON.stringify({
      category: args.category,
      region: args.region,
      client_slug: args.clientSlug,
      run_at: new Date().toISOString(),
      briefs: top.map((e) => ({ priority: round(e.priority), ...e.brief, summary: e.scan.summary })),
    }, null, 2) + "\n");
  } else {
    process.stdout.write(`# Reply briefs -- ${args.category}${args.region ? ` (${args.region})` : ""}\n\n`);
    process.stdout.write(`Client: \`${args.clientSlug}\`  ·  ${top.length} briefs prioritized from ${enriched.length} on-topic threads.\n\n`);
    process.stdout.write(`---\n\n`);
    top.forEach((e, i) => {
      process.stdout.write(`<!-- Brief ${i + 1} of ${top.length} · priority ${e.priority.toFixed(3)} -->\n\n`);
      process.stdout.write(renderBriefMarkdown(e.brief));
      process.stdout.write(`\n\n---\n\n`);
    });
  }
}

function round(n) { return Math.round(n * 1000) / 1000; }

main().catch((err) => {
  console.error(`reddit-brief-generate failed: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
