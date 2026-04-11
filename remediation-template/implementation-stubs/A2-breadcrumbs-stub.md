# A{N}: BreadcrumbList Schema

**Client:** {client-name}
**Action:** A{N} (BreadcrumbList JSON-LD schema across the site's URL taxonomy)
**Roadmap source:** `audits/{client-name}/07-roadmap.md` line {L}, quote: {one-line quote}
**Schema pattern:** `remediation-template/schema-patterns/` _(check for existing helper, otherwise copy from the reference implementation)_
**Reference implementation:** `audits/montaic/implementation/A2-breadcrumbs.md` _(delete this line if client IS Montaic)_
**Status:** pending

---

## What it does

Adds `BreadcrumbList` JSON-LD to every page so Google and AI engines understand the site's hierarchy. Breadcrumbs are a rich SERP result (the path shown above the title) and a primary signal AI engines use to understand how pages relate to each other. For any site with more than a handful of URLs, breadcrumbs convert flat crawl output into a structured tree.

## Where it goes

A small utility function in a shared schema helper (e.g., `lib/schema.ts` in Next.js), called from every page template. Never hand-code breadcrumbs per page. Use the helper so the taxonomy stays consistent when URLs change.

The rendered JSON-LD goes inside a `<script type="application/ld+json">` in the page's `<head>`, alongside whatever other per-page schema the template emits (Article, HowTo, SoftwareApplication, etc.).

---

## Inputs the client must provide

- **Production domain.** Becomes the `BASE_URL` constant in the helper.
- **URL taxonomy.** The site's section hierarchy. If the audit has a site map, use it. Otherwise derive from the URL structure.
- **Page types.** List every distinct template on the site (home, blog post, tool page, landing page, pricing, etc.). Each page type needs a breadcrumb wiring.
- **Visible navigation.** The breadcrumb schema must match what users see. If the site nav shows `Home > Tools > MLS Generator`, the schema must match. Schema claims that diverge from the UI get flagged as spam.
- **Orphan pages.** Any pages that do not belong in the main taxonomy (landing pages, campaign pages). Decide per-page whether they get a 2-item crumb (`Home > {page name}`) or are intentionally excluded.

## Fill-in checklist

- [ ] `BASE_URL` constant set to the production domain
- [ ] `breadcrumbSchema` helper function added to `lib/schema` (or equivalent)
- [ ] `Home` included as position 1 automatically by the helper
- [ ] Every page type wired to call the helper with its correct crumb list
- [ ] Breadcrumb names match the visible navigation labels (schema-to-UI parity)
- [ ] Blog post template pulls breadcrumbs from its category, not hard-coded
- [ ] Tool/feature pages use a consistent parent label (pick one of `Tools`, `Features`, `Products` and stick to it)
- [ ] Campaign or landing pages either get a 2-item crumb or are intentionally excluded with a comment explaining why
- [ ] No page type emits a BreadcrumbList with fewer than 2 items (just `Home` alone is invalid)
- [ ] Each `item` URL is absolute, not relative, and returns 200

## Schema required

- `BreadcrumbList` with `itemListElement` array of `ListItem` nodes
- Each `ListItem` has `position` (1-indexed), `name`, and `item` (absolute URL)

## Validation

After deploy, pick one page from each page type and run:

```sh
# Confirm BreadcrumbList is in the rendered HTML
curl -s {page-url} | grep -oE '"@type":"BreadcrumbList"'

# Count the ListItem nodes
curl -s {page-url} | grep -oE '"@type":"ListItem"' | wc -l
```

Then:

1. Paste the URL into [Google Rich Results Test](https://search.google.com/test/rich-results). Expect `Breadcrumbs` detected, 0 errors.
2. Confirm the schema breadcrumb labels match what the user sees in the site navigation
3. Click through the rendered breadcrumb URLs in a browser. Every one should return 200.

For clients with a blog, `scripts/verify-deploy.sh` Check 6 validates BreadcrumbList presence automatically on every blog post publish.

Record the validation date in the client implementation README's status table.

---

## Notes

{Scratch space. Client-specific taxonomy decisions, pages intentionally excluded from breadcrumbs, any schema-to-UI mismatches that needed the UI to change rather than the schema. Delete before the client sees this file.}
