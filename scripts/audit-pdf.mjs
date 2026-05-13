#!/usr/bin/env node
'use strict';

/**
 * scripts/audit-pdf.mjs
 *
 * Render a NeverRanked audit folder to a single branded PDF.
 *
 * Concatenates the seven numbered markdown files (00, 02-07) in order,
 * runs them through pandoc to get HTML, wraps in a brand-styled
 * shell (Playfair italic + gold #e8c767 + mono labels — matching the
 * homepage and social posts), and prints to PDF via Playwright.
 *
 * Usage:
 *   node scripts/audit-pdf.mjs audits/drake-real-estate-partners
 *   node scripts/audit-pdf.mjs audits/emanate-wireless-inc
 *
 * Output: audits/<slug>/audit.pdf  (and audits/<slug>/audit.html as a side-effect)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const auditDir = resolve(process.cwd(), process.argv[2] || '');
if (!existsSync(auditDir)) {
  console.error(`Audit directory not found: ${auditDir}`);
  process.exit(1);
}

// Pull the proper business name from the executive summary's first H1
// rather than the kebab-case slug, so the cover reads e.g.
// "Drake Real Estate Partners" not "drake real estate partners".
function readBusinessName(auditDir, fallbackSlug) {
  const exec = resolve(auditDir, '00-executive-summary.md');
  if (existsSync(exec)) {
    const md = readFileSync(exec, 'utf8');
    // First H1 is typically "# The {Business} Audit"
    const h1 = md.match(/^#\s+(.+?)$/m);
    if (h1) {
      let title = h1[1].trim();
      // Strip "The " prefix and trailing "Audit"
      title = title.replace(/^The\s+/i, '').replace(/\s+Audit\s*$/i, '');
      if (title) return title;
    }
    // Fallback: "Prepared for: X" line
    const prep = md.match(/Prepared for:\s*\*?\*?(.+?)\*?\*?$/m);
    if (prep) return prep[1].trim();
  }
  return fallbackSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const SECTIONS = [
  '00-executive-summary.md',
  '02-technical-audit.md',
  '03-schema-review.md',
  '03b-agent-readiness.md',
  '04-keyword-gap.md',
  '05-ai-citations.md',
  '05b-reddit-surface.md',
  '06-competitor-teardown.md',
  '07-roadmap.md',
  '08-proof.md',
];

// ---------------------------------------------------------------------------
// 1. Concat markdown files in section order, with explicit page-breaks
// ---------------------------------------------------------------------------

const parts = [];
for (const f of SECTIONS) {
  const path = resolve(auditDir, f);
  if (!existsSync(path)) {
    console.log(`  skipping ${f} (not found)`);
    continue;
  }
  let md = readFileSync(path, 'utf8');
  // Strip the AUDIT-GENERATE TODO comment from any unfilled template files
  md = md.replace(/^<!-- AUDIT-GENERATE V1 LEAVES THIS SECTION AS TEMPLATE\.[\s\S]*?-->\s*/m, '');
  parts.push(md.trim());
}

const combinedMd = parts.join('\n\n<div class="page-break"></div>\n\n');
const tmpMd = resolve(auditDir, '.audit-combined.md');
writeFileSync(tmpMd, combinedMd, 'utf8');

// ---------------------------------------------------------------------------
// 2. Pandoc -> HTML body
// ---------------------------------------------------------------------------

console.log('[1/3] Rendering markdown to HTML via pandoc...');
const bodyHtml = execSync(
  `pandoc -f markdown -t html5 --wrap=preserve "${tmpMd}"`,
  { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
);

// ---------------------------------------------------------------------------
// 3. Wrap in brand-styled shell
// ---------------------------------------------------------------------------

const slug = basename(auditDir);
const businessName = readBusinessName(auditDir, slug);
const htmlPath = resolve(auditDir, 'audit.html');
const pdfPath  = resolve(auditDir, 'audit.pdf');

const fullHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>NeverRanked Audit — ${slug}</title>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Barlow+Condensed:wght@300;400;500;600;700&family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Inter:wght@400;500;600&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Barlow+Condensed:wght@300;400;500;600;700&family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Inter:wght@400;500;600&display=swap">
<style>
  :root {
    --gold: #c9a84c;
    --gold-bright: #e8c767;
    --bg: #0e0d0a;
    --card: #131210;
    --text: #1a1815;
    --text-soft: #4a463e;
    --text-mute: #6b665a;
    --line: #d8d2c0;
    --line-soft: #ede8d8;
    --serif: "Playfair Display", Georgia, serif;
    --mono: "DM Mono", "Menlo", monospace;
    --label: "Barlow Condensed", "Helvetica Neue", sans-serif;
    --body: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  }

  @page {
    size: Letter;
    margin: 0.75in 0.85in;
  }

  html, body {
    margin: 0; padding: 0;
    background: #fbf8ef;
    color: var(--text);
    font-family: var(--body);
    font-size: 11pt;
    line-height: 1.55;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page-break { page-break-after: always; }

  /* Cover page */
  .cover {
    page-break-after: always;
    height: 9.4in;
    display: flex; flex-direction: column;
    justify-content: space-between;
    padding: 0.4in 0;
    box-sizing: border-box;
  }
  .cover-mark {
    font-family: var(--serif);
    font-style: italic;
    font-weight: 400;
    font-size: 18pt;
    color: var(--gold);
    letter-spacing: -0.01em;
  }
  .cover-mark .mark-mono {
    font-family: var(--label);
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: 0.32em;
    font-size: 9pt;
    color: var(--text-mute);
    margin-left: 1em;
    font-weight: 500;
    vertical-align: middle;
  }
  .cover-title-block {
    margin-top: 0.4in;
  }
  .cover-eyebrow {
    font-family: var(--label);
    text-transform: uppercase;
    letter-spacing: 0.32em;
    font-size: 10pt;
    color: var(--gold);
    font-weight: 500;
    margin-bottom: 0.18in;
  }
  .cover-title {
    font-family: var(--serif);
    font-weight: 400;
    font-size: 44pt;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--text);
    max-width: 6.5in;
    border: none;
    padding: 0;
    margin: 0;
  }
  .cover-title em {
    font-style: italic;
    color: var(--gold);
  }
  .cover-meta {
    font-family: var(--mono);
    font-size: 9.5pt;
    color: var(--text-mute);
    line-height: 1.6;
    border-top: 1px solid var(--line-soft);
    padding-top: 0.18in;
  }
  .cover-meta-row {
    display: flex;
    gap: 0.6in;
    margin-top: 0.1in;
    flex-wrap: wrap;
  }
  .cover-meta-cell {
    flex: 1;
    min-width: 1.6in;
  }
  .cover-meta strong {
    color: var(--gold);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 8pt;
    display: block;
    margin-bottom: 0.04in;
    font-family: var(--label);
  }
  .cover-meta-engines {
    font-size: 8.5pt;
    line-height: 1.5;
  }

  /* Body typography */
  h1 {
    font-family: var(--serif);
    font-weight: 400;
    font-size: 22pt;
    line-height: 1.1;
    letter-spacing: -0.015em;
    margin: 0 0 0.4in;
    color: var(--text);
    border-bottom: 1px solid var(--line);
    padding-bottom: 0.18in;
  }
  h1 em { font-style: italic; color: var(--gold); }

  h2 {
    font-family: var(--serif);
    font-weight: 400;
    font-size: 16pt;
    line-height: 1.2;
    margin: 0.35in 0 0.15in;
    color: var(--text);
    letter-spacing: -0.01em;
  }
  h2 em { font-style: italic; color: var(--gold); }

  h3 {
    font-family: var(--label);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 11pt;
    font-weight: 600;
    margin: 0.25in 0 0.08in;
    color: var(--gold);
  }

  h4 {
    font-family: var(--body);
    font-weight: 600;
    font-size: 11pt;
    margin: 0.18in 0 0.06in;
    color: var(--text);
  }

  p { margin: 0 0 0.12in; }
  strong { color: var(--text); font-weight: 600; }
  em { font-style: italic; }

  ul, ol { margin: 0 0 0.15in 0.25in; padding: 0; }
  li { margin-bottom: 0.05in; }

  hr {
    border: 0;
    border-top: 1px solid var(--line);
    margin: 0.25in 0;
  }

  blockquote {
    border-left: 3px solid var(--gold);
    padding-left: 0.18in;
    margin: 0.15in 0;
    color: var(--text-soft);
    font-style: italic;
  }

  /* Tables */
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.15in 0;
    font-size: 9.5pt;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid var(--line);
    padding: 6pt 8pt;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: #f3eedd;
    font-family: var(--label);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 9pt;
    font-weight: 600;
    color: var(--text-soft);
  }

  /* Code */
  code {
    font-family: var(--mono);
    font-size: 9pt;
    background: #f3eedd;
    padding: 1pt 4pt;
    border-radius: 2pt;
    color: var(--text);
  }
  pre {
    font-family: var(--mono);
    font-size: 9pt;
    background: #f6f1e0;
    border: 1px solid var(--line-soft);
    border-radius: 4pt;
    padding: 10pt 12pt;
    overflow: hidden;
    page-break-inside: avoid;
    line-height: 1.45;
    margin: 0.12in 0;
  }
  pre code {
    background: transparent;
    padding: 0;
    border-radius: 0;
    color: var(--text);
    font-size: inherit;
  }

  /* Front-matter blocks (the "Auditor: X" lines pandoc renders as p) */
  h1 + p strong { color: var(--gold); }

  /* Footer mark on every page after cover */
  .running-footer {
    position: running(footer);
    font-family: var(--label);
    font-size: 8pt;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: var(--text-mute);
  }
  @page :not(:first) {
    @bottom-center {
      content: element(footer);
    }
  }

  /* Strip the markdown horizontal rule before each page-break */
  .page-break + hr, hr + .page-break { display: none; }
</style>
</head>
<body>

<div class="cover">
  <div>
    <div class="cover-mark">NeverRanked<span class="mark-mono">AEO + Schema deployment</span></div>
    <div class="cover-title-block">
      <div class="cover-eyebrow">Audit deliverable</div>
      <h1 class="cover-title">The <em>${businessName}</em><br>audit.</h1>
    </div>
  </div>
  <div class="cover-meta">
    <div class="cover-meta-row">
      <div class="cover-meta-cell">
        <strong>Prepared for</strong>
        ${businessName}
      </div>
      <div class="cover-meta-cell">
        <strong>Prepared by</strong>
        Lance Roylo, NeverRanked
      </div>
      <div class="cover-meta-cell">
        <strong>Delivered</strong>
        ${new Date().toISOString().slice(0, 10)}
      </div>
    </div>
    <div class="cover-meta-row">
      <div class="cover-meta-cell" style="flex: 1 1 100%;">
        <strong>Seven engines tracked</strong>
        <div class="cover-meta-engines">ChatGPT &middot; Perplexity &middot; Gemini &middot; Claude &middot; Microsoft Copilot &middot; Google AI Overviews &middot; Gemma</div>
      </div>
    </div>
  </div>
</div>

${bodyHtml}

</body>
</html>
`;

writeFileSync(htmlPath, fullHtml, 'utf8');
console.log(`         wrote ${basename(htmlPath)}`);

// ---------------------------------------------------------------------------
// 4. Render to PDF via Playwright
// ---------------------------------------------------------------------------

console.log('[2/3] Rendering HTML to PDF via Playwright...');
const { chromium } = await import('@playwright/test');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
await page.pdf({
  path: pdfPath,
  format: 'Letter',
  printBackground: true,
  margin: { top: '0.75in', right: '0.85in', bottom: '0.75in', left: '0.85in' },
});
await browser.close();

// Cleanup
try { execSync(`rm -f "${tmpMd}"`); } catch {}

console.log('[3/3] Done.');
console.log();
console.log(`  ${pdfPath}`);
console.log();
