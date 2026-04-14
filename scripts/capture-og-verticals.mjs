import puppeteer from 'puppeteer';

const BLOG_DIR = '/Users/lanceroylo/Desktop/neverranked/blog';
const DIST_DIR = '/Users/lanceroylo/Desktop/neverranked/dist/blog';

const templates = [
  { html: 'og-aeo-for-hvac.html', png: 'og-aeo-for-hvac.png' },
  { html: 'og-aeo-for-real-estate.html', png: 'og-aeo-for-real-estate.png' },
  { html: 'og-aeo-for-financial-advisors.html', png: 'og-aeo-for-financial-advisors.png' },
];

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630 });

for (const t of templates) {
  await page.goto(`file://${BLOG_DIR}/${t.html}`, { waitUntil: 'networkidle2', timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: `${BLOG_DIR}/${t.png}`, type: 'png' });
  await page.screenshot({ path: `${DIST_DIR}/${t.png}`, type: 'png' });
  console.log(`Captured: ${t.png}`);
}

await browser.close();
console.log('Done.');
