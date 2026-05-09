#!/usr/bin/env node
/**
 * profile-generate.mjs
 *
 * Generate per-business AEO profile pages for the marketing site.
 * Each business in our scan history gets a permanent indexable URL
 * at neverranked.com/profile/<slug>.
 *
 * Becomes a Yelp-style directory specifically for AEO readiness.
 * Every Hawaii business that Googles their own AEO score finds
 * their NeverRanked profile. The page links to check.neverranked.com
 * to re-scan and surfaces a "claim this profile" CTA.
 *
 * Inputs: JSON sidecars produced by leaderboard-generate.mjs
 * Outputs: profile/<slug>/index.html (one per business)
 *          profile/index.html (directory listing)
 *
 * Usage:
 *   node scripts/profile-generate.mjs
 *     # scans content/leaderboards/*.json and builds all profiles
 *
 *   node scripts/profile-generate.mjs --leaderboard=path/to/x.json
 *     # builds profiles only from one leaderboard's data
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).flatMap(a => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [[m[1], m[2]]] : [];
  })
);

const REPO_ROOT = process.cwd();
const LEADERBOARDS_DIR = resolve(REPO_ROOT, 'content/leaderboards');
const PROFILE_DIR = resolve(REPO_ROOT, 'profile');

function slugify(s) {
  return s.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function loadLeaderboards() {
  if (args.leaderboard) {
    const p = resolve(REPO_ROOT, args.leaderboard);
    return [JSON.parse(readFileSync(p, 'utf8'))];
  }
  if (!existsSync(LEADERBOARDS_DIR)) return [];
  return readdirSync(LEADERBOARDS_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('config'))
    .map(f => JSON.parse(readFileSync(join(LEADERBOARDS_DIR, f), 'utf8')));
}

const PAGE_HEAD = (title, description, slug) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#080808">
<title>${title}: NeverRanked AEO Profile</title>
<meta name="description" content="${description}">
<link rel="canonical" href="https://neverranked.com/profile/${slug}/">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:title" content="${title}: AEO Profile">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://neverranked.com/profile/${slug}/">
<meta property="og:site_name" content="NeverRanked">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Barlow+Condensed:wght@300;400;500;600&family=Inter:wght@400;500;600&display=swap">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23080808'/%3E%3Ctext x='50%25' y='56%25' text-anchor='middle' font-family='Georgia,serif' font-size='22' fill='%23c9a84c' font-style='italic'%3EN%3C/text%3E%3C/svg%3E">
<style>
:root{--gold:#c9a84c;--gold-bright:#e8c767;--bg:#080808;--text:#fbf8ef;--text-mute:#b0b0a8;--text-faint:#888378;--card:#131210;--line:#26241e;--gold-wash:rgba(232,199,103,.08);--ok:#7fc99a;--err:#e07a7a;--serif:"Playfair Display",Georgia,serif;--mono:"DM Mono",Menlo,monospace;--label:"Barlow Condensed","Helvetica Neue",sans-serif;--body:Inter,-apple-system,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--body);font-size:15px;line-height:1.6}
a{color:var(--gold);text-decoration:none}
a:hover{color:var(--gold-bright)}
.wrap{max-width:760px;margin:0 auto;padding:48px 24px}
.eyebrow{font-family:var(--label);text-transform:uppercase;letter-spacing:.32em;font-size:11px;color:var(--gold);margin:0 0 16px;font-weight:500}
h1{font-family:var(--serif);font-weight:400;font-size:44pt;line-height:1.05;letter-spacing:-.02em;margin:0 0 12px}
h1 em{font-style:italic;color:var(--gold)}
.subtitle{font-family:var(--mono);font-size:13px;color:var(--text-faint);margin:0 0 40px}
.score-card{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:32px;margin:32px 0;display:grid;grid-template-columns:auto 1fr;gap:32px;align-items:center}
.score{font-family:var(--serif);font-style:italic;font-weight:400;font-size:96pt;line-height:.9;color:var(--gold);min-width:160px;text-align:center}
.grade{font-family:var(--label);font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold-bright);margin-top:8px;text-align:center}
.score-meta{font-family:var(--mono);font-size:13px;color:var(--text-mute);line-height:1.7}
.score-meta strong{color:var(--gold);font-family:var(--label);text-transform:uppercase;letter-spacing:.12em;font-size:10px;display:block;margin-bottom:2px;font-weight:500}
.section{margin:40px 0}
.section-label{font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;font-size:12px;color:var(--gold);margin:0 0 12px;font-weight:500}
.schema-list{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px}
.schema-list li{font-family:var(--mono);font-size:12px;background:var(--gold-wash);border:1px solid var(--gold);color:var(--gold);padding:4px 10px;border-radius:3px}
.schema-list li.missing{background:transparent;border-color:var(--line);color:var(--text-faint)}
.cta-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}
.btn{display:inline-block;padding:12px 24px;background:var(--gold);color:var(--bg);font-family:var(--mono);font-size:13px;letter-spacing:.04em;text-decoration:none;border-radius:3px;border:1px solid var(--gold)}
.btn-secondary{background:transparent;color:var(--gold)}
hr{border:0;border-top:1px solid var(--line);margin:48px 0}
.footer{font-family:var(--mono);font-size:12px;color:var(--text-faint);line-height:1.7}
.footer a{color:var(--text-faint);border-bottom:1px solid var(--line)}
@media(max-width:600px){h1{font-size:32pt}.score-card{grid-template-columns:1fr;text-align:center}.score{min-width:auto}}
</style>
`;

function profilePage(entry, leaderboard) {
  const slug = slugify(entry.name);
  const score = entry.score;
  const grade = entry.grade;
  const schemaList = entry.schema_present || [];
  const median = leaderboard.median;
  const vsmedian = score - (median ?? score);
  const vsLabel = vsmedian > 0
    ? `${vsmedian} points above the ${leaderboard.vertical} median`
    : vsmedian < 0
      ? `${Math.abs(vsmedian)} points below the ${leaderboard.vertical} median`
      : `at the ${leaderboard.vertical} median`;

  const description = `${entry.name} scored ${score} (${grade}) on the NeverRanked AEO methodology, ${vsLabel}. Schema deployed: ${schemaList.join(', ') || 'none detected'}.`;

  const allSchemaTypes = ['Organization','WebSite','BreadcrumbList','FAQPage','AggregateRating'];
  const schemaItems = allSchemaTypes.map(t => {
    const has = schemaList.includes(t);
    return `<li class="${has ? '' : 'missing'}">${has ? '✓ ' : '× '}${t}</li>`;
  }).join('');

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": `${entry.name}: AEO Profile`,
    "description": description,
    "datePublished": leaderboard.data_collected,
    "author": { "@type": "Organization", "name": "NeverRanked", "url": "https://neverranked.com" },
    "publisher": { "@type": "Organization", "name": "NeverRanked", "url": "https://neverranked.com" },
    "about": {
      "@type": "Organization",
      "name": entry.name,
      "url": entry.url,
    }
  };

  const html = PAGE_HEAD(entry.name, description, slug) + `
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<div class="wrap">
  <p class="eyebrow"><a href="/profile/" style="color:var(--text-faint)">NeverRanked Profile Directory</a> · ${leaderboard.vertical}</p>
  <h1><em>${entry.name}</em></h1>
  <p class="subtitle">AEO Profile · Last scanned ${leaderboard.data_collected} · <a href="${entry.url}" target="_blank" rel="noopener">${entry.url.replace(/^https?:\/\//,'').replace(/\/$/,'')}</a></p>

  <div class="score-card">
    <div>
      <div class="score">${score}</div>
      <div class="grade">${grade} GRADE</div>
    </div>
    <div class="score-meta">
      <p><strong>Position</strong>${vsLabel}.</p>
      <p><strong>Category</strong>${leaderboard.vertical}</p>
      <p><strong>Sample size in category</strong>${leaderboard.sample_size} ${leaderboard.category_plural} ranked</p>
      <p><strong>Methodology</strong><a href="/standards/methodology/">AEO Score 0-100, weighted across 5 components</a></p>
    </div>
  </div>

  <div class="section">
    <p class="section-label">Schema Deployed</p>
    <ul class="schema-list">${schemaItems}</ul>
  </div>

  <div class="section">
    <p class="section-label">What this means</p>
    <p>${entry.name} is currently ${grade === 'A' || grade === 'B' ? 'one of the better-deployed' : grade === 'C' ? 'mid-pack on' : 'underperforming on'} AEO readiness within ${leaderboard.vertical}. ${score >= 70 ? 'AI engines (ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, Google AI Overviews) have most of the structured signals they need to cite this site when answering buyer queries in this category.' : score >= 40 ? 'AI engines have some of the signals but are missing key types that determine citation eligibility. Competitors with sharper schema deployment are likely capturing citations this business should be earning.' : 'AI engines have very little structured data to work with. Deploying foundational schema (Organization, WebSite, FAQPage, category-appropriate type) would lift the score 25 to 40 points in one cycle.'}</p>
  </div>

  <div class="section">
    <p class="section-label">Take action</p>
    <p>This profile is generated from public scan data and the published <a href="/standards/methodology/">NeverRanked methodology</a>. The score updates weekly when published.</p>
    <div class="cta-row">
      <a class="btn" href="https://check.neverranked.com/?url=${encodeURIComponent(entry.url)}&utm_source=profile&utm_medium=organic&utm_campaign=${slug}" target="_blank" rel="noopener">Re-scan now</a>
      <a class="btn btn-secondary" href="mailto:lance@neverranked.com?subject=${encodeURIComponent('Claim profile: ' + entry.name)}&body=${encodeURIComponent('I work at ' + entry.name + ' and would like to claim our NeverRanked profile or discuss the score shown.')}">Claim this profile</a>
    </div>
  </div>

  <hr>

  <div class="footer">
    <p>NeverRanked is the AEO platform that ships the schema, tracks the citations, and does the work. <a href="/">About NeverRanked →</a></p>
    <p>Profiles are generated from public scan data using the <a href="/standards/methodology/">published methodology</a>. Disputes: <a href="mailto:data@neverranked.com">data@neverranked.com</a>.</p>
  </div>
</div>
</body>
</html>`;

  return { slug, html };
}

function indexPage(allEntries) {
  const byVertical = {};
  for (const e of allEntries) {
    (byVertical[e.vertical] ||= []).push(e);
  }

  const sections = Object.entries(byVertical).map(([vertical, entries]) => {
    const sorted = entries.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const rows = sorted.map(e => `
      <a href="/profile/${slugify(e.name)}/" style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid var(--line);text-decoration:none">
        <div>
          <div style="color:var(--text);font-size:15px">${e.name}</div>
          <div style="color:var(--text-faint);font-size:11px;font-family:var(--mono);margin-top:2px">${e.url.replace(/^https?:\/\//,'').replace(/\/$/,'')}</div>
        </div>
        <div style="text-align:right">
          <div style="color:var(--gold);font-family:var(--serif);font-style:italic;font-size:24px">${e.score ?? 'n/a'}</div>
          <div style="color:var(--text-faint);font-size:10px;font-family:var(--label);letter-spacing:.18em;text-transform:uppercase">${e.grade ?? ''}</div>
        </div>
      </a>`).join('');
    return `
      <div class="section">
        <p class="section-label">${vertical}</p>
        ${rows}
      </div>`;
  }).join('');

  return PAGE_HEAD('NeverRanked Profile Directory', 'Public AEO scores for businesses across Hawaii and beyond. Updated weekly. Methodology open and reproducible.', '') + `
</head>
<body>
<div class="wrap">
  <p class="eyebrow">Profile Directory</p>
  <h1>How <em>cite-able</em> is your business?</h1>
  <p class="subtitle">Public AEO scores for ${allEntries.length} businesses we have scanned. Methodology at <a href="/standards/methodology/">/standards/methodology</a>. Run your own scan at <a href="https://check.neverranked.com">check.neverranked.com</a>.</p>
  ${sections}
  <hr>
  <div class="footer">
    <p>This directory is generated from public scan data. Businesses can <a href="mailto:lance@neverranked.com">claim their profile</a> or request a fresh re-scan at any time.</p>
  </div>
</div>
</body>
</html>`;
}

const leaderboards = loadLeaderboards();
if (leaderboards.length === 0) {
  console.error('No leaderboard JSON sidecars found. Run leaderboard-generate.mjs first.');
  process.exit(1);
}

let count = 0;
const allEntries = [];
for (const lb of leaderboards) {
  for (const e of lb.ranked) {
    const { slug, html } = profilePage(e, lb);
    const dir = resolve(PROFILE_DIR, slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), html);
    count++;
    allEntries.push({ ...e, vertical: lb.vertical });
  }
}

mkdirSync(PROFILE_DIR, { recursive: true });
writeFileSync(join(PROFILE_DIR, 'index.html'), indexPage(allEntries));
count++;

console.log(`Wrote ${count} files to ${PROFILE_DIR}/`);
console.log(`Profiles: ${allEntries.length}`);
console.log(`Verticals: ${[...new Set(allEntries.map(e => e.vertical))].length}`);
