import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const BLOG_DIR = '/Users/lanceroylo/Desktop/neverranked/blog';
const DIST_DIR = '/Users/lanceroylo/Desktop/neverranked/dist/blog';

const templates = [
  { html: 'og-why-chatgpt-recommends.html', png: 'og-why-chatgpt-recommends.png' },
  { html: 'og-aeo-score.html', png: 'og-aeo-score.png' },
  { html: 'og-website-traffic-dropped.html', png: 'og-website-traffic-dropped.png' },
  { html: 'og-aeo-for-dentists.html', png: 'og-aeo-for-dentists.png' },
  { html: 'og-aeo-for-med-spas.html', png: 'og-aeo-for-med-spas.png' },
  { html: 'og-aeo-for-lawyers.html', png: 'og-aeo-for-lawyers.png' },
  { html: 'og-check-chatgpt.html', png: 'og-check-chatgpt.png' },
  { html: 'og-is-seo-dead.html', png: 'og-is-seo-dead.png' },
];

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630 });

for (const t of templates) {
  const filePath = `file://${BLOG_DIR}/${t.html}`;
  await page.goto(filePath, { waitUntil: 'networkidle2', timeout: 15000 });
  // Wait for fonts to load
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 500));

  // Save to both blog/ and dist/blog/
  await page.screenshot({ path: `${BLOG_DIR}/${t.png}`, type: 'png' });
  await page.screenshot({ path: `${DIST_DIR}/${t.png}`, type: 'png' });
  console.log(`Captured: ${t.png}`);
}

await browser.close();
console.log('Done. All OG images captured.');
