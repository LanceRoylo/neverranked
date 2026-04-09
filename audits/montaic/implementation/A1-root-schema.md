# A1 — Root Layout Schema (Organization + WebSite)

**What it does:** Establishes Montaic as a recognized entity in Google's knowledge graph and every AI engine's training data. Currently Montaic has no Organization schema anywhere on the site, which is the single largest reason the brand is being fuzzy-matched as "Monti" / "Monte" / "Montana."

**Where it goes:** In the `<head>` of the root layout template so it's present on every single page. Next.js convention is `app/layout.tsx` or `pages/_document.tsx`.

**Time to implement:** 15 minutes.

**Impact:** Highest-leverage single change in the entire roadmap.

---

## The code

Paste this as a single `<script type="application/ld+json">` block in the root layout. It's a `@graph` construction that links Organization and WebSite together with `@id` references, which lets every per-page schema reference back to the site-wide entities.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://montaic.com/#organization",
      "name": "Montaic",
      "alternateName": "Montaic AI",
      "url": "https://montaic.com",
      "logo": {
        "@type": "ImageObject",
        "@id": "https://montaic.com/#logo",
        "url": "https://montaic.com/logo-512.png",
        "width": 512,
        "height": 512,
        "caption": "Montaic"
      },
      "image": {"@id": "https://montaic.com/#logo"},
      "description": "Montaic is the AI-native listing content platform for real estate professionals and yacht brokers. MLS descriptions, social posts, fact sheets, and marketing copy in your writing style, with Fair Housing compliance scanning built in.",
      "foundingDate": "2025",
      "founder": {
        "@type": "Person",
        "@id": "https://montaic.com/#founder",
        "name": "Lance Roylo",
        "jobTitle": "Founder",
        "worksFor": {"@id": "https://montaic.com/#organization"}
      },
      "knowsAbout": [
        "Real Estate Marketing",
        "MLS Listing Descriptions",
        "Fair Housing Compliance",
        "AI Content Generation",
        "Yacht Broker Marketing",
        "AEO",
        "Answer Engine Optimization"
      ],
      "slogan": "Your next listing, ready in 30 seconds.",
      "sameAs": [
        "https://www.linkedin.com/company/montaic",
        "https://twitter.com/montaicai",
        "https://www.instagram.com/montaic",
        "https://www.crunchbase.com/organization/montaic",
        "https://www.producthunt.com/products/montaic",
        "https://www.g2.com/products/montaic",
        "https://www.capterra.com/p/montaic"
      ],
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "customer support",
        "email": "support@montaic.com",
        "availableLanguage": ["English"]
      }
    },
    {
      "@type": "WebSite",
      "@id": "https://montaic.com/#website",
      "url": "https://montaic.com",
      "name": "Montaic",
      "description": "AI-native listing content platform for real estate and marine professionals.",
      "publisher": {"@id": "https://montaic.com/#organization"},
      "inLanguage": "en-US",
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://montaic.com/search?q={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      }
    }
  ]
}
</script>
```

---

## What to fill in before you paste

**Must update:**

1. **`logo.url`** — replace `logo-512.png` with the actual path to your highest-quality logo file. If the file doesn't exist yet at 512×512, create one today. Transparent PNG is ideal, but JPG works if it has good edges against white.

2. **`sameAs` URLs** — these are placeholders. Replace with real URLs for each platform AS you register them (see A10). If a platform doesn't exist yet, comment out that line OR leave it and fix after you register. Google is forgiving about dead `sameAs` links but it's cleaner to only list ones that resolve.

3. **`contactPoint.email`** — if you use `hello@montaic.com` instead of `support@montaic.com`, change it.

4. **`foundingDate`** — verify the year. Change to "2024" or whatever's accurate.

**Should update:**

5. **`alternateName`** — if people call it anything else (e.g., "Montaic AI," "Montaic Listings"), list them here. This helps disambiguate from "Monti" / "Monte."

6. **`description`** — this is what AI engines quote when asked "what is Montaic." The current version emphasizes the differentiators (AI-native, writing style, Fair Housing). Refine the language to match your voice.

7. **`slogan`** — currently pulled from your homepage h1. Update if you're ditching "voice" language per the keyword report.

---

## The SearchAction requires a real endpoint

The `WebSite` schema includes a `potentialAction: SearchAction` that tells Google you have site search. This enables the search box rich result in Google SERPs. **It only works if `/search?q=...` is a real page that actually shows results.**

If Montaic doesn't have site search yet, you have two options:

**Option A — Build it.** A basic search endpoint that greps all pages for the query and shows matches. For a 222-page site, this is a weekend project using Fuse.js client-side or Algolia DocSearch (free for open source / reasonable for commercial).

**Option B — Remove the SearchAction block.** Delete the entire `potentialAction` object from the schema. The WebSite schema still works without it. You lose the SERP search box rich result but you're not lying to Google.

**My recommendation:** Remove it now, add it later once search is built. Don't ship the schema claiming a feature that doesn't exist.

To remove, delete these lines from the schema block:

```json
"potentialAction": {
  "@type": "SearchAction",
  "target": {
    "@type": "EntryPoint",
    "urlTemplate": "https://montaic.com/search?q={search_term_string}"
  },
  "query-input": "required name=search_term_string"
}
```

---

## Validation

After you paste and deploy:

1. Open Montaic in a fresh incognito window
2. View source and confirm the `<script type="application/ld+json">` block is in the `<head>`
3. Copy the block content
4. Paste into [Google Rich Results Test](https://search.google.com/test/rich-results)
5. Should return "Valid" with Organization + WebSite detected
6. Also test with [Schema.org Validator](https://validator.schema.org/)

If the validator shows warnings (e.g., missing `width` on logo, missing `alternateName`, etc.) — fix before moving on. Warnings aren't fatal but the cleaner the schema, the better the citation behavior.

---

## Why this specific structure

Every decision in the schema above is deliberate:

- **`@graph` with `@id` references** — lets per-page schemas (SoftwareApplication, BreadcrumbList, Article) reference the root Organization via `{"@id": "https://montaic.com/#organization"}`. This creates a connected entity graph AI engines can traverse instead of hopping between disconnected schema islands.

- **`alternateName: "Montaic AI"`** — explicitly tells Google "Montaic" and "Montaic AI" are the same entity. Combined with the brand building in A10, this is how we force Google to stop fuzzy-matching to "Monti."

- **`knowsAbout` array** — an underused schema field that tells AI engines what subjects this entity is an authority on. When someone asks ChatGPT "what's the best AI tool for Fair Housing compliance in real estate listings," the model has a direct signal that Montaic claims expertise on that exact topic.

- **`founder` as a full Person subgraph** — lets blog post Article schemas reference the founder as the author via `{"@id": "https://montaic.com/#founder"}` instead of duplicating the person definition on every post. Trains Google to associate Lance's name with the brand.

- **`sameAs` as the entity anchor list** — this is the single most important AEO signal. Every `sameAs` link is telling AI engines "this is the same entity as the thing at that URL." The more entity databases Montaic is listed in (Wikidata, Crunchbase, LinkedIn, G2, Capterra, Product Hunt), the more confidently AI engines can identify Montaic as a specific, real thing.

---

## Effort estimate

- Paste and commit: 5 min
- Create the 512×512 logo file: 15 min (or use existing if you have one)
- Update `description` and `knowsAbout` to your voice: 5 min
- Deploy: 1 min (it's just a static code change)
- Validate: 5 min

**Total: ~30 minutes.**

**This single change, deployed today, will start changing how ChatGPT and Perplexity describe Montaic within 4-6 weeks as the crawlers revisit the site and AI engines re-index entity data.**
