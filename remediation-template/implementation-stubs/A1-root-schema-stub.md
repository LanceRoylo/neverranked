# A{N}: Root Layout Schema (Organization + WebSite)

**Client:** {client-name}
**Action:** A{N} (Root layout schema, Organization + WebSite as a linked `@graph`)
**Roadmap source:** `audits/{client-name}/07-roadmap.md` line {L}, quote: {one-line quote}
**Schema pattern:** `remediation-template/schema-patterns/` _(check for existing snippet, otherwise start from the reference implementation)_
**Reference implementation:** `audits/montaic/implementation/A1-root-schema.md` _(delete this line if client IS Montaic)_
**Status:** pending

---

## What it does

Establishes {client-name} as a recognized entity in Google's knowledge graph and in the training data of every AI engine that crawls the open web. Without Organization schema on the root layout, the brand gets fuzzy-matched to similar-sounding names, and no per-page schema can cleanly reference a shared entity graph. This is the single highest-impact schema change in the Month 1 kit for almost every client.

## Where it goes

In the `<head>` of the root layout template so it is present on every single page. Framework-specific locations:

- Next.js App Router: `app/layout.tsx` (via `<Script type="application/ld+json">` or a dedicated schema component)
- Next.js Pages Router: `pages/_document.tsx`
- Astro: `src/layouts/BaseLayout.astro`
- Plain HTML / 11ty / Hugo: the base template's `<head>` partial

The block must render before any per-page schema so the `@id` references resolve correctly.

---

## Inputs the client must provide before paste

Collect these before you start the fill-in pass. Do not guess. If any are missing, stop and ask.

- **Brand name** (and any `alternateName` variants people actually use)
- **Production domain** (pick one canonical form with or without trailing slash, then be consistent)
- **Logo file** at 512x512 minimum, transparent PNG ideal (path and dimensions)
- **Description.** The one-sentence answer to "what is {client-name}" that AI engines will quote.
- **Founding date** (year is enough)
- **Founder name** and job title (becomes a Person subgraph reusable by Article schemas)
- **`knowsAbout` topics.** 5 to 8 subjects the brand is an authority on. These train AI engines on what to cite you for.
- **`sameAs` URLs.** Live, resolving URLs only. LinkedIn, Crunchbase, X/Twitter, Product Hunt, G2, Capterra, industry directories. Never list a `sameAs` URL that 404s.
- **Contact email** and preferred contact type (customer support, sales, press)
- **SearchAction decision.** Does the client have site search at a real endpoint? If yes, capture the URL template. If no, REMOVE the `potentialAction` block. Never claim a feature that does not exist.

## Fill-in checklist

Tick each before paste.

- [ ] Brand name and alternateName locked
- [ ] Logo file exists at a real URL, 512x512 minimum
- [ ] Description drafted in client voice (not generic)
- [ ] Founding year verified
- [ ] Founder Person subgraph filled in
- [ ] `knowsAbout` has 5 to 8 items, each a specific subject (not marketing fluff)
- [ ] Every `sameAs` URL pre-flighted with `curl -I` and returns 200
- [ ] Contact email is a real, monitored inbox
- [ ] SearchAction decision: keep (with real endpoint) or remove entirely
- [ ] `@id` values use the client's production domain, not a placeholder

## Schema required

- Organization (with nested Person founder, ImageObject logo, ContactPoint)
- WebSite (with publisher reference back to Organization)
- Both inside a single `@graph` payload linked via `@id` references

## Validation

After paste and deploy, run each of these:

1. Open the site in a fresh incognito window, view source, confirm the `<script type="application/ld+json">` block is present in the rendered `<head>`
2. Copy the block content and paste into [Google Rich Results Test](https://search.google.com/test/rich-results). Expect `Organization` and `WebSite` both detected, 0 errors.
3. Paste into [Schema.org Validator](https://validator.schema.org/). Fix any warnings (missing logo dimensions, unresolved `@id`, etc.) before moving on.
4. Grep the rendered HTML for the brand's `@id` and confirm per-page schemas will be able to reference it

Record the validation date in the client implementation README's status table.

---

## Notes

{Scratch space. Platform-specific gotchas, client decisions that don't fit the checklist, tension between audit recommendations and the client's existing schema. Delete before the client sees this file.}
