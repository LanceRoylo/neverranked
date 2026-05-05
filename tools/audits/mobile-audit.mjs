import { chromium, devices } from '@playwright/test';
import fs from 'fs';

const BASE = 'http://localhost:8765';
const PAGES = [
  { id: 'home', url: '/' },
  { id: 'about', url: '/about/' },
  { id: 'for-agencies', url: '/for-agencies/' },
  { id: 'agencies', url: '/agencies/' },
  { id: 'case-studies', url: '/case-studies/' },
  { id: 'case-and-scene', url: '/case-studies/and-scene/' },
  { id: 'blog-index', url: '/blog/' },
  { id: 'blog-what-is-aeo', url: '/blog/what-is-aeo/' },
  { id: 'blog-aeo-pricing', url: '/blog/aeo-pricing/' },
  { id: 'blog-best-aeo', url: '/blog/best-aeo-agency/' },
  { id: 'pitch-blue-note', url: '/pitch/blue-note-hawaii/' },
  { id: 'kit', url: '/kit/' },
  { id: 'principles', url: '/principles/' },
  { id: '404', url: '/404.html' },
  { id: 'privacy', url: '/privacy/' },
  { id: 'terms', url: '/terms/' },
  { id: 'security', url: '/security/' },
];
const VIEWPORTS = [
  { name: 'iphone-se', width: 375, height: 667, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'iphone-14p', width: 393, height: 852, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  { name: 'ipad-mini', width: 768, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];

const report = { pages: {} };
const browser = await chromium.launch();

for (const v of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: v.deviceScaleFactor,
    isMobile: v.isMobile,
    hasTouch: v.hasTouch,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  for (const pg of PAGES) {
    const page = await ctx.newPage();
    const consoleMsgs = [];
    const networkErrs = [];
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push({type: m.type(), text: m.text()}); });
    page.on('requestfailed', r => networkErrs.push({ url: r.url(), failure: r.failure()?.errorText }));
    let totalBytes = 0;
    page.on('response', async r => {
      try { const buf = await r.body(); totalBytes += buf.length; } catch {}
    });
    try {
      await page.goto(BASE + pg.url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(400);

      // Screenshot (above-fold + full)
      await page.screenshot({ path: `/tmp/nr-audit/${pg.id}-${v.name}.png` });

      // Audits run in the page
      const audit = await page.evaluate(({vw}) => {
        const results = { hOverflow: [], smallTargets: [], tightSpacing: [], imagesNoLazy: 0, imagesNoAlt: 0, fontSizesBelow12: [], inputs: [], anchors: 0, buttons: 0 };

        // Horizontal overflow detection
        const docW = document.documentElement.scrollWidth;
        if (docW > vw + 1) {
          results.docOverflow = { docW, vw };
          // Find offending elements
          const all = document.querySelectorAll('*');
          for (const el of all) {
            const r = el.getBoundingClientRect();
            if (r.right > vw + 2 && r.width > 0 && r.width < vw * 1.2) {
              results.hOverflow.push({
                tag: el.tagName.toLowerCase(),
                cls: (el.className && el.className.toString && el.className.toString().slice(0, 60)) || '',
                id: el.id || '',
                right: Math.round(r.right),
                width: Math.round(r.width),
              });
              if (results.hOverflow.length >= 8) break;
            }
          }
        }

        // Touch targets
        const interactive = document.querySelectorAll('a[href], button, input, select, textarea, [role="button"]');
        for (const el of interactive) {
          if (el.tagName === 'A') results.anchors++;
          if (el.tagName === 'BUTTON') results.buttons++;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue; // hidden
          const minDim = Math.min(r.width, r.height);
          if (minDim < 44) {
            const txt = (el.innerText || el.value || el.placeholder || '').slice(0, 40);
            results.smallTargets.push({
              tag: el.tagName.toLowerCase(),
              w: Math.round(r.width),
              h: Math.round(r.height),
              txt,
              cls: (el.className && el.className.toString && el.className.toString().slice(0, 40)) || '',
            });
            if (results.smallTargets.length >= 15) break;
          }
        }

        // Inputs check
        for (const inp of document.querySelectorAll('input')) {
          results.inputs.push({
            type: inp.type, inputmode: inp.inputMode || inp.getAttribute('inputmode') || '',
            autocomplete: inp.autocomplete, autocorrect: inp.getAttribute('autocorrect') || '',
            autocapitalize: inp.getAttribute('autocapitalize') || '',
            placeholder: inp.placeholder?.slice(0, 30) || '',
          });
        }

        // Images
        for (const img of document.querySelectorAll('img')) {
          if (!img.loading || img.loading === 'eager') results.imagesNoLazy++;
          if (!img.alt) results.imagesNoAlt++;
        }

        // Font sizes
        const seen = new Set();
        for (const el of document.querySelectorAll('p, span, li, a, td, th')) {
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs < 12 && !seen.has(el.tagName + fs)) {
            seen.add(el.tagName + fs);
            results.fontSizesBelow12.push({ tag: el.tagName.toLowerCase(), fs, txt: (el.innerText || '').slice(0, 30) });
            if (results.fontSizesBelow12.length >= 6) break;
          }
        }

        return results;
      }, { vw: v.width });

      const key = `${pg.id}__${v.name}`;
      report.pages[key] = {
        page: pg.id, url: pg.url, viewport: v.name,
        bytes: totalBytes,
        consoleMsgs: consoleMsgs.slice(0, 10),
        networkErrs: networkErrs.slice(0, 10),
        audit,
      };
    } catch (e) {
      report.pages[`${pg.id}__${v.name}`] = { page: pg.id, viewport: v.name, error: String(e).slice(0, 200) };
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync('/tmp/nr-audit/report.json', JSON.stringify(report, null, 2));
console.log('done; pages audited:', Object.keys(report.pages).length);
