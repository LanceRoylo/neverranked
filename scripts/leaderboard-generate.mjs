#!/usr/bin/env node
/**
 * leaderboard-generate.mjs
 *
 * Generate a ranked AEO leaderboard for a vertical from a JSON config.
 *
 * Usage:
 *   node scripts/leaderboard-generate.mjs \
 *     --config=content/leaderboards/configs/hawaii-law-firms.json \
 *     [--output=content/leaderboards/hawaii-law-firms-2026-05.md]
 *
 * Config schema (JSON):
 *   {
 *     "vertical": "Hawaii law firms",
 *     "category_archetype": "law firm",         // singular noun used in prose
 *     "category_plural": "law firms",           // plural noun
 *     "region_hint": "Hawaii",                  // for headlines
 *     "competitive_summary": "Optional one-line context shown in the report",
 *     "entrants": [
 *       { "name": "Goodsill Anderson Quinn & Stifel", "url": "https://www.goodsill.com" },
 *       { "name": "Cades Schutte", "url": "https://www.cades.com" }
 *     ]
 *   }
 *
 * Output: ranked markdown in the same format as the Hawaii community
 * banking leaderboard.
 *
 * Rate limit: 10 second sleep between scans because check.neverranked.com
 * has scan dedup + occasional cold-start. Scanning ~15 entrants takes
 * about 3 minutes, well within the 30-min target.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).flatMap(a => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [[m[1], m[2]]] : [];
  })
);

if (!args.config) {
  console.error('Usage: --config=<path-to-config.json> [--output=<path>]');
  process.exit(1);
}

const configPath = resolve(process.cwd(), args.config);
if (!existsSync(configPath)) {
  console.error(`Config not found: ${configPath}`);
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const required = ['vertical', 'category_archetype', 'category_plural', 'region_hint', 'entrants'];
for (const k of required) {
  if (!config[k]) { console.error(`Config missing: ${k}`); process.exit(1); }
}

const today = new Date().toISOString().slice(0, 10);
const yearMonth = today.slice(0, 7);
const slug = config.vertical.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const outputPath = args.output
  ? resolve(process.cwd(), args.output)
  : resolve(process.cwd(), `content/leaderboards/${slug}-${yearMonth}.md`);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function scanOne(entrant) {
  const res = await fetch('https://check.neverranked.com/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: entrant.url }),
  });
  if (!res.ok) {
    return { ...entrant, error: `HTTP ${res.status}` };
  }
  const data = await res.json();
  if (data.aeo_score == null) {
    return { ...entrant, error: 'no aeo_score in response (possibly rate-limited)' };
  }
  const present = (data.schema_coverage || [])
    .filter(s => s.present)
    .map(s => s.type);
  return {
    ...entrant,
    score: data.aeo_score,
    grade: data.grade,
    schema_present: present,
  };
}

console.log(`[1/3] Scanning ${config.entrants.length} ${config.category_plural} via check.neverranked.com...`);

const results = [];
for (let i = 0; i < config.entrants.length; i++) {
  const e = config.entrants[i];
  process.stdout.write(`  ${i + 1}. ${e.name} (${e.url})... `);
  let result;
  try {
    result = await scanOne(e);
  } catch (err) {
    result = { ...e, error: String(err) };
  }
  if (result.error) {
    console.log(`FAILED: ${result.error}`);
  } else {
    console.log(`${result.score} (${result.grade})`);
  }
  results.push(result);
  if (i < config.entrants.length - 1) await sleep(10000);
}

const ranked = results
  .filter(r => !r.error)
  .sort((a, b) => b.score - a.score);
const failed = results.filter(r => r.error);

const median = ranked.length
  ? ranked[Math.floor(ranked.length / 2)].score
  : null;
const noSchema = results.filter(r => !r.error && (r.schema_present || []).length === 0).length;
const lowest = ranked.length ? ranked[ranked.length - 1] : null;
const highest = ranked.length ? ranked[0] : null;

console.log(`[2/3] Building markdown report (${ranked.length} ranked, ${failed.length} failed)...`);

const headerRow = `| Rank | ${config.category_archetype.charAt(0).toUpperCase() + config.category_archetype.slice(1)} | AEO Score | Grade | Schema Types Deployed |`;
const sepRow    = `|---|---|---|---|---|`;
const dataRows  = ranked.map((r, i) =>
  `| ${i + 1} | ${r.name} | ${r.score} | ${r.grade} | ${(r.schema_present || []).join(', ') || '(none)'} |`
).join('\n');

const failedSection = failed.length === 0 ? '' : `

### Could not score

The following ${config.category_plural} returned no score on the day this
leaderboard was generated. Most often this means a rate-limit cap or a
site that returned a non-HTML response. They will be retried next cycle.

${failed.map(f => `- ${f.name} (${f.url}) — ${f.error}`).join('\n')}
`;

const competitiveLine = config.competitive_summary
  ? `\n${config.competitive_summary}\n`
  : '';

const md = `---
category: ${config.vertical}
status: INTERNAL — not published
data_collected: ${today}
methodology: /leaderboards/methodology
sample_size: ${ranked.length}
next_update: weekly Mondays once published
---

# ${config.vertical} — AEO Leaderboard

**As of ${today}.** Live scores pulled from
[check.neverranked.com](https://check.neverranked.com) using the
methodology at
[methodology.md](methodology.md). Scores are independently
reproducible — anyone can run a domain through the public scan tool
and verify.
${competitiveLine}
## Current rankings

${headerRow}
${sepRow}
${dataRows}
${failedSection}

## What the rankings mean

${highest && lowest ? `The leader (${highest.name}) sits at ${highest.score}, ` +
`the bottom of the ranked list (${lowest.name}) at ${lowest.score}. ` : ''}\
The category median is ${median ?? '—'}.\
${noSchema > 0 ? ` ${noSchema} of ${results.length - failed.length} ${config.category_plural} have **zero structured data** deployed at all.` : ''}

A ${config.category_archetype} that ships a single Phase 1 schema deployment
(Organization, WebSite, BreadcrumbList, primary category type, FAQPage) typically
moves 25 to 40 points in one cycle. The first mover in this category locks in
the lead by a margin the rest would need a full quarter to close.

## Per-${config.category_archetype} notes

${ranked.map(r => `### ${r.name} — score ${r.score}, grade ${r.grade}

- Schema deployed: ${(r.schema_present || []).join(', ') || 'none detected'}
- URL: ${r.url}
`).join('\n')}

## Methodology

See [methodology.md](methodology.md). All scores are
independently reproducible via [check.neverranked.com](https://check.neverranked.com).

## Errata

(none — first publication of this vertical)

---

*Internal version. Not published. Hold for category-leader pre-publication
review per the policy in \`README.md\`.*
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, md);

console.log(`[3/3] Done.`);
console.log();
console.log(`  ${outputPath}`);
console.log(`  Sample size: ${ranked.length} ranked, ${failed.length} failed`);
console.log(`  Range: ${ranked.length ? ranked[ranked.length - 1].score : '—'} to ${ranked.length ? ranked[0].score : '—'}`);
console.log(`  Median: ${median ?? '—'}`);
console.log();
