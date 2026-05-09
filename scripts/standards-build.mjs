#!/usr/bin/env node
/**
 * standards-build.mjs
 *
 * Build the NeverRanked /standards/ section of the marketing site
 * by converting internal markdown docs into public HTML pages.
 *
 * Sources:
 *   content/leaderboards/methodology.md   → /standards/methodology/
 *   content/llms-txt/standard.md          → /standards/llms-txt/
 *   content/agent-readiness/standard.md   → /standards/agent-readiness/
 *
 * Why these are public: every meeting talk-track and audit deliverable
 * references the methodology. If those pages don't exist publicly, the
 * references are vapor. Publishing them turns internal docs into
 * citable URLs.
 *
 * Uses pandoc for markdown → HTML conversion. Wraps in the same
 * brand shell as the schemas/profile pages.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const REPO_ROOT = process.cwd();
const STANDARDS_DIR = resolve(REPO_ROOT, 'standards');

const DOCS = [
  {
    slug: 'methodology',
    title: 'AEO Score Methodology',
    summary: 'How NeverRanked computes a 0-100 AEO score, what each component measures, and why every score is independently reproducible.',
    source: 'content/leaderboards/methodology.md',
  },
  {
    slug: 'llms-txt',
    title: 'llms.txt Standard',
    summary: 'NeverRanked\'s public position on the llms.txt standard, what good looks like, and current engine adoption.',
    source: 'content/llms-txt/standard.md',
  },
  {
    slug: 'agent-readiness',
    title: 'AI Agent Readiness',
    summary: 'The four agent task surfaces that matter, what good agent-ready schema looks like, and what should never be exposed as an agent action.',
    source: 'content/agent-readiness/standard.md',
  },
];

const BRAND_HEAD = (title, description, path) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#080808">
<title>${title}: NeverRanked Standards</title>
<meta name="description" content="${description}">
<link rel="canonical" href="https://neverranked.com${path}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="article">
<meta property="og:url" content="https://neverranked.com${path}">
<meta property="og:site_name" content="NeverRanked">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Barlow+Condensed:wght@300;400;500;600&family=Inter:wght@400;500;600&display=swap">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23080808'/%3E%3Ctext x='50%25' y='56%25' text-anchor='middle' font-family='Georgia,serif' font-size='22' fill='%23c9a84c' font-style='italic'%3EN%3C/text%3E%3C/svg%3E">
<style>
:root{--gold:#c9a84c;--gold-bright:#e8c767;--bg:#080808;--text:#fbf8ef;--text-mute:#b0b0a8;--text-faint:#888378;--card:#131210;--line:#26241e;--gold-wash:rgba(232,199,103,.08);--serif:"Playfair Display",Georgia,serif;--mono:"DM Mono",Menlo,monospace;--label:"Barlow Condensed","Helvetica Neue",sans-serif;--body:Inter,-apple-system,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:var(--body);font-size:16px;line-height:1.7}
a{color:var(--gold);text-decoration:none}a:hover{color:var(--gold-bright)}
.wrap{max-width:760px;margin:0 auto;padding:48px 24px}
.eyebrow{font-family:var(--label);text-transform:uppercase;letter-spacing:.32em;font-size:11px;color:var(--gold);margin:0 0 16px;font-weight:500}
h1{font-family:var(--serif);font-weight:400;font-size:44pt;line-height:1.05;letter-spacing:-.02em;margin:0 0 24px}
h1 em{font-style:italic;color:var(--gold)}
h2{font-family:var(--serif);font-weight:400;font-size:22pt;letter-spacing:-.01em;margin:48px 0 16px}
h2 em{font-style:italic;color:var(--gold)}
h3{font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;font-size:14px;color:var(--gold);margin:32px 0 12px;font-weight:600}
h4{font-family:var(--body);font-weight:600;font-size:15px;margin:20px 0 8px;color:var(--text)}
p{margin:0 0 16px;color:var(--text-mute)}
strong{color:var(--text);font-weight:600}
ul,ol{margin:0 0 24px 24px;padding:0}
li{margin-bottom:8px;color:var(--text-mute)}
table{border-collapse:collapse;width:100%;margin:20px 0;font-size:14px}
th,td{border:1px solid var(--line);padding:10px 14px;text-align:left}
th{background:var(--card);font-family:var(--label);text-transform:uppercase;letter-spacing:.1em;font-size:12px;color:var(--gold)}
td{color:var(--text-mute)}
pre{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:18px;overflow:auto;font-family:var(--mono);font-size:13px;line-height:1.55;margin:20px 0}
code{font-family:var(--mono);font-size:13.5px;color:var(--gold-bright);background:var(--card);padding:2px 6px;border-radius:3px}
pre code{background:transparent;padding:0;color:var(--text)}
hr{border:0;border-top:1px solid var(--line);margin:48px 0}
blockquote{border-left:3px solid var(--gold);padding:0 0 0 20px;margin:24px 0;color:var(--text-mute);font-style:italic}
.footer{font-family:var(--mono);font-size:12px;color:var(--text-faint);line-height:1.7}
.standards-card{display:block;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:28px;margin:0 0 16px;transition:border-color .15s}
.standards-card:hover{border-color:var(--gold)}
.standards-card-title{font-family:var(--serif);font-style:italic;color:var(--gold);font-size:22pt;margin:0 0 8px}
.standards-card-summary{color:var(--text-mute);font-size:14px;line-height:1.6;margin:0}
@media(max-width:600px){h1{font-size:32pt}h2{font-size:18pt}.wrap{padding:32px 16px}}
</style>
</head>
<body>`;

function indexPage() {
  const cards = DOCS.map(d => `
    <a href="/standards/${d.slug}/" class="standards-card">
      <div class="standards-card-title">${d.title}</div>
      <p class="standards-card-summary">${d.summary}</p>
    </a>
  `).join('');

  return BRAND_HEAD(
    'Standards',
    'Public methodology and standards documents that govern how NeverRanked scores AEO, deploys schema, and tracks citations.',
    '/standards/'
  ) + `
<div class="wrap">
  <p class="eyebrow"><a href="/" style="color:var(--text-faint)">NeverRanked</a> · Standards</p>
  <h1><em>Standards</em></h1>
  <p style="font-size:18px;color:var(--text-mute);margin:0 0 40px;line-height:1.6">The public methodology that governs how NeverRanked scores AEO, deploys schema, and treats emerging standards like llms.txt and agent-readiness. Reproducible. Anyone can apply these documents to their own work.</p>

  ${cards}

  <hr>
  <div class="footer">
    <p>Standards are versioned and dated. Disputes or corrections: <a href="mailto:standards@neverranked.com">standards@neverranked.com</a>.</p>
  </div>
</div>
</body>
</html>`;
}

function docPage(doc) {
  const md = readFileSync(resolve(REPO_ROOT, doc.source), 'utf8')
    .replace(/^---\n[\s\S]*?\n---\n+/, '');
  // Use pandoc to convert
  const tmp = resolve(REPO_ROOT, '.tmp-standard.md');
  writeFileSync(tmp, md);
  const body = execSync(`pandoc -f markdown -t html5 --wrap=preserve "${tmp}"`,
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  execSync(`rm -f "${tmp}"`);

  return BRAND_HEAD(doc.title, doc.summary, `/standards/${doc.slug}/`) + `
<div class="wrap">
  <p class="eyebrow"><a href="/standards/" style="color:var(--text-faint)">Standards</a></p>
  ${body}

  <hr>
  <div class="footer">
    <p>This document is a public standard. Disputes or corrections: <a href="mailto:standards@neverranked.com">standards@neverranked.com</a>. Want the practical implementation? See the <a href="/schemas/">Schema Marketplace</a>.</p>
  </div>
</div>
</body>
</html>`;
}

mkdirSync(STANDARDS_DIR, { recursive: true });
writeFileSync(join(STANDARDS_DIR, 'index.html'), indexPage());

let count = 1;
for (const doc of DOCS) {
  const dir = join(STANDARDS_DIR, doc.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), docPage(doc));
  count++;
}

console.log(`Wrote ${count} files to ${STANDARDS_DIR}/`);
