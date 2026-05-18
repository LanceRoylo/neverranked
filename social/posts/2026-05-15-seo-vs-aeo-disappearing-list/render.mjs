import { chromium } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();

// 1080x1350 = Instagram 4:5 portrait. 9 slides, The Disappearing List.
for (let i = 1; i <= 9; i++) {
  const html = 'file://' + resolve(__dirname, `source-${i}.html`);
  const out = resolve(__dirname, `card-${i}.png`);
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: 2,
  });
  await page.goto(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({
    path: out,
    type: 'png',
    clip: { x: 0, y: 0, width: 1080, height: 1350 },
  });
  await page.close();
  console.log('Wrote', out);
}

await browser.close();
console.log('All 9 cards rendered.');
