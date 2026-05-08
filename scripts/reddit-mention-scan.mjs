#!/usr/bin/env node
/**
 * CLI: reddit-mention-scan
 *
 * Given a thread URL + a client identity, find where the client is
 * mentioned (or not) inside the thread, and surface the competitive
 * set being recommended instead. Output is the gap signal a reply
 * brief can be built around.
 *
 * Usage:
 *   node scripts/reddit-mention-scan.mjs \
 *     --thread "https://reddit.com/r/realtors/comments/abc123/..." \
 *     --client-slug "and-scene" \
 *     --client-names "And Scene Hawaii,And Scene,andscenehawaii" \
 *     --client-domains "andscenehawaii.com" \
 *     --competitors "BetterUp,The Second City Works,Improv Asylum" \
 *     --format json
 *
 * Formats: summary (default) | json
 */

import { scanThreadForMentions } from "../tools/reddit-tracker/src/mentions.mjs";

function parseArgs(argv) {
  const out = {
    thread: null,
    clientSlug: null,
    clientNames: [],
    clientDomains: [],
    clientAliases: [],
    competitors: [],
    topComments: 15,
    format: "summary",
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--thread":
      case "-u":
        out.thread = next; i++; break;
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
      case "--top-comments":
        out.topComments = Math.max(1, Math.min(100, parseInt(next, 10) || 15)); i++; break;
      case "--format":
      case "-f":
        out.format = (next || "").toLowerCase(); i++; break;
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
  console.log(`reddit-mention-scan — find where a client is mentioned in a reddit thread

Usage:
  node scripts/reddit-mention-scan.mjs --thread <url> --client-slug <slug> --client-names <csv> [options]

Required:
  --thread, -u <url>            Canonical reddit thread URL
  --client-slug <slug>          Client slug (FK target for reddit_thread_mentions)
  --client-names <csv>          Comma-separated business names + abbreviations

Options:
  --client-domains <csv>        Comma-separated domains (e.g. "andscenehawaii.com")
  --client-aliases <csv>        Comma-separated product names, founder names, etc.
  --competitors <csv>           Comma-separated competitor names to scan for
  --top-comments <n>            How many top-scored comments to scan (default 15, max 100)
  --format, -f <fmt>            Output format: summary | json (default summary)
  --help, -h                    Show this help

Example:
  node scripts/reddit-mention-scan.mjs \\
    --thread "https://www.reddit.com/r/realtors/comments/1m1p1d4/" \\
    --client-slug "and-scene" \\
    --client-names "And Scene Hawaii,And Scene" \\
    --client-domains "andscenehawaii.com" \\
    --competitors "BetterUp,The Second City Works,Improv Asylum" \\
    --format summary
`);
}

function renderSummary(result) {
  if (!result.thread) {
    return "Thread not found or could not be fetched.";
  }
  const lines = [];
  lines.push(`Thread:   ${result.thread.title}`);
  lines.push(`         ${result.thread.url}`);
  lines.push(`Sub:      r/${result.thread.subreddit}  ·  ${result.thread.op_score} ups  ·  ${result.thread.comment_count} comments`);
  lines.push("");
  lines.push(`Client:   ${result.summary.client_slug}`);
  lines.push(`Mentioned: ${result.summary.client_mentioned ? "YES" : "NO"}` +
    (result.summary.client_mentioned
      ? `  (${result.summary.client_mention_count}x: ${result.summary.client_positive}+ / ${result.summary.client_negative}-)`
      : ""));
  if (result.client_mentions.length > 0) {
    lines.push("");
    lines.push("Mention contexts:");
    for (const m of result.client_mentions) {
      const where = m.mention_type === "comment"
        ? `  · comment (${m.comment_score} ups)`
        : `  · ${m.mention_type}`;
      lines.push(`${where} [${m.sentiment}] "${m.mention_context.slice(0, 160)}${m.mention_context.length > 160 ? "…" : ""}"`);
    }
  }
  lines.push("");
  lines.push(`Competitive set: ${result.summary.competitors_named} named in thread`);
  for (const c of result.summary.top_competitors) {
    const sentimentTally = c.sentiments.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {});
    const tally = Object.entries(sentimentTally).map(([s, n]) => `${n}${s[0]}`).join(" ");
    lines.push(`  · ${c.name}  (${c.mention_count}x  ${tally})`);
  }
  lines.push("");
  lines.push(`Gap signal: ${result.summary.gap_signal}`);
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.thread || !args.clientSlug || args.clientNames.length === 0) {
    console.error("error: --thread, --client-slug, and --client-names are required\n");
    printHelp();
    process.exit(2);
  }
  if (!["summary", "json"].includes(args.format)) {
    console.error(`error: --format must be one of: summary, json (got "${args.format}")`);
    process.exit(2);
  }

  const result = await scanThreadForMentions(args.thread, {
    client: {
      slug: args.clientSlug,
      names: args.clientNames,
      domains: args.clientDomains,
      aliases: args.clientAliases,
    },
    competitors: args.competitors,
    topComments: args.topComments,
  });

  if (args.format === "json") {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(renderSummary(result) + "\n");
  }
}

main().catch((err) => {
  console.error(`reddit-mention-scan failed: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
