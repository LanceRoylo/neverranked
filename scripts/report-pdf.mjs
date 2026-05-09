#!/usr/bin/env node
'use strict';

/**
 * scripts/report-pdf.mjs
 *
 * Render a NeverRanked report (single markdown file) to a branded PDF.
 * Same style language as audit-pdf.mjs but for non-audit content like
 * the State of AEO annual report.
 *
 * Usage:
 *   node scripts/report-pdf.mjs reports/<slug>/<file>.md \
 *     --title="The State of AEO" \
 *     --subtitle="2026 Hawaii Edition" \
 *     --output=reports/<slug>/<file>.pdf
 *
 * Output: <output>.pdf and <output>.html as a side effect.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = Object.fromEntries(
  process.argv.slice(2).flatMap(a => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [[m[1], m[2]]] : [];
  })
);
const inputPath = resolve(process.cwd(), process.argv[2] || '');
if (!existsSync(inputPath)) {
  console.error(`Input not found: ${inputPath}`);
  process.exit(1);
}

const title    = args.title    || 'NeverRanked Report';
const subtitle = args.subtitle || '';
const outputBase = args.output
  ? resolve(process.cwd(), args.output.replace(/\.(pdf|html)$/, ''))
  : inputPath.replace(/\.md$/, '');
const pdfPath  = `${outputBase}.pdf`;
const htmlPath = `${outputBase}.html`;

let md = readFileSync(inputPath, 'utf8');
// Strip front-matter
md = md.replace(/^---\n[\s\S]*?\n---\n+/, '');
// Strip the giant H1 block at the top — we render that on the cover
md = md.replace(/^#\s+The State of[\s\S]*?\n---\n+/m, '');
// First H1 if it remains
md = md.replace(/^#\s+.+\n+##\s/, '## ');

const tmpMd = resolve(dirname(inputPath), '.report-combined.md');
writeFileSync(tmpMd, md, 'utf8');

console.log('[1/3] Rendering markdown to HTML via pandoc...');
const bodyHtml = execSync(
  `pandoc -f markdown -t html5 --wrap=preserve "${tmpMd}"`,
  { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
);

const today = new Date().toISOString().slice(0, 10);

const fullHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${subtitle ? `${title}: ${subtitle}` : title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Barlow+Condensed:wght@300;400;500;600;700&family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Inter:wght@400;500;600&display=swap">
<style>
  :root {
    --gold: #c9a84c;
    --gold-bright: #e8c767;
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
  @page { size: Letter; margin: 0.75in 0.85in; }
  html, body { margin: 0; padding: 0; background: #fbf8ef; color: var(--text); font-family: var(--body); font-size: 11pt; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page-break { page-break-after: always; }
  .cover { page-break-after: always; height: 9.4in; display: flex; flex-direction: column; justify-content: space-between; padding: 0.4in 0; box-sizing: border-box; }
  .cover-mark { font-family: var(--serif); font-style: italic; font-size: 18pt; color: var(--gold); }
  .cover-mark .mark-mono { font-family: var(--label); font-style: normal; text-transform: uppercase; letter-spacing: 0.32em; font-size: 9pt; color: var(--text-mute); margin-left: 1em; font-weight: 500; vertical-align: middle; }
  .cover-eyebrow { font-family: var(--label); text-transform: uppercase; letter-spacing: 0.32em; font-size: 10pt; color: var(--gold); font-weight: 500; margin: 0.4in 0 0.18in; }
  .cover-title { font-family: var(--serif); font-weight: 400; font-size: 44pt; line-height: 1.05; letter-spacing: -0.02em; max-width: 6.5in; border: none; padding: 0; margin: 0; }
  .cover-title em { font-style: italic; color: var(--gold); }
  .cover-subtitle { font-family: var(--serif); font-style: italic; font-size: 18pt; color: var(--gold); margin-top: 0.18in; }
  .cover-meta { font-family: var(--mono); font-size: 9.5pt; color: var(--text-mute); line-height: 1.6; border-top: 1px solid var(--line-soft); padding-top: 0.18in; }
  .cover-meta strong { color: var(--gold); font-weight: 500; text-transform: uppercase; letter-spacing: 0.18em; font-size: 8pt; display: block; margin-bottom: 0.04in; font-family: var(--label); }
  .cover-meta-row { display: flex; gap: 0.6in; margin-top: 0.1in; flex-wrap: wrap; }
  .cover-meta-cell { flex: 1; min-width: 1.6in; }
  h1 { font-family: var(--serif); font-weight: 400; font-size: 22pt; line-height: 1.1; letter-spacing: -0.015em; margin: 0 0 0.4in; color: var(--text); border-bottom: 1px solid var(--line); padding-bottom: 0.18in; }
  h1 em { font-style: italic; color: var(--gold); }
  h2 { font-family: var(--serif); font-weight: 400; font-size: 16pt; line-height: 1.2; margin: 0.35in 0 0.15in; letter-spacing: -0.01em; }
  h2 em { font-style: italic; color: var(--gold); }
  h3 { font-family: var(--label); text-transform: uppercase; letter-spacing: 0.16em; font-size: 11pt; font-weight: 600; margin: 0.25in 0 0.08in; color: var(--gold); }
  h4 { font-family: var(--body); font-weight: 600; font-size: 11pt; margin: 0.18in 0 0.06in; }
  p { margin: 0 0 0.12in; }
  strong { font-weight: 600; }
  em { font-style: italic; }
  ul, ol { margin: 0 0 0.15in 0.25in; padding: 0; }
  li { margin-bottom: 0.05in; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 0.25in 0; }
  blockquote { border-left: 3px solid var(--gold); padding-left: 0.18in; margin: 0.15in 0; color: var(--text-soft); font-style: italic; }
  table { border-collapse: collapse; width: 100%; margin: 0.15in 0; font-size: 9.5pt; page-break-inside: avoid; }
  th, td { border: 1px solid var(--line); padding: 6pt 8pt; text-align: left; vertical-align: top; }
  th { background: #f3eedd; font-family: var(--label); text-transform: uppercase; letter-spacing: 0.08em; font-size: 9pt; font-weight: 600; color: var(--text-soft); }
  code { font-family: var(--mono); font-size: 9pt; background: #f3eedd; padding: 1pt 4pt; border-radius: 2pt; }
  pre { font-family: var(--mono); font-size: 9pt; background: #f6f1e0; border: 1px solid var(--line-soft); border-radius: 4pt; padding: 10pt 12pt; page-break-inside: avoid; line-height: 1.45; margin: 0.12in 0; }
</style>
</head>
<body>
<div class="cover">
  <div>
    <div class="cover-mark">NeverRanked<span class="mark-mono">AEO + Schema deployment</span></div>
    <div>
      <div class="cover-eyebrow">Annual Report</div>
      <h1 class="cover-title">${title}</h1>
      ${subtitle ? `<div class="cover-subtitle">${subtitle}</div>` : ''}
    </div>
  </div>
  <div class="cover-meta">
    <div class="cover-meta-row">
      <div class="cover-meta-cell"><strong>Publisher</strong>NeverRanked</div>
      <div class="cover-meta-cell"><strong>Published</strong>${today}</div>
      <div class="cover-meta-cell"><strong>Author</strong>Lance Roylo</div>
    </div>
    <div class="cover-meta-row">
      <div class="cover-meta-cell" style="flex: 1 1 100%;">
        <strong>Six engines tracked</strong>
        <div style="font-size: 8.5pt;">ChatGPT &middot; Perplexity &middot; Gemini &middot; Claude &middot; Microsoft Copilot &middot; Google AI Overviews</div>
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

try { execSync(`rm -f "${tmpMd}"`); } catch {}

console.log('[3/3] Done.');
console.log();
console.log(`  ${pdfPath}`);
