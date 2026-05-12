import puppeteer from 'puppeteer';

const BRAND = '/Users/lanceroylo/Desktop/neverranked/brand';

const templates = [
  { html: 'hawaii-theatre-lockup.html',    png: 'hawaii-theatre-lockup-1200.png', w: 1200, h: 1200 },
  { html: 'hawaii-theatre-square-1080.html', png: 'hawaii-theatre-square-1080.png', w: 1080, h: 1080 },
];

const browser = await puppeteer.launch({ headless: true });
for (const t of templates) {
  const page = await browser.newPage();
  await page.setViewport({ width: t.w, height: t.h, deviceScaleFactor: 2 });
  await page.goto(`file://${BRAND}/${t.html}`, { waitUntil: 'networkidle2', timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: `${BRAND}/${t.png}`, type: 'png' });
  console.log(`Rendered: ${t.png}`);
  await page.close();
}
await browser.close();
