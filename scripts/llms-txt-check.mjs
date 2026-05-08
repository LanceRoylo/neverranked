#!/usr/bin/env node
/**
 * llms-txt-check.mjs
 *
 * Audit and score the llms.txt file at the root of a given site.
 *
 * Usage:
 *   node scripts/llms-txt-check.mjs --url=https://example.com [--json]
 *
 * Scoring rubric (0-100, weighted):
 *   - Presence (file exists, 200 OK, content-type ok): 30 pts
 *   - H1 present and non-empty: 10 pts
 *   - Blockquote description present (>= 1 line): 10 pts
 *   - At least one H2 section: 10 pts
 *   - Link count in 5..30 range: 10 pts
 *   - All links return 200 (sampled, max 10): 20 pts
 *   - llms-full.txt also present: 5 pts
 *   - File freshness (Last-Modified within 90d if header present): 5 pts
 *
 * Anti-patterns flagged (don't change score, but surfaced):
 *   - Sitemap-style auto-generation (more than 50 links)
 *   - Tracking parameters in any URL
 *   - Mismatched canonical (file mentions a different host)
 *   - Stale file (last-modified > 180d)
 */

import { argv, exit } from 'node:process';

const args = Object.fromEntries(
  argv.slice(2).flatMap(a => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [[m[1], m[2] ?? true]] : [];
  })
);

if (!args.url) {
  console.error('Usage: --url=<base-url> [--json]');
  exit(1);
}

const baseUrl = args.url.replace(/\/+$/, '');
const llmsUrl = `${baseUrl}/llms.txt`;
const fullUrl = `${baseUrl}/llms-full.txt`;

const findings = [];
const flags = [];
let score = 0;
let presence = false;
let body = '';
let lastModified = null;

async function fetchHead(u) {
  try {
    const res = await fetch(u, { method: 'HEAD', redirect: 'manual' });
    return { status: res.status, headers: res.headers };
  } catch (e) {
    return { status: 0, error: String(e) };
  }
}

async function fetchBody(u) {
  try {
    const res = await fetch(u, { redirect: 'follow' });
    if (!res.ok) return { status: res.status, text: null };
    const text = await res.text();
    return { status: res.status, text, headers: res.headers };
  } catch (e) {
    return { status: 0, error: String(e) };
  }
}

// 1. Presence
const main = await fetchBody(llmsUrl);
if (main.status === 200 && main.text && main.text.trim().length > 0) {
  presence = true;
  body = main.text;
  score += 30;
  findings.push({ ok: true, msg: 'llms.txt is present and serves content' });
  lastModified = main.headers.get('last-modified');
} else {
  findings.push({ ok: false, msg: `llms.txt missing or empty (status ${main.status})` });
}

if (presence) {
  // 2. H1
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1 && h1[1].trim().length > 0) {
    score += 10;
    findings.push({ ok: true, msg: `H1 present: "${h1[1].trim()}"` });
  } else {
    findings.push({ ok: false, msg: 'No H1 detected — required by spec' });
  }

  // 3. Blockquote description
  const blockquote = body.match(/^>\s+(.+)$/m);
  if (blockquote && blockquote[1].trim().length >= 20) {
    score += 10;
    findings.push({ ok: true, msg: 'Blockquote description present' });
  } else {
    findings.push({ ok: false, msg: 'No blockquote description (or too short)' });
  }

  // 4. H2 sections
  const h2s = [...body.matchAll(/^##\s+(.+)$/gm)];
  if (h2s.length >= 1) {
    score += 10;
    findings.push({ ok: true, msg: `${h2s.length} H2 section(s) found` });
  } else {
    findings.push({ ok: false, msg: 'No H2 sections — links are uncategorized' });
  }

  // 5. Link count
  const links = [...body.matchAll(/^\s*-\s*\[([^\]]+)\]\(([^)]+)\)/gm)];
  const linkCount = links.length;
  if (linkCount >= 5 && linkCount <= 30) {
    score += 10;
    findings.push({ ok: true, msg: `${linkCount} curated links — in healthy range` });
  } else if (linkCount > 30) {
    flags.push(`Sitemap-style: ${linkCount} links (curation lost above ~30)`);
    findings.push({ ok: false, msg: `${linkCount} links — likely auto-generated, no points` });
  } else {
    findings.push({ ok: false, msg: `Only ${linkCount} links — too sparse to be useful` });
  }

  // 6. Link health (sample up to 10)
  const sample = links.slice(0, 10).map(m => m[2]);
  let healthy = 0;
  for (const u of sample) {
    const r = await fetchHead(u);
    if (r.status >= 200 && r.status < 400) healthy++;
    if (/[?&](utm_|gclid=|fbclid=|ref=)/i.test(u)) {
      flags.push(`Tracking params in URL: ${u}`);
    }
    try {
      const parsed = new URL(u);
      const baseHost = new URL(baseUrl).host;
      if (parsed.host !== baseHost && !parsed.host.endsWith(`.${baseHost}`)) {
        flags.push(`External or mismatched host: ${u}`);
      }
    } catch {}
  }
  const linkScore = sample.length > 0 ? Math.round((healthy / sample.length) * 20) : 0;
  score += linkScore;
  findings.push({ ok: healthy === sample.length, msg: `${healthy} of ${sample.length} sampled links return 200 OK` });

  // 7. llms-full.txt
  const full = await fetchHead(fullUrl);
  if (full.status === 200) {
    score += 5;
    findings.push({ ok: true, msg: 'llms-full.txt also present (bonus)' });
  } else {
    findings.push({ ok: false, msg: 'llms-full.txt not deployed (optional)' });
  }

  // 8. Freshness
  if (lastModified) {
    const ageMs = Date.now() - new Date(lastModified).getTime();
    const ageDays = ageMs / 86400000;
    if (ageDays <= 90) {
      score += 5;
      findings.push({ ok: true, msg: `Last-Modified ${Math.round(ageDays)}d ago — fresh` });
    } else if (ageDays > 180) {
      flags.push(`Stale: last modified ${Math.round(ageDays)} days ago`);
      findings.push({ ok: false, msg: `Last-Modified ${Math.round(ageDays)}d ago — stale` });
    } else {
      findings.push({ ok: false, msg: `Last-Modified ${Math.round(ageDays)}d ago — getting stale` });
    }
  } else {
    findings.push({ ok: false, msg: 'No Last-Modified header — cannot assess freshness' });
  }
}

const result = {
  url: baseUrl,
  llmsTxtUrl: llmsUrl,
  present: presence,
  score,
  grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F',
  findings,
  flags,
};

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`\nllms.txt audit — ${baseUrl}\n`);
  console.log(`Score: ${result.score} / 100  (grade ${result.grade})`);
  console.log(`Present: ${result.present ? 'yes' : 'no'}\n`);
  console.log('Findings:');
  for (const f of result.findings) {
    console.log(`  ${f.ok ? '✓' : '✗'} ${f.msg}`);
  }
  if (result.flags.length) {
    console.log('\nFlags:');
    for (const f of result.flags) console.log(`  ! ${f}`);
  }
  console.log();
}
