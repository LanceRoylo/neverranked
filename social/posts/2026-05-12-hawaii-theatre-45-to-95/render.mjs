import { chromium } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const html = 'file://' + resolve(__dirname, 'source.html');
const out = resolve(__dirname, 'card.png');
const browser = await chromium.launch();
// 1080x1350 = Instagram 4:5 portrait, the format that takes the most
// vertical real estate in the feed and is hardest to scroll past.
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
await page.goto(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: out, type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1350 } });
await browser.close();
console.log('Wrote', out);
