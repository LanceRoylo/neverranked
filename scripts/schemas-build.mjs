#!/usr/bin/env node
/**
 * schemas-build.mjs
 *
 * Build the public schema marketplace at neverranked.com/schemas/.
 * Aggregates the JSON-LD, llms.txt, and agent-readiness templates
 * we have shipped into a browsable, copy-paste-ready public catalog.
 *
 * Source-of-truth files (read by this script):
 *   content/compliance-schema/       → JSON-LD for regulated verticals
 *   content/agent-readiness/templates/ → Action schemas per vertical
 *   content/llms-txt/templates/      → llms.txt vertical templates
 *
 * Output written to:
 *   schemas/index.html               → top-level marketplace
 *   schemas/<category>/index.html    → category landing
 *
 * Adds the schemas dir to the build pipeline so it deploys via the
 * existing wrangler flow on the next push.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';

const REPO_ROOT = process.cwd();
const SCHEMAS_DIR = resolve(REPO_ROOT, 'schemas');

// ---------------------------------------------------------------------------
// Source data: define what categories exist and what templates each holds.
// We index by reading the existing template files so adding a new template
// is just dropping it in the right content/ subfolder + re-running this.
// ---------------------------------------------------------------------------

function readTemplates(folder, label) {
  const dir = resolve(REPO_ROOT, folder);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
    .filter(f => !f.startsWith('_') && f !== 'README.md')
    .map(f => {
      const slug = f.replace(/\.(md|txt)$/, '');
      const content = readFileSync(join(dir, f), 'utf8');
      // Pull title from frontmatter or first H1
      const titleMatch = content.match(/^title:\s*"?([^"\n]+)"?/m)
        || content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : slug;
      return { slug, file: f, title, content, category: label };
    });
}

const CATEGORIES = [
  {
    slug: 'compliance',
    name: 'Compliance-Aware Schema',
    summary: 'JSON-LD templates pre-written to anticipate regulated-vertical compliance review. Banks, healthcare, and legal customers can deploy these without a six-week legal-review bottleneck.',
    templates: readTemplates('content/compliance-schema', 'compliance'),
  },
  {
    slug: 'agent-readiness',
    name: 'Agent-Ready Schema',
    summary: 'Schema.org Action templates for the agentic AI transition. ReserveAction, ApplyAction, BuyAction, ContactAction with vertical baselines and the things that should never be exposed.',
    templates: readTemplates('content/agent-readiness/templates', 'agent-readiness'),
  },
  {
    slug: 'llms-txt',
    name: 'llms.txt Templates',
    summary: 'Curated llms.txt files per vertical. The standard is curation, not auto-generation — these templates show the right structure and which links matter for AI engine citation.',
    templates: readTemplates('content/llms-txt/templates', 'llms-txt'),
  },
];

const TOTAL_TEMPLATES = CATEGORIES.reduce((sum, c) => sum + c.templates.length, 0);

// ---------------------------------------------------------------------------
// Shared HTML scaffolding (matches the brand language used elsewhere).
// ---------------------------------------------------------------------------

const PAGE_HEAD = (title, description, path) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#080808">
<title>${title} — NeverRanked Schema Marketplace</title>
<meta name="description" content="${description}">
<link rel="canonical" href="https://neverranked.com${path}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://neverranked.com${path}">
<meta property="og:site_name" content="NeverRanked">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Barlow+Condensed:wght@300;400;500;600&family=Inter:wght@400;500;600&display=swap">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23080808'/%3E%3Ctext x='50%25' y='56%25' text-anchor='middle' font-family='Georgia,serif' font-size='22' fill='%23c9a84c' font-style='italic'%3EN%3C/text%3E%3C/svg%3E">
<style>
:root{--gold:#c9a84c;--gold-bright:#e8c767;--bg:#080808;--text:#fbf8ef;--text-mute:#b0b0a8;--text-faint:#888378;--card:#131210;--line:#26241e;--gold-wash:rgba(232,199,103,.08);--serif:"Playfair Display",Georgia,serif;--mono:"DM Mono",Menlo,monospace;--label:"Barlow Condensed","Helvetica Neue",sans-serif;--body:Inter,-apple-system,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:var(--body);font-size:15px;line-height:1.65}
a{color:var(--gold);text-decoration:none}a:hover{color:var(--gold-bright)}
.wrap{max-width:880px;margin:0 auto;padding:48px 24px}
.eyebrow{font-family:var(--label);text-transform:uppercase;letter-spacing:.32em;font-size:11px;color:var(--gold);margin:0 0 16px;font-weight:500}
h1{font-family:var(--serif);font-weight:400;font-size:44pt;line-height:1.05;letter-spacing:-.02em;margin:0 0 16px}
h1 em{font-style:italic;color:var(--gold)}
h2{font-family:var(--serif);font-weight:400;font-size:24pt;letter-spacing:-.01em;margin:48px 0 16px}
h2 em{font-style:italic;color:var(--gold)}
.lede{color:var(--text-mute);font-size:17px;margin:0 0 40px;line-height:1.6;max-width:640px}
.cat-card{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:28px;margin:0 0 16px;display:block;transition:border-color .15s}
.cat-card:hover{border-color:var(--gold)}
.cat-name{font-family:var(--serif);font-style:italic;color:var(--gold);font-size:22pt;margin:0 0 8px}
.cat-summary{color:var(--text-mute);font-size:14px;line-height:1.6;margin:0 0 12px}
.cat-meta{font-family:var(--mono);font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.1em}
.template-list{list-style:none;padding:0;margin:24px 0}
.template-list li{padding:14px 0;border-bottom:1px solid var(--line)}
.template-list a{display:flex;justify-content:space-between;align-items:center}
.template-name{color:var(--text);font-size:15px}
.template-arrow{color:var(--gold);font-family:var(--mono);font-size:13px}
pre{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:18px;overflow:auto;font-family:var(--mono);font-size:12px;line-height:1.55}
code{font-family:var(--mono);font-size:13px;color:var(--gold-bright)}
hr{border:0;border-top:1px solid var(--line);margin:48px 0}
.footer{font-family:var(--mono);font-size:12px;color:var(--text-faint);line-height:1.7}
.btn{display:inline-block;padding:10px 22px;background:var(--gold);color:var(--bg);font-family:var(--mono);font-size:13px;letter-spacing:.04em;text-decoration:none;border-radius:3px;margin-right:8px}
.btn-secondary{background:transparent;color:var(--gold);border:1px solid var(--gold)}
.contribute-card{background:var(--gold-wash);border:1px solid var(--gold);border-radius:6px;padding:24px;margin:48px 0}
@media(max-width:600px){h1{font-size:32pt}h2{font-size:18pt}.wrap{padding:32px 16px}}
</style>
</head>
<body>`;

// ---------------------------------------------------------------------------
// Index page
// ---------------------------------------------------------------------------

function indexPage() {
  const cats = CATEGORIES.map(c => `
    <a href="/schemas/${c.slug}/" class="cat-card">
      <div class="cat-name">${c.name}</div>
      <p class="cat-summary">${c.summary}</p>
      <div class="cat-meta">${c.templates.length} template${c.templates.length === 1 ? '' : 's'}</div>
    </a>
  `).join('');

  return PAGE_HEAD(
    'NeverRanked Schema Marketplace',
    'Public catalog of AEO schema templates: compliance-aware JSON-LD, agent-ready Action types, and llms.txt curation. Production-ready, pre-reviewed for vertical compliance.',
    '/schemas/'
  ) + `
<div class="wrap">
  <p class="eyebrow"><a href="/" style="color:var(--text-faint)">NeverRanked</a> · Schema Marketplace</p>
  <h1>Schema <em>Marketplace</em></h1>
  <p class="lede">${TOTAL_TEMPLATES} production-ready schema templates organized by purpose. Compliance-aware JSON-LD for regulated industries, agent-readiness templates for the agentic AI transition, and llms.txt curation by vertical. Copy, paste, ship.</p>

  ${cats}

  <div class="contribute-card">
    <p class="eyebrow" style="color:var(--gold)">Contribute a template</p>
    <p style="margin:0 0 16px;color:var(--text);font-size:14px;line-height:1.7">
      The catalog grows with the AEO category. If you have a vertical-specific template that passes compliance review and is in production on a real customer site, we will add it to the catalog with attribution.
    </p>
    <a class="btn" href="mailto:schemas@neverranked.com?subject=${encodeURIComponent('Schema marketplace contribution')}">Submit a template</a>
    <a class="btn btn-secondary" href="/standards/methodology/">Read the methodology</a>
  </div>

  <hr>
  <div class="footer">
    <p>Templates are MIT-licensed unless otherwise noted on the individual page. Methodology is open and reproducible.</p>
    <p>Need a vertical we have not built yet? <a href="mailto:lance@neverranked.com">Email Lance</a> — we prioritize templates by demand.</p>
  </div>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Category pages
// ---------------------------------------------------------------------------

function categoryPage(category) {
  const templateLinks = category.templates.map(t => `
    <li>
      <a href="/schemas/${category.slug}/${t.slug}/">
        <span class="template-name">${t.title}</span>
        <span class="template-arrow">view →</span>
      </a>
    </li>
  `).join('');

  return PAGE_HEAD(
    `${category.name} — NeverRanked`,
    category.summary,
    `/schemas/${category.slug}/`
  ) + `
<div class="wrap">
  <p class="eyebrow"><a href="/schemas/" style="color:var(--text-faint)">Schema Marketplace</a> · ${category.name}</p>
  <h1><em>${category.name}</em></h1>
  <p class="lede">${category.summary}</p>

  <ul class="template-list">${templateLinks}</ul>

  <hr>
  <div class="footer">
    <p>Templates are MIT-licensed unless otherwise noted. Need help deploying? <a href="https://neverranked.com/#signal">Signal subscription</a> includes deployment via our snippet.</p>
  </div>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Template detail pages
// ---------------------------------------------------------------------------

function templatePage(category, template) {
  // Strip frontmatter
  let content = template.content.replace(/^---\n[\s\S]*?\n---\n+/, '');
  // Convert markdown headers to HTML manually (lightweight; we don't ship a full md parser here)
  // Use pandoc if available, otherwise inline conversion.
  const escapeHtml = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // Crude code-block preservation:
  const html = content
    .replace(/```([a-z]*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre><code>${escapeHtml(code).trim()}</code></pre>`)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[^<]+<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/^\*\*([^*]+)\*\*\s*$/gm, '<p><strong>$1</strong></p>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^([^<\n][^\n]+)$/gm, '<p>$1</p>')
    .replace(/<p>(\s*<(h[1-3]|ul|ol|pre|li))/g, '$1')
    .replace(/(<\/(h[1-3]|ul|ol|pre|li)>\s*)<\/p>/g, '$1');

  return PAGE_HEAD(
    `${template.title} — ${category.name}`,
    `Production-ready ${category.name.toLowerCase()} template from NeverRanked. Pre-reviewed for vertical compliance.`,
    `/schemas/${category.slug}/${template.slug}/`
  ) + `
<div class="wrap">
  <p class="eyebrow"><a href="/schemas/" style="color:var(--text-faint)">Schemas</a> · <a href="/schemas/${category.slug}/" style="color:var(--text-faint)">${category.name}</a></p>
  ${html}

  <hr>
  <div class="footer">
    <p>This template is MIT-licensed. Use it freely; attribution appreciated. Need help deploying it on your site? <a href="https://check.neverranked.com">Run a free scan</a> first to see what other gaps exist, or <a href="mailto:lance@neverranked.com">email Lance</a>.</p>
  </div>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Write everything
// ---------------------------------------------------------------------------

mkdirSync(SCHEMAS_DIR, { recursive: true });
writeFileSync(join(SCHEMAS_DIR, 'index.html'), indexPage());

let writeCount = 1;
for (const category of CATEGORIES) {
  const catDir = join(SCHEMAS_DIR, category.slug);
  mkdirSync(catDir, { recursive: true });
  writeFileSync(join(catDir, 'index.html'), categoryPage(category));
  writeCount++;
  for (const tpl of category.templates) {
    const tplDir = join(catDir, tpl.slug);
    mkdirSync(tplDir, { recursive: true });
    writeFileSync(join(tplDir, 'index.html'), templatePage(category, tpl));
    writeCount++;
  }
}

console.log(`Wrote ${writeCount} files to ${SCHEMAS_DIR}/`);
console.log(`Categories: ${CATEGORIES.length}`);
console.log(`Templates: ${TOTAL_TEMPLATES}`);
