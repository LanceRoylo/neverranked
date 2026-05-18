// Renders carousel slides for this post.
// Usage:
//   node render.mjs            -- renders slide 1 only (source-1.html -> card-1.png)
//   node render.mjs --all      -- renders every source-N.html in the folder
//   node render.mjs --slide=2  -- renders a specific slide
//
// Slides are 1080x1350 (Instagram 4:5 carousel ratio).

import { chromium } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const renderAll = args.includes('--all');
const slideArg = args.find(a => a.startsWith('--slide='));
const slideNum = slideArg ? parseInt(slideArg.split('=')[1], 10) : null;

let slidesToRender = [];
if (renderAll) {
  slidesToRender = readdirSync(__dirname)
    .filter(f => /^source-\d+\.html$/.test(f))
    .map(f => parseInt(f.match(/source-(\d+)\.html/)[1], 10))
    .sort((a, b) => a - b);
} else if (slideNum !== null) {
  slidesToRender = [slideNum];
} else {
  slidesToRender = [1];
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });

for (const n of slidesToRender) {
  const src = resolve(__dirname, `source-${n}.html`);
  if (!existsSync(src)) {
    console.log(`Skipping slide ${n}: source-${n}.html does not exist yet.`);
    continue;
  }
  const out = resolve(__dirname, `card-${n}.png`);
  await page.goto('file://' + src, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: out, type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1350 } });
  console.log('Wrote', out);
}

await browser.close();
