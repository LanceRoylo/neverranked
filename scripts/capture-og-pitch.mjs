#!/usr/bin/env node
'use strict';

/**
 * scripts/capture-og-pitch.mjs
 *
 * Capture an OG image for a pitch page. Each pitch lives at
 * pitch/<slug>/ with an optional og.html template at
 * pitch/<slug>/og.html. This script renders the template via
 * Playwright at 1200x630 and writes og.png alongside it. Also
 * copies to dist/pitch/<slug>/og.png so the next deploy picks
 * it up.
 *
 * Usage:
 *   node scripts/capture-og-pitch.mjs jordan-iq360
 *   node scripts/capture-og-pitch.mjs jordan-iq360 ellen
 *   node scripts/capture-og-pitch.mjs --all    # every pitch with og.html
 *
 * Why a new script (vs extending scripts/capture-og.mjs):
 * The blog script is hardcoded to BLOG_DIR. Pitches live at
 * pitch/<slug>/. Cleaner to have a pitch-shaped runner than
 * stretch the blog one.
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, copyFileSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const PITCH_DIR = resolve(REPO_ROOT, 'pitch');
const DIST_PITCH_DIR = resolve(REPO_ROOT, 'dist/pitch');

let slugs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const all = process.argv.includes('--all');

if (all) {
  slugs = readdirSync(PITCH_DIR).filter((d) =>
    existsSync(resolve(PITCH_DIR, d, 'og.html'))
  );
}

if (slugs.length === 0) {
  process.stderr.write('error: pass slug(s) or --all\n');
  process.stderr.write('       slugs with og.html present: ');
  process.stderr.write(
    readdirSync(PITCH_DIR)
      .filter((d) => existsSync(resolve(PITCH_DIR, d, 'og.html')))
      .join(', ') || '(none)'
  );
  process.stderr.write('\n');
  process.exit(2);
}

const { chromium } = await import('@playwright/test');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

for (const slug of slugs) {
  const srcHtml = resolve(PITCH_DIR, slug, 'og.html');
  if (!existsSync(srcHtml)) {
    process.stderr.write(`skip ${slug}: og.html not found\n`);
    continue;
  }
  const srcPng = resolve(PITCH_DIR, slug, 'og.png');
  const distPng = resolve(DIST_PITCH_DIR, slug, 'og.png');

  await page.goto('file://' + srcHtml, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: srcPng, type: 'png' });

  mkdirSync(dirname(distPng), { recursive: true });
  copyFileSync(srcPng, distPng);

  process.stdout.write(`captured pitch/${slug}/og.png (and copied to dist/)\n`);
}

await browser.close();
