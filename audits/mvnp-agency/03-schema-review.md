```markdown
# Schema Review — MVNP

**Auditor:** Never Ranked
**Sample date:** 2026-05-08
**Focus:** JSON-LD structured data coverage, consistency, and AEO optimization

---

## Summary

MVNP has basic schema installed (WebSite and Organization on the homepage, WebPage on interior pages) but is missing the mid-tier structured data that helps AI engines understand what the agency does and cite specific services. No BreadcrumbList detected across 9 sampled pages, which means Google will not show rich breadcrumb trails in search results. No FAQPage or Service schemas, so when Perplexity or ChatGPT is asked "What does MVNP do?" or "best Hawaii advertising agency," there is no machine-readable service catalog to cite. The testimonial text detected on every page is not wrapped in Review schema, so it contributes nothing to social proof signals in AI answer engines.

**Schema grade: C** (foundation present, but missing the types that compete in 2026 search and AI citation environments)

---

## What exists today

| Page type | FAQPage | Service | Article | Organization | BreadcrumbList | HowTo | Review |
|---|---|---|---|---|---|---|---|
| Homepage | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Newsletter Archives (2020, 2023, 2024, 2025) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Capabilities | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Careers | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| About (1972) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| ADDY Awards | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Findings

### 1. Tell Google and AI engines which services you actually offer ⚠ HIGH

Right now, the Organization schema on your homepage says "we are MVNP, an agency in Honolulu," but it does not machine-list the specific services you provide. When ChatGPT or Perplexity is asked "best Hawaii agency for public relations" or "advertising firm Honolulu services," they have no structured inventory to cite. Competitors who publish Service schema get named. You get skipped. This is the single highest ROI schema addition for a B2B service firm.

#### Where to add it

Your site appears to be WordPress-based (inferred from Yoast meta patterns and typical WP URL structure). Add Service schema to your homepage and to your Capabilities page.

- **WordPress (Yoast or Rank Math):** These plugins do not auto-generate Service schema. You will need to paste the JSON-LD block below into the site-wide header (Appearance → Theme Editor → header.php before `</head>`) or use a plugin like WPCode to inject it sitewide.
- **Squarespace:** Settings → Advanced → Code Injection → Header. Paste the JSON-LD wrapped in `<script type="application/ld+json">` tags.
- **Webflow:** Project Settings → Custom Code → Head Code. Paste wrapped in script tags.
- **Wix:** SEO Tools → Structured Data → Add Schema → paste as JSON-LD.
- **Custom-coded:** Paste the block below into your `<head>` on every page, or into a sitewide layout partial.

#### Ready-to-paste code

```json
{
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "@id": "https://www.mvnp.com/#organization",
  "name": "MVNP",
  "url": "https://www.mvnp.com",
  "logo": "https://www.mvnp.com/wp-content/uploads/mvnp-logo.png",
  "description": "Fully-integrated Hawaii advertising agency and public relations firm based in Honolulu specializing in innovative marketing and media.",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Honolulu",
    "addressRegion": "HI",
    "addressCountry": "US"
  },
  "areaServed": {
    "@type": "State",
    "name": "Hawaii"
  },
  "hasOfferCatalog": {
    "@type": "OfferCatalog",
    "name": "MVNP Services",
    "itemListElement": [
      {
        "@type": "Offer",
        "itemOffered": {
          "@type": "Service",
          "name": "Advertising",
          "description": "Full-service advertising campaign development and execution."
        }
      },
      {
        "@type": "Offer",
        "itemOffered": {
          "@type": "Service",
          "name": "Public Relations",
          "description": "Strategic PR planning, media relations, and reputation management."
        }
      },
      {
        "@type": "Offer",
        "itemOffered": {
          "@type": "Service",
          "name": "Media Planning and Buying",
          "description": "Data-driven media strategy and placement across all channels."
        }
      },
      {
        "@type": "Offer",
        "itemOffered": {
          "@type": "Service",
          "name": "Marketing Strategy",
          "description": "Integrated marketing planning and execution."
        }
      },
      {
        "@type": "Offer",
        "itemOffered": {
          "@type": "Service",
          "name": "Creative Services",
          "description": "Brand development, design, copywriting, and content production."
        }
      }
    ]
  }
}
```

**Why this specific structure:** We use `ProfessionalService` as the @type because MVNP is a B2B agency, not a LocalBusiness (you serve clients statewide, not walk-in customers). The `hasOfferCatalog` property is the machine-readable service list. Each `itemOffered` is a distinct Service entity that AI engines can cite when answering "what does MVNP offer?" You will want to refine the service names and descriptions to match your actual capabilities page. The `@id` property creates a canonical identifier for your organization that other schemas (like BreadcrumbList) can reference.

---

### 2. Add breadcrumb trails so Google shows navigation paths in search results ⚠ HIGH

Right now, none of the 9 sampled pages include BreadcrumbList schema. This means when your pages appear in Google search results, they show flat URLs instead of rich breadcrumb trails like "MVNP > Capabilities" or "MVNP > About > 1972." Breadcrumbs increase click-through rate by 15-30% (Google's own research) because they show hierarchy and context. AI engines also use breadcrumbs to understand your site structure and category taxonomy.

#### Where to add it

BreadcrumbList should appear on every page except the homepage. It reflects your site navigation hierarchy.

- **WordPress (Yoast SEO):** SEO → Search Appearance → Breadcrumbs → Enable. Yoast will auto-generate the schema. Confirm it appears in page source.
- **WordPress (Rank Math):** General Settings → Breadcrumbs → Enable. Auto-generates the schema.
- **Squarespace:** Squarespace does not auto-generate BreadcrumbList. You will need to paste the JSON-LD block below into each page's Advanced settings → Page Header Code Injection, or use a sitewide code injection with template logic to vary by page.
- **Webflow:** Page Settings → Custom Code → Inside `<head>` tag. Paste the JSON-LD below, adapting the `itemListElement` array for each page.
- **Wix:** Wix does not auto-generate BreadcrumbList. Add via Marketing & SEO → SEO Tools → Structured Data → Add Schema.
- **Custom-coded:** Use a template variable to dynamically populate the breadcrumb array based on URL path. Paste in page `<head>`.

#### Ready-to-paste code (example for /capabilities/ page)

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://www.mvnp.com/"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Capabilities",
      "item": "https://www.mvnp.com/capabilities/"
    }
  ]
}
```

**Why this specific structure:** Each `ListItem` represents one step in the breadcrumb trail. `position` must increment sequentially. `item` is the full URL of that level. The last item in the list (the current page) should still include the `item` property (Google prefers this, even though some validators allow omission). For deeper pages like `/about/1971-2/`, you would add a third ListItem for "About" at position 2, then "1972" at position 3. Generate this dynamically if possible so you do not have to hand-edit every page.

---

### 3. Wrap client testimonials in Review schema so AI engines can cite your social proof ⚠ MEDIUM

Our scan detected testimonial text on every sampled page, but none of it is wrapped in Review or Testimonial schema. Right now, when an AI engine is asked "Is MVNP good?" or "MVNP reviews," it cannot surface your client quotes because they are not machine-readable. Competitors who publish Review schema get cited with star ratings and client names in AI answers. You do not.

#### Where to add it

If your testimonials live in a dedicated section (like a homepage testimonial carousel or a separate testimonials page), add Review schema inline on those pages. If they are sitewide (footer or sidebar), add it once in a sitewide schema block.

- **WordPress:** Use a plugin like Schema Pro or WP Review Pro to add Review schema, or paste the JSON-LD block below into the page/post where the testimonial appears.
- **Squarespace:** Page Settings → Advanced → Page Header Code Injection (for per-page testimonials). For sitewide, Settings → Advanced → Code Injection → Header.
- **Webflow:** Add an Embed element where the testimonial appears, paste the JSON-LD inside `<script type="application/ld+json">` tags.
- **Wix:** Add an HTML iframe or custom code element with the JSON-LD.
- **Custom-coded:** Wrap each testimonial in its own Review schema block, or use an array of Review entities in a single JSON-LD block if multiple testimonials appear on one page.

#### Ready-to-paste code (single review example)

```json
{
  "@context": "https://schema.org",
  "@type": "Review",
  "itemReviewed": {
    "@type": "ProfessionalService",
    "@id": "https://www.mvnp.com/#organization"
  },
  "author": {
    "@type": "Person",
    "name": "Client Name Here"
  },
  "reviewBody": "Paste the full testimonial quote here. Example: MVNP transformed our brand and delivered results beyond our expectations. Their team is professional, creative, and deeply strategic.",
  "reviewRating": {
    "@type": "Rating",
    "ratingValue": "5",
    "bestRating": "5"
  }
}
```

**Why this specific structure:** The `itemReviewed` property links this review back to your organization using the `@id` reference from the Service schema above. This creates a schema graph (all entities connected). `author` should be the actual client or reviewer name. If you do not have an explicit star rating, you can omit `reviewRating`, but including it gives AI engines a quantitative signal. If you have multiple testimonials, wrap them in an array or publish one Review block per testimonial on the page.

---

### 4. Add FAQPage schema to your capabilities and service pages ⚠ MEDIUM

AI engines like Perplexly, ChatGPT, and Google's AI Overviews preferentially cite sites with FAQPage schema when answering question queries ("How does MVNP approach media buying?" or "What industries does MVNP serve?"). Your capabilities page and homepage describe your services, but none of it is structured as Q&A. That means when a buyer asks a question, you will not be cited even if your page has the answer.

#### Where to add it

Identify 4 to 6 common questions prospects ask (you likely already know these from sales calls). Add them to your capabilities page or a dedicated FAQ section, then wrap them in FAQPage schema.

- **WordPress (Yoast or Rank Math):** These plugins do not auto-generate FAQPage. Use a plugin like Schema Pro, or paste the JSON-LD block below into the page where your FAQs appear.
- **Squarespace:** Add the FAQ content to a page, then paste the JSON-LD into Page Settings → Advanced → Page Header Code Injection.
- **Webflow:** Add an Embed element at the bottom of the page, paste the JSON-LD inside script tags.
- **Wix:** SEO Tools → Structured Data → Add Schema → paste JSON-LD.
- **Custom-coded:** Paste the JSON-LD block into the `<head>` or at the end of `<body>` on the FAQ page.

#### Ready-to-paste code (example with 3 questions)

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What services does MVNP offer?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "MVNP is a fully-integrated advertising agency and public relations firm. We provide advertising, public relations, media planning and buying, marketing strategy, creative services, digital marketing, and social media management. Our team specializes in campaigns tailored to Hawaii markets and beyond."
      }
    },
    {
      "@type": "Question",
      "name": "Where is MVNP located?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "MVNP is based in Honolulu, Hawaii. We serve clients throughout the Hawaiian Islands and work with national and international brands seeking to reach Hawaii audiences."
      }
    },
    {
      "@type": "Question",
      "name": "What industries does MVNP specialize in?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "MVNP has deep expertise in tourism, hospitality, healthcare, real estate, government, nonprofit, and consumer brands. Our 50+ years in Hawaii give us unique insights into local culture, audiences, and media landscapes."
      }
    }
  ]
}
```

**Why this specific structure:** Each `Question` must include a `name` (the question text) and an `acceptedAnswer` with an `Answer` entity containing the `text` of your answer. The answer should be 1 to 3 sentences, written in the same voice you would use if answering a prospect email. Google displays FAQPage results as expandable dropdowns in search, and AI engines cite the answer text verbatim when responding to question queries. Add as many Question entities as you have real FAQs. Do not fabricate questions just to game the system. Google penalizes that.

---

### 5. Fix the H1 structure on 8 of 9 pages ⚠ MEDIUM

8 of the 9 sampled pages have no H1 tag at all. The homepage has 4 H1 tags (which is also non-standard). H1 is the primary semantic heading that tells search engines and screen readers what the page is about. Pages without an H1 force Google to guess your topic from other signals. Pages with multiple H1s dilute topical focus. This is not a schema issue, but it directly affects how well your schema-enhanced pages rank.