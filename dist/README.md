# dist/ — Cloudflare Pages deploy folder

**This folder contains only what Never Ranked's public site needs.** Drag this folder (not the parent repo) into Cloudflare Pages direct upload, and nothing internal (audits, templates, scripts, content drafts) leaks.

## What's in here

- `index.html` — the marketing site
- `og.png` — branded social share image
- `robots.txt` — crawler directives
- `sitemap.xml` — URL inventory for search engines
- `_headers` — Cloudflare Pages headers and caching rules

## How to deploy

See `../DEPLOY.md` in the parent repo for the full walkthrough. Short version:

1. https://dash.cloudflare.com/ → Workers & Pages → Create → Pages → Upload assets
2. Project name: `neverranked`
3. Drag **this folder** (not the parent repo) into the upload area
4. Click Deploy
5. Live at `https://neverranked.pages.dev` in ~30 seconds

## Keeping this in sync

If you edit the main `index.html` or regenerate `og.png`, copy the updated files into this folder before re-deploying:

```bash
cp index.html og.png robots.txt sitemap.xml _headers dist/
```

Or just delete this folder and regenerate it from the repo root when you need a fresh deploy:

```bash
rm -rf dist && mkdir dist && cp index.html og.png robots.txt sitemap.xml _headers dist/
```
