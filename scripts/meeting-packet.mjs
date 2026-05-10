#!/usr/bin/env node
'use strict';

/**
 * scripts/meeting-packet.mjs
 *
 * Bundles a set of markdown source documents into one composite
 * PDF. Designed for meeting prep where the audience benefits from
 * the State of AEO report + the Reddit landscape + the meeting
 * evidence appendix arriving as a single artifact rather than
 * four separate links.
 *
 * Usage:
 *   node scripts/meeting-packet.mjs \
 *     --output content/meeting-evidence/asb-2026-05-18-packet \
 *     --title "ASB + MVNP Meeting Packet" \
 *     --subtitle "May 18, 2026" \
 *     content/meeting-evidence/asb-2026-05-18.md \
 *     reports/state-of-aeo/state-of-aeo-2026-05-10.md \
 *     content/reddit-briefs/2026-05-09-asb/README.md \
 *     content/reddit-briefs/2026-05-09-hawaii-landscape/README.md
 *
 * Output: <output>.pdf and <output>.html.
 *
 * The output PDF carries each source markdown as a section, with
 * a generated cover page + automatic page breaks between sections.
 * Reuses report-pdf.mjs's chrome for visual consistency.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// -----------------------------------------------------------------
// Args
// -----------------------------------------------------------------

const args = { output: null, title: 'Meeting Packet', subtitle: '', sources: [] };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--output') { args.output = process.argv[++i]; continue; }
  if (a === '--title') { args.title = process.argv[++i]; continue; }
  if (a === '--subtitle') { args.subtitle = process.argv[++i]; continue; }
  if (a === '--help' || a === '-h') {
    process.stdout.write(`Usage: meeting-packet.mjs --output <path-without-ext> [--title T] [--subtitle S] <md-source>...\n`);
    process.exit(0);
  }
  args.sources.push(a);
}

if (!args.output || args.sources.length === 0) {
  process.stderr.write('error: --output and at least one markdown source are required\n');
  process.exit(2);
}

// -----------------------------------------------------------------
// Compose: render each source markdown via pandoc, wrap in a section
// -----------------------------------------------------------------

function fileLabel(p) {
  // Friendly label for the section header derived from the path.
  const name = basename(p, '.md');
  if (name === 'README') {
    const parent = basename(dirname(p));
    return parent.replace(/^content[/-]/, '').replace(/-/g, ' ');
  }
  return name.replace(/-/g, ' ');
}

const sectionsHtml = [];
for (const src of args.sources) {
  const abs = resolve(REPO_ROOT, src);
  if (!existsSync(abs)) {
    process.stderr.write(`error: source not found: ${src}\n`);
    process.exit(2);
  }
  // Strip front matter if present.
  let md = readFileSync(abs, 'utf8').replace(/^---\n[\s\S]*?\n---\n+/, '');
  const tmp = resolve(dirname(abs), '.packet-tmp.md');
  writeFileSync(tmp, md, 'utf8');
  const html = execSync(
    `pandoc -f markdown -t html5 --wrap=preserve "${tmp}"`,
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
  );
  try { execSync(`rm -f "${tmp}"`); } catch {}

  // Voice normalization, same as state-of-aeo-publish.
  const cleaned = html
    .replace(/—/g, ', ')
    .replace(/–/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');

  sectionsHtml.push(`<div class="packet-section">
  <p class="packet-section-eyebrow">${fileLabel(src)}</p>
  ${cleaned}
</div>`);
}

const today = new Date().toISOString().slice(0, 10);
const fullHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${args.title}${args.subtitle ? ': ' + args.subtitle : ''}</title>
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
  .cover { page-break-after: always; height: 9.4in; display: flex; flex-direction: column; justify-content: space-between; padding: 0.4in 0; box-sizing: border-box; }
  .cover-mark { font-family: var(--serif); font-style: italic; font-size: 18pt; color: var(--gold); }
  .cover-mark .mark-mono { font-family: var(--label); font-style: normal; text-transform: uppercase; letter-spacing: 0.32em; font-size: 9pt; color: var(--text-mute); margin-left: 1em; font-weight: 500; vertical-align: middle; }
  .cover-eyebrow { font-family: var(--label); text-transform: uppercase; letter-spacing: 0.32em; font-size: 10pt; color: var(--gold); font-weight: 500; margin: 0.4in 0 0.18in; }
  .cover-title { font-family: var(--serif); font-weight: 400; font-size: 44pt; line-height: 1.05; letter-spacing: -0.02em; max-width: 6.5in; border: none; padding: 0; margin: 0; }
  .cover-title em { font-style: italic; color: var(--gold); }
  .cover-subtitle { font-family: var(--serif); font-style: italic; font-size: 18pt; color: var(--gold); margin-top: 0.18in; }
  .cover-meta { font-family: var(--mono); font-size: 9.5pt; color: var(--text-mute); line-height: 1.6; border-top: 1px solid var(--line-soft); padding-top: 0.18in; }
  .cover-meta strong { color: var(--gold); font-weight: 500; text-transform: uppercase; letter-spacing: 0.18em; font-size: 8pt; display: block; margin-bottom: 0.04in; font-family: var(--label); }
  .toc { padding: 0.4in 0; }
  .toc h2 { font-family: var(--serif); font-weight: 400; font-size: 22pt; margin: 0 0 0.3in; }
  .toc ol { font-family: var(--body); font-size: 12pt; line-height: 1.9; margin: 0; padding-left: 0.4in; }
  .toc li { color: var(--text-soft); }
  .toc-break { page-break-after: always; }
  .packet-section { padding-top: 0.2in; page-break-before: always; }
  .packet-section-eyebrow { font-family: var(--label); text-transform: uppercase; letter-spacing: 0.32em; font-size: 10pt; color: var(--gold); font-weight: 500; margin: 0 0 0.2in; }
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
    <div class="cover-mark">NeverRanked<span class="mark-mono">Meeting Packet</span></div>
    <div>
      <div class="cover-eyebrow">Composite</div>
      <h1 class="cover-title">${args.title}</h1>
      ${args.subtitle ? `<div class="cover-subtitle">${args.subtitle}</div>` : ''}
    </div>
  </div>
  <div class="cover-meta">
    <div><strong>Compiled</strong>${today}</div>
    <div><strong>Sources</strong>${args.sources.length} documents bundled</div>
    <div><strong>Author</strong>Lance Roylo</div>
  </div>
</div>
<div class="toc toc-break">
  <h2>Contents</h2>
  <ol>
    ${args.sources.map((s) => `<li>${fileLabel(s)}</li>`).join('\n    ')}
  </ol>
</div>
${sectionsHtml.join('\n')}
</body>
</html>`;

const outBase = resolve(REPO_ROOT, args.output);
const htmlPath = `${outBase}.html`;
const pdfPath = `${outBase}.pdf`;
writeFileSync(htmlPath, fullHtml, 'utf8');
process.stdout.write(`[1/2] Wrote ${htmlPath.replace(REPO_ROOT + '/', '')}\n`);

process.stdout.write('[2/2] Rendering PDF via Playwright...\n');
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

process.stdout.write(`\n  ${pdfPath.replace(REPO_ROOT + '/', '')}\n`);
