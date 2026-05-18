// Renders the Story sequence cards.
// Usage:
//   node render.mjs            -- renders all source-N.html files in the folder
//   node render.mjs --card=2   -- renders a specific card
//
// Cards are 1080x1920 (Instagram Stories 9:16).

import { chromium } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const cardArg = args.find(a => a.startsWith('--card='));
const cardNum = cardArg ? parseInt(cardArg.split('=')[1], 10) : null;

let cardsToRender = [];
if (cardNum !== null) {
  cardsToRender = [cardNum];
} else {
  cardsToRender = readdirSync(__dirname)
    .filter(f => /^source-\d+\.html$/.test(f))
    .map(f => parseInt(f.match(/source-(\d+)\.html/)[1], 10))
    .sort((a, b) => a - b);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 2 });

for (const n of cardsToRender) {
  const src = resolve(__dirname, `source-${n}.html`);
  if (!existsSync(src)) {
    console.log(`Skipping card ${n}: source-${n}.html does not exist.`);
    continue;
  }
  const out = resolve(__dirname, `card-${n}.png`);
  await page.goto('file://' + src, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: out, type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1920 } });
  console.log('Wrote', out);
}

await browser.close();
