#!/usr/bin/env node
// Renders LinkedIn assets from HTML sources using Playwright's bundled Chromium.
// Run from repo root: `node linkedin/render.mjs`

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const targets = [
  { html: 'logo-source.html',              out: 'images/logo-300.png',           w: 300,  h: 300 },
  { html: 'cover-source.html',             out: 'images/cover-1128x191.png',     w: 1128, h: 191 },
  { html: 'post-01-scorecard-source.html', out: 'images/post-01-scorecard.png',  w: 1200, h: 1200 },
  { html: 'post-02-truthcard-source.html', out: 'images/post-02-truthcard.png',  w: 1200, h: 1200 },
  { html: 'post-03-scorecard-source.html', out: 'images/post-03-scorecard.png',  w: 1200, h: 1200 },
];

const browser = await chromium.launch();

for (const t of targets) {
  const context = await browser.newContext({
    viewport: { width: t.w, height: t.h },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const url = 'file://' + resolve(__dirname, t.html);
  await page.goto(url, { waitUntil: 'load' });
  // Allow web fonts to fully paint.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.screenshot({
    path: resolve(__dirname, t.out),
    clip: { x: 0, y: 0, width: t.w, height: t.h },
    omitBackground: false,
  });
  await context.close();
  console.log('rendered', t.out);
}

await browser.close();
