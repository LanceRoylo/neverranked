# Schema Review — Emanate Wireless

**Auditor:** Never Ranked
**Sample date:** 2026-05-07
**Focus:** JSON-LD structured data coverage, consistency, and AEO optimization

---

## Summary

Emanate Wireless has zero structured data deployed. No Organization schema, no WebSite schema, no product or service markup. When AI engines scan the site to answer queries like "best RTLS for healthcare" or "room-level location tracking systems," they find no machine-readable facts to cite. The homepage has 159 words and three competing H1 tags. No social preview images, no canonical tags, no schema. Competitors with even basic Organization and Service markup will surface first in Perplexity, ChatGPT, and Google's AI Overviews because those engines have something to parse.

**Schema grade: F** (zero schema blocks detected on the sampled page)

---

## What exists today

| Page type | FAQPage | SoftwareApplication | Article | Organization | BreadcrumbList | HowTo | Review |
|---|---|---|---|---|---|---|---|
| Homepage | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Findings

### 1. Tell Google and AI engines who you are ⚠ CRITICAL

Right now, when ChatGPT or Perplexity is asked about real-time location systems for healthcare, they have no structured way to know your name, location, or what you manufacture. They cite competitors who publish Organization schema. This is the single most important piece of structured data for a B2B vendor. It establishes entity identity and makes your brand a referenceable fact in knowledge graphs.

**Where to add it:**

We can't infer your CMS from the scan, so here are the four most common paths:

- **WordPress:** If you use Yoast, Rank Math, or SEOPress, go to SEO → General → Knowledge Graph (or Schema). Set organization type to "Corporation" or "Organization," add your logo URL, and confirm it's enabled sitewide.
- **Squarespace:** Settings → Business Information. Fill in company name, address, and phone. Squarespace auto-generates Organization schema from these fields.
- **Webflow:** Project Settings → SEO → Sitewide Schema. Paste the JSON-LD block below into the <head> code injection.
- **Wix:** SEO Tools → Structured Data Markup. Add the JSON-LD block below as a custom code element in the site header.
- **Custom-coded:** Paste the JSON-LD block below into the <head> of your sitewide template (so it appears on every page).

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://emanatewireless.com/#organization",
  "name": "Emanate Wireless, Inc.",
  "url": "https://emanatewireless.com",
  "logo": "https://emanatewireless.com/logo.png",
  "description": "Emanate Wireless invents, engineers and manufactures real-time location and asset monitoring solutions for the healthcare industry.",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Hudson",
    "addressRegion": "OH",
    "addressCountry": "US"
  },
  "foundingDate": "YYYY",
  "numberOfEmployees": {
    "@type": "QuantitativeValue",
    "value": 6
  },
  "slogan": "99.9% room level accuracy",
  "knowsAbout": [
    "Real-time location systems (RTLS)",
    "Healthcare asset tracking",
    "Room-level location accuracy",
    "Healthcare IoT"
  ]
}
```

**Why this specific structure:** The `@id` property creates a stable URI that other schema blocks (like Product or Service) can reference. Replace `"logo"` with your actual logo URL. Replace `"foundingDate"` with your actual year. The `knowsAbout` array helps AI engines understand your domain expertise when they parse category-level queries. This block should live in the sitewide <head> so every page inherits it.

---

### 2. Enable search-box rich results in Google ⚠ HIGH

Add WebSite schema with a SearchAction property so Google can display a search box directly in your organic listing. Right now your SERP entry is text only. Competitors with this markup get a functional search field in the result, which increases click-through rate and signals to Google that you have a real site architecture (not a single landing page).

**Where to add it:**

Use the same platform paths as Finding #1. WebSite schema goes in the sitewide <head>, right alongside Organization schema.

- **WordPress (Yoast/Rank Math):** Usually auto-generated. Check SEO → General → Schema to confirm WebSite type is enabled.
- **Squarespace:** Auto-generated if you have a search page enabled. Verify in Settings → Search & Indexing.
- **Webflow / Wix / Custom:** Paste the JSON-LD block below into sitewide <head> code.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://emanatewireless.com/#website",
  "url": "https://emanatewireless.com",
  "name": "Emanate Wireless",
  "description": "Real-time location and asset monitoring solutions for healthcare",
  "publisher": {
    "@id": "https://emanatewireless.com/#organization"
  },
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://emanatewireless.com/search?q={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
}
```

**Why this specific structure:** The `publisher` property links back to the Organization schema via `@id`, creating a knowledge graph chain. Replace the `urlTemplate` value with your actual search URL pattern. If you don't have an on-site search feature, remove the `potentialAction` block entirely and just deploy the base WebSite schema (name, url, description, publisher).

---

### 3. Mark up your RTLS product or service offering ⚠ HIGH

You manufacture and sell a real-time location system. Right now there's no Product or Service schema telling search engines or AI what you sell, what problem it solves, or who it's for. When a buyer searches "RTLS for hospital asset tracking" or asks ChatGPT for vendor options, you're invisible in structured results because competitors publish Product or Service schema with `category`, `audience`, and `featureList` properties.

**Where to add it:**

This schema block should live on your homepage and on any product or solutions pages. Use the same CMS paths as Finding #1, but apply this to individual page templates (not sitewide).

- **WordPress:** Add per-page JSON-LD using a plugin like Schema Pro, or paste into the page's custom code block.
- **Squarespace / Webflow / Wix:** Use page-level code injection or a custom code block in the page builder.
- **Custom-coded:** Paste into the <head> of your homepage and product pages.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "@id": "https://emanatewireless.com/#rtls-product",
  "name": "Emanate Wireless RTLS",
  "description": "Real-time location and asset monitoring system with 99.9% room-level accuracy for healthcare facilities",
  "brand": {
    "@id": "https://emanatewireless.com/#organization"
  },
  "category": "Real-Time Location System (RTLS)",
  "audience": {
    "@type": "Audience",
    "audienceType": "Healthcare facilities, hospitals, medical device manufacturers"
  },
  "featureList": [
    "99.9% room-level location accuracy",
    "Real-time asset tracking",
    "Healthcare-specific monitoring",
    "Inventory and equipment management"
  ],
  "applicationCategory": "Healthcare IoT",
  "operatingSystem": "Hardware + Software"
}
```

**Why this specific structure:** We're using `Product` instead of `Service` because you manufacture hardware. If your offering is a service (installation, monitoring as a service), change `@type` to `"Service"` and replace `featureList` with `serviceType`. The `brand` property links back to Organization schema via `@id`. The `audience` and `category` fields help AI engines match your product to buyer queries. Add `offers` (with `price` and `priceCurrency`) if you list pricing publicly.

---

### 4. Add breadcrumb schema for navigation clarity ⚠ MEDIUM

Once you have multiple pages (products, solutions, case studies, about), add BreadcrumbList schema to every non-homepage page. This tells Google and AI engines how your site is organized and can trigger breadcrumb rich results in the SERP. It also helps AI cite specific pages instead of dumping all queries to your homepage.

**Where to add it:**

This is a per-page schema type. Most modern CMSs auto-generate it if you use breadcrumb navigation in your theme.

- **WordPress:** Yoast and Rank Math auto-generate BreadcrumbList if you enable breadcrumbs in the theme. Check SEO → Appearance → Breadcrumbs.
- **Squarespace / Wix:** Not auto-generated. Paste the JSON-LD block below into each page's code injection.
- **Webflow:** Use a dynamic embed block on collection pages, or paste manually.
- **Custom-coded:** Generate dynamically in your page template based on URL path.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://emanatewireless.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Products",
      "item": "https://emanatewireless.com/products"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "RTLS System",
      "item": "https://emanatewireless.com/products/rtls"
    }
  ]
}
```

**Why this specific structure:** Each `ListItem` represents one level of navigation. Adapt the `name` and `item` values to match your actual URL structure. Position numbering must be sequential. This example shows a three-level breadcrumb (Home → Products → RTLS). For a two-level page, remove the third `ListItem`. For deeper nesting, add more items with incremented `position` values.

---

### 5. Publish an FAQ page with FAQPage schema ⚠ MEDIUM

Buyers researching RTLS systems ask predictable questions: "What's the difference between WiFi and UWB location tracking?" "How accurate is room-level tracking?" "Does it work with existing hospital infrastructure?" If you publish an FAQ page and mark it up with FAQPage schema, Google can show your answers directly in rich results and AI engines can cite your content as the source when those questions are asked.

**Where to add it:**

Create an FAQ page (or add an FAQ section to your homepage). Then add FAQPage schema to that page.

- **WordPress:** Use the FAQ block in Yoast or a dedicated FAQ plugin. Most auto-generate the schema.
- **Squarespace / Wix:** Add an FAQ section using built-in blocks. Enable schema in the block settings (if available), or paste the JSON-LD below.
- **Webflow / Custom:** Paste the JSON-LD block below into the page's <head>.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is room-level accuracy in RTLS?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Room-level accuracy means the system can pinpoint an asset's location to a specific room (not just a floor or building), with 99.9% reliability. This is critical for healthcare facilities tracking high-value equipment or patient flow."
      }
    },
    {
      "@type": "Question",
      "name": "Does Emanate Wireless RTLS integrate with existing hospital infrastructure?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Our system is designed to work alongside existing WiFi, IoT, and facility management platforms without requiring a full infrastructure overhaul."
      }
    },
    {
      "@type": "Question",
      "name": "What types of assets can be tracked?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Medical equipment (IV pumps, wheelchairs, defibrillators), staff badges, patient wristbands, and high-value inventory. Any asset with a tag can be tracked in real time."
      }
    }
  ]
}
```

**Why this specific structure:** Each question-answer pair is a `Question` entity inside the `mainEntity` array. Write answers in full sentences (not bullets or fragments) because AI engines quote the `text` field verbatim. Add as many Q&A pairs as you have. This schema is page-specific, so it only goes on the FAQ page, not sitewide.

---

## Priority list (schema)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Add Organization schema (sitewide) | HIGH | LOW |
| 2 | Add WebSite schema with SearchAction (sitewide) | HIGH | LOW |
| 3 | Add Product schema for RTLS offering (homepage + product pages) | HIGH | MEDIUM |
| 4 | Create and mark up FAQ page with FAQPage schema | MEDIUM | MEDIUM |
| 5 | Add BreadcrumbList schema to all non-home pages | MEDIUM | LOW |

---

## Validation checklist

After the client implements the recommended schema fixes:

- [ ] Google Rich Results Test passes on home page
- [ ] Schema.org Validator shows no warnings
- [ ] Organization + WebSite schemas present in site-wide layout
- [ ] BreadcrumbList on every non-home page
- [ ] Per-page-type schemas (Product on homepage, FAQPage on FAQ page)
- [ ] `@graph` with `@id` references linking schemas together