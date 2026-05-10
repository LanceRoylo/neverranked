#!/usr/bin/env node
'use strict';

/**
 * scripts/state-of-aeo-publish.mjs
 *
 * Scans reports/state-of-aeo/*.md (plus the Hawaii edition under
 * reports/state-of-aeo-hawaii-2026/) and generates the public web
 * surface at state-of-aeo/:
 *
 *   state-of-aeo/index.html          -- hub page listing every report
 *   state-of-aeo/<slug>/index.html   -- web-readable per-report page
 *   state-of-aeo/<slug>.pdf          -- copy of the PDF for download
 *
 * Idempotent. Run before every deploy. The Phase C cron triggers
 * generate -> publish -> commit weekly.
 *
 * Voice rules applied (strip pandoc smart-quote artifacts that drift
 * from the brand voice):
 *   - U+2014 EM DASH       -> ", "
 *   - U+2013 EN DASH       -> "-"   (only in prose; tables keep them)
 *   - smart quotes         -> straight quotes
 *
 * No external deps -- pandoc is the only subprocess.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'state-of-aeo');

// -----------------------------------------------------------------
// Discover reports. Each entry: { slug, title, mdPath, pdfPath, date }
// -----------------------------------------------------------------

function discoverReports() {
  const out = [];

  // Standing weekly reports
  const weeklyDir = resolve(ROOT, 'reports/state-of-aeo');
  if (existsSync(weeklyDir)) {
    for (const f of readdirSync(weeklyDir)) {
      if (!f.endsWith('.md')) continue;
      const md = resolve(weeklyDir, f);
      const slug = f.replace(/\.md$/, '').replace(/^state-of-aeo-/, '');
      const pdf = md.replace(/\.md$/, '.pdf');
      const fm = parseFrontMatter(readFileSync(md, 'utf8'));
      out.push({
        slug,
        title: fm.title || `State of AEO: ${slug}`,
        mdPath: md,
        pdfPath: existsSync(pdf) ? pdf : null,
        date: fm.generated || slug,
        kind: 'weekly',
        windowStart: fm.window_start,
        windowEnd: fm.window_end,
        sampleRuns: fm.sample_runs,
      });
    }
  }

  // Annual / themed editions live in their own subdirectory.
  const editionDirs = readdirSync(resolve(ROOT, 'reports'))
    .filter((d) => d.startsWith('state-of-aeo-') && d !== 'state-of-aeo');

  for (const d of editionDirs) {
    const editionRoot = resolve(ROOT, 'reports', d);
    for (const f of readdirSync(editionRoot)) {
      if (!f.endsWith('.md')) continue;
      const md = resolve(editionRoot, f);
      const slug = d.replace(/^state-of-aeo-/, '');
      const pdf = md.replace(/\.md$/, '.pdf');
      const fm = parseFrontMatter(readFileSync(md, 'utf8'));
      out.push({
        slug,
        title: fm.title || `State of AEO: ${slug}`,
        mdPath: md,
        pdfPath: existsSync(pdf) ? pdf : null,
        date: fm.generated || fm.published || fm.publication_date || fm.data_collected || slug,
        kind: 'edition',
        windowStart: fm.window_start,
        windowEnd: fm.window_end,
        sampleRuns: fm.sample_runs,
      });
    }
  }

  // Newest first.
  out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return out;
}

function parseFrontMatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    out[kv[1].trim()] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

// -----------------------------------------------------------------
// Render markdown -> HTML body via pandoc, normalize voice
// -----------------------------------------------------------------

function renderBody(mdPath) {
  // Strip front matter then run pandoc.
  let md = readFileSync(mdPath, 'utf8').replace(/^---\n[\s\S]*?\n---\n+/, '');
  // Strip the leading H1 (we render the title in the page chrome).
  md = md.replace(/^#\s+.+\n+/, '');
  const tmp = resolve(dirname(mdPath), '.publish-tmp.md');
  writeFileSync(tmp, md, 'utf8');
  let html = execSync(`pandoc -f markdown -t html5 --wrap=preserve "${tmp}"`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  try { execSync(`rm -f "${tmp}"`); } catch {}

  // Voice normalization: kill em dashes, smart quotes.
  html = html
    .replace(/—/g, ', ')     // em dash -> comma
    .replace(/–/g, '-')       // en dash -> hyphen (safe in tables)
    .replace(/[‘’]/g, "'") // curly singles
    .replace(/[“”]/g, '"'); // curly doubles
  return html;
}

// -----------------------------------------------------------------
// Page chrome (matches /standards/ template, brand-clean)
// -----------------------------------------------------------------

function pageChrome({ pageTitle, description, canonical, body, ogType = 'article' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#080808">
<title>${pageTitle}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:title" content="${pageTitle}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="${ogType}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="NeverRanked">
<meta property="og:image" content="https://neverranked.com/og.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Barlow+Condensed:wght@300;400;500;600&family=Inter:wght@400;500;600&display=swap">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23080808'/%3E%3Ctext x='50%25' y='56%25' text-anchor='middle' font-family='Georgia,serif' font-size='22' fill='%23c9a84c' font-style='italic'%3EN%3C/text%3E%3C/svg%3E">
<style>
:root{--gold:#c9a84c;--gold-bright:#e8c767;--bg:#080808;--text:#fbf8ef;--text-mute:#b0b0a8;--text-faint:#888378;--card:#131210;--line:#26241e;--gold-wash:rgba(232,199,103,.08);--serif:"Playfair Display",Georgia,serif;--mono:"DM Mono",Menlo,monospace;--label:"Barlow Condensed","Helvetica Neue",sans-serif;--body:Inter,-apple-system,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:var(--body);font-size:16px;line-height:1.7}
a{color:var(--gold);text-decoration:none}a:hover{color:var(--gold-bright)}
.wrap{max-width:860px;margin:0 auto;padding:48px 24px}
.eyebrow{font-family:var(--label);text-transform:uppercase;letter-spacing:.32em;font-size:11px;color:var(--gold);margin:0 0 16px;font-weight:500}
h1{font-family:var(--serif);font-weight:400;font-size:44pt;line-height:1.05;letter-spacing:-.02em;margin:0 0 24px}
h1 em{font-style:italic;color:var(--gold)}
h2{font-family:var(--serif);font-weight:400;font-size:22pt;letter-spacing:-.01em;margin:48px 0 16px;color:var(--text)}
h2 em{font-style:italic;color:var(--gold)}
h3{font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;font-size:14px;color:var(--gold);margin:32px 0 12px;font-weight:600}
h4{font-family:var(--body);font-weight:600;font-size:15px;margin:20px 0 8px;color:var(--text)}
p{margin:0 0 16px;color:var(--text-mute)}
strong{color:var(--text);font-weight:600}
em{font-style:italic}
ul,ol{margin:0 0 24px 24px;padding:0}
li{margin-bottom:8px;color:var(--text-mute)}
table{border-collapse:collapse;width:100%;margin:20px 0;font-size:14px;display:block;overflow-x:auto}
th,td{border:1px solid var(--line);padding:10px 14px;text-align:left;white-space:nowrap}
th{background:var(--card);font-family:var(--label);text-transform:uppercase;letter-spacing:.1em;font-size:12px;color:var(--gold)}
td{color:var(--text-mute)}
pre{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:18px;overflow:auto;font-family:var(--mono);font-size:13px;line-height:1.55;margin:20px 0}
code{font-family:var(--mono);font-size:13.5px;color:var(--gold-bright);background:var(--card);padding:2px 6px;border-radius:3px}
pre code{background:transparent;padding:0;color:var(--text)}
hr{border:0;border-top:1px solid var(--line);margin:48px 0}
blockquote{border-left:3px solid var(--gold);padding:0 0 0 20px;margin:24px 0;color:var(--text-mute);font-style:italic}
.footer{font-family:var(--mono);font-size:12px;color:var(--text-faint);line-height:1.7}
.report-card{display:block;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:28px;margin:0 0 16px;transition:border-color .15s}
.report-card:hover{border-color:var(--gold)}
.report-card-meta{font-family:var(--mono);font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.18em;margin:0 0 8px}
.report-card-title{font-family:var(--serif);font-style:italic;color:var(--gold);font-size:22pt;margin:0 0 8px;line-height:1.1}
.report-card-summary{color:var(--text-mute);font-size:14px;line-height:1.6;margin:0 0 12px}
.report-card-actions{display:flex;gap:16px;flex-wrap:wrap;margin:8px 0 0}
.report-card-actions a{font-family:var(--label);text-transform:uppercase;letter-spacing:.16em;font-size:12px;color:var(--gold);font-weight:600}
.summary-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:24px 0 32px;padding:24px;background:var(--card);border:1px solid var(--line);border-radius:6px}
.summary-stats-cell{text-align:left}
.summary-stats-num{font-family:var(--serif);color:var(--gold);font-size:28pt;line-height:1;margin:0 0 6px}
.summary-stats-label{font-family:var(--label);text-transform:uppercase;letter-spacing:.16em;font-size:11px;color:var(--text-faint)}
.action-row{display:flex;gap:24px;flex-wrap:wrap;margin:16px 0 32px}
.action-row a{font-family:var(--label);text-transform:uppercase;letter-spacing:.16em;font-size:13px;color:var(--gold);font-weight:600;padding:10px 18px;border:1px solid var(--gold);border-radius:4px;transition:all .15s}
.action-row a:hover{background:var(--gold);color:var(--bg)}
@media(max-width:600px){h1{font-size:32pt}h2{font-size:18pt}.wrap{padding:32px 16px}}
</style>
</head>
<body>
<div class="wrap">
${body}
</div>
</body>
</html>`;
}

// -----------------------------------------------------------------
// Hub page
// -----------------------------------------------------------------

function buildHub(reports) {
  const latest = reports[0];
  const cards = reports.map((r) => {
    const meta = [
      r.kind === 'edition' ? 'Annual edition' : 'Weekly report',
      r.date,
      r.sampleRuns ? `${r.sampleRuns} runs` : null,
    ].filter(Boolean).join(' · ');
    const summary = r.kind === 'edition'
      ? 'Themed deep-dive on a tracked vertical or region. Captured from the same citation infrastructure as the weekly report.'
      : `Standing snapshot of what AI engines cited across NeverRanked's tracked client universe between ${r.windowStart || '?'} and ${r.windowEnd || '?'}.`;
    return `    <article class="report-card">
      <p class="report-card-meta">${meta}</p>
      <a href="/state-of-aeo/${r.slug}/" class="report-card-title">${r.title}</a>
      <p class="report-card-summary">${summary}</p>
      <div class="report-card-actions">
        <a href="/state-of-aeo/${r.slug}/">Read on the web</a>
${r.pdfPath ? `        <a href="/state-of-aeo/${r.slug}.pdf">Download PDF</a>` : ''}
      </div>
    </article>`;
  }).join('\n');

  const itemList = reports.map((r, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    url: `https://neverranked.com/state-of-aeo/${r.slug}/`,
    name: r.title,
  }));

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': 'https://neverranked.com/state-of-aeo/#page',
        url: 'https://neverranked.com/state-of-aeo/',
        name: 'The State of AEO',
        description: 'Standing reports on what AI engines actually cite, generated weekly from NeverRanked\'s tracked client universe.',
        isPartOf: { '@id': 'https://neverranked.com/#website' },
        mainEntity: { '@type': 'ItemList', itemListElement: itemList },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://neverranked.com/' },
          { '@type': 'ListItem', position: 2, name: 'The State of AEO', item: 'https://neverranked.com/state-of-aeo/' },
        ],
      },
    ],
  };

  const body = `  <p class="eyebrow"><a href="/" style="color:var(--text-faint)">NeverRanked</a> &middot; The State of AEO</p>
  <h1>The State of <em>AEO</em></h1>
  <p style="font-size:18px;color:var(--text-mute);margin:0 0 32px;line-height:1.6">What AI engines actually cite when answering questions about the brands NeverRanked tracks. Pulled live from production citation runs across ChatGPT, Perplexity, Gemini, Claude, Microsoft Copilot, and Google AI Overviews. Same script, same data sources, no manual curation. Anyone running the same query against the same database gets the same numbers.</p>

  ${latest ? `<div class="summary-stats">
    <div class="summary-stats-cell"><p class="summary-stats-num">${latest.sampleRuns || '-'}</p><p class="summary-stats-label">Captured runs</p></div>
    <div class="summary-stats-cell"><p class="summary-stats-num">6</p><p class="summary-stats-label">Engines tracked</p></div>
    <div class="summary-stats-cell"><p class="summary-stats-num">${reports.length}</p><p class="summary-stats-label">Reports published</p></div>
  </div>` : ''}

  <h2>Latest and archive</h2>
${cards}

  <hr>
  <h2>Methodology</h2>
  <p>Every number comes from the <code>citation_runs</code> table in NeverRanked's production database. Each run is one query against one AI engine for one tracked keyword, with the engine's response text and cited URLs captured as raw evidence.</p>
  <p>Generation script: <code>scripts/state-of-aeo-generate.mjs</code>. Source-type taxonomy: <code>tools/citation-gap/src/source-types.mjs</code>. Both files live in the public repo. Reports regenerate weekly on a Cloudflare cron.</p>
  <p>Honest limit: this is NeverRanked's tracked subset, not a random sample of the AI search universe. Findings are descriptive of what AI engines say in our clients' categories. Generalizing beyond those categories requires more data, and as more clients onboard the tracked universe expands.</p>

  <hr>
  <div class="footer">
    <p>Questions or corrections: <a href="mailto:lance@neverranked.com">lance@neverranked.com</a>. Want your category in the next report? <a href="/">Talk to us about onboarding</a>.</p>
  </div>
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>`;

  return pageChrome({
    pageTitle: 'The State of AEO: NeverRanked',
    description: 'Standing reports on what AI engines actually cite, generated weekly from NeverRanked\'s tracked client universe.',
    canonical: 'https://neverranked.com/state-of-aeo/',
    body,
    ogType: 'website',
  });
}

// -----------------------------------------------------------------
// Per-report page
// -----------------------------------------------------------------

function buildReportPage(report) {
  const body = renderBody(report.mdPath);
  const inner = `  <p class="eyebrow"><a href="/" style="color:var(--text-faint)">NeverRanked</a> &middot; <a href="/state-of-aeo/" style="color:var(--text-faint)">The State of AEO</a> &middot; ${report.date}</p>
  <h1>${report.title.replace(/^State of AEO:?\s*/i, '<em>State of AEO</em>: ').replace(/<em>State of AEO<\/em>:\s*$/, '<em>State of AEO</em>')}</h1>

  <div class="action-row">
${report.pdfPath ? `    <a href="/state-of-aeo/${report.slug}.pdf">Download PDF</a>` : ''}
    <a href="/state-of-aeo/">All reports</a>
  </div>

${body}

  <hr>
  <div class="footer">
    <p>Generated by <code>scripts/state-of-aeo-generate.mjs</code>. Reproducible from public schema. Questions: <a href="mailto:lance@neverranked.com">lance@neverranked.com</a>.</p>
  </div>`;

  return pageChrome({
    pageTitle: `${report.title} - NeverRanked`,
    description: `State of AEO report covering ${report.windowStart || ''} to ${report.windowEnd || report.date}. ${report.sampleRuns || ''} captured citation runs.`,
    canonical: `https://neverranked.com/state-of-aeo/${report.slug}/`,
    body: inner,
    ogType: 'article',
  });
}

// -----------------------------------------------------------------
// Main
// -----------------------------------------------------------------

const reports = discoverReports();
if (reports.length === 0) {
  console.error('No reports found under reports/state-of-aeo*/');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

console.log(`[1/3] Discovered ${reports.length} report(s).`);

for (const r of reports) {
  const reportDir = resolve(OUT_DIR, r.slug);
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(resolve(reportDir, 'index.html'), buildReportPage(r), 'utf8');
  if (r.pdfPath) {
    copyFileSync(r.pdfPath, resolve(OUT_DIR, `${r.slug}.pdf`));
  }
  console.log(`         ${r.slug}/  (${r.kind}, ${r.date})`);
}

console.log('[2/3] Writing hub page...');
writeFileSync(resolve(OUT_DIR, 'index.html'), buildHub(reports), 'utf8');

console.log('[3/3] Done.');
console.log();
console.log(`  ${OUT_DIR}/index.html`);
console.log(`  ${reports.length} report page(s)`);
