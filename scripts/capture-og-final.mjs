import puppeteer from 'puppeteer';
const BLOG = '/Users/lanceroylo/Desktop/neverranked/blog';
const DIST = '/Users/lanceroylo/Desktop/neverranked/dist/blog';
const templates = [
  { html: 'og-aeo-for-restaurants.html', png: 'og-aeo-for-restaurants.png' },
  { html: 'og-aeo-for-chiropractors.html', png: 'og-aeo-for-chiropractors.png' },
];
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630 });
for (const t of templates) {
  await page.goto(`file://${BLOG}/${t.html}`, { waitUntil: 'networkidle2', timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: `${BLOG}/${t.png}`, type: 'png' });
  await page.screenshot({ path: `${DIST}/${t.png}`, type: 'png' });
  console.log(`Captured: ${t.png}`);
}
await browser.close();
console.log('Done.');
