# A{N}: Canonical Tags + Robots Meta

**Client:** {client-name}
**Action:** A{N} (Canonical URL tags and robots meta directives)
**Roadmap source:** `audits/{client-name}/07-roadmap.md` line {L}, quote: {one-line quote}
**Reference implementation:** `audits/montaic/implementation/A7-canonicals-robots.md` _(delete this line if client IS Montaic)_
**Status:** pending

---

## What it does

Stops Google and AI engines from splitting page authority across URL variants. Adds explicit indexing permissions so crawlers know which pages are public, which are staging, and which should never appear in SERPs. Missing canonicals on high-value pages (homepage, pricing, free tool, blog index) are the single most common AEO oversight found in audits.

## Where it goes

`<head>` of every public page. Framework-specific locations:

- Next.js App Router: `generateMetadata` or static `metadata` export in each `page.tsx`
- Next.js Pages Router: `<Head>` component in each page or `_app.tsx` defaults
- Astro: `<meta>` tags in each page's frontmatter or a shared layout prop
- Plain HTML: `<link rel="canonical">` in the `<head>` of each template

Add a backup `X-Robots-Tag` HTTP header at the edge (Cloudflare Workers, Vercel headers config, Netlify `_headers`) for any staging or admin routes that should never be indexed. Headers override HTML tags and survive rendering bugs.

---

## Inputs the client must provide

- **Production domain.** Exact canonical form (with or without `www`, with or without trailing slash).
- **Audit findings.** The list of pages currently missing canonicals (from the technical audit).
- **Framework + router.** Which Next.js mode, which SSG tool, what the current metadata mechanism is.
- **Staging subdomain.** Any non-production hostname that should carry `noindex`.
- **Admin routes.** Any logged-in or internal pages that should never be crawled.

## Fill-in checklist

- [ ] Every page in the audit's "missing canonical" list has a canonical tag
- [ ] Canonical URLs match the exact production form (no mixed `http`/`https`, no stray trailing slashes)
- [ ] Canonical URLs are absolute, not relative
- [ ] `robots: { index: true, follow: true }` set on every public page
- [ ] `max-image-preview: large` and `max-snippet: -1` set (allow rich SERP previews)
- [ ] `noindex, nofollow` set on admin routes and staging subdomains
- [ ] `X-Robots-Tag: noindex` set at the edge on staging hostname as a belt-and-suspenders safeguard
- [ ] Homepage canonical explicitly set (most commonly missed, most damaging when missing)
- [ ] Blog post template sets canonical from the slug, not hard-coded
- [ ] No canonical tag points at a URL that returns 404 or redirects

## Schema required

None. This action is pure HTML meta + HTTP headers.

## Validation

After deploy, curl each of the target pages and confirm:

```sh
# Canonical tag present and correct
curl -s {production-url} | grep -oE '<link[^>]*rel="canonical"[^>]*>'

# Robots meta present and permissive
curl -s {production-url} | grep -oE '<meta[^>]*name="robots"[^>]*>'

# X-Robots-Tag header on staging (should show noindex)
curl -sI {staging-url} | grep -i 'x-robots-tag'

# No noindex on production homepage (should output nothing)
curl -s {production-url} | grep -c 'noindex'
```

Then run the production article URL through [Google Rich Results Test](https://search.google.com/test/rich-results) to confirm the page is crawlable and the canonical resolves.

For clients with a blog, `scripts/verify-deploy.sh` Check 1 catches a broken canonical indirectly (it looks for the absence of `noindex` on a URL that should be public).

Record the validation date in the client implementation README's status table.

---

## Notes

{Scratch space. Client-specific: which pages had canonicals pointing at the wrong URL form, which staging subdomain was leaking into Google's index, any mixed-content issues. Delete before the client sees this file.}
