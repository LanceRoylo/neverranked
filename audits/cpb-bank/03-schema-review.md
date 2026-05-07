# Schema Review — Central Pacific Bank

**Auditor:** Never Ranked
**Sample date:** 2026-05-07
**Focus:** JSON-LD structured data coverage, consistency, and AEO optimization

---

## Summary

Central Pacific Bank's homepage carries zero JSON-LD schema. No Organization markup, no WebSite SearchAction, no BreadcrumbList, no structured data of any kind. For a financial institution competing in local and mobile search, this is a complete blind spot. Google and AI engines see plain HTML with no entity signals, no sitelinks search box eligibility, and no way to surface structured answers about services, locations, or offerings.

**Schema grade: F** (Zero schema objects detected across the sampled page)

---

## What exists today

| Page type | FAQPage | FinancialService | Article | Organization | BreadcrumbList | HowTo | AggregateRating |
|---|---|---|---|---|---|---|---|
| Homepage | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Findings

### 1. Missing Organization schema ⚠ CRITICAL

Central Pacific Bank has no Organization schema on the homepage (or anywhere else we sampled). This means Google and Bing cannot confidently link the domain to the brand entity. No logo in knowledge panels, no entity-level association with social profiles, no clear signal that cpb.bank is the authoritative source for Central Pacific Bank. For a bank, this is table stakes. Every competitor with Organization markup gets a head start in local packs, branded queries, and AI citations.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "BankOrCreditUnion",
  "@id": "https://cpb.bank/#organization",
  "name": "Central Pacific Bank",
  "url": "https://cpb.bank",
  "logo": "https://cpb.bank/logo.png",
  "image": "https://cpb.bank/og-image.jpg",
  "description": "Central Pacific Bank provides personal and business banking, loans, and financial services across Hawaii.",
  "sameAs": [
    "https://www.facebook.com/CentralPacificBank",
    "https://www.linkedin.com/company/central-pacific-bank",
    "https://twitter.com/CPBHawaii"
  ],
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "220 South King Street",
    "addressLocality": "Honolulu",
    "addressRegion": "HI",
    "postalCode": "96813",
    "addressCountry": "US"
  },
  "telephone": "+1-808-544-0500",
  "areaServed": {
    "@type": "State",
    "name": "Hawaii"
  }
}
```

**Why this specific structure:** We use `BankOrCreditUnion` (a subtype of FinancialService) to give Google the most precise entity type. The `@id` property creates a reusable entity anchor that other schemas (WebSite, BreadcrumbList) can reference. `sameAs` links to social profiles strengthen entity confidence. `areaServed` signals geographic footprint. Replace the placeholder values (logo URL, address, social links) with real data from the site footer or about page.

---

### 2. Missing WebSite schema with SearchAction ⚠ CRITICAL

No WebSite schema means the domain forfeits eligibility for the Google sitelinks search box (the inline search field that appears under some branded results). For a bank with dozens of services, branch locations, and product pages, that's a massive navigational shortcut lost. Bing and AI engines also rely on SearchAction to understand the site's internal search endpoint.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://cpb.bank/#website",
  "url": "https://cpb.bank",
  "name": "Central Pacific Bank",
  "publisher": {
    "@id": "https://cpb.bank/#organization"
  },
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://cpb.bank/search?q={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
}
```

**Why this specific structure:** The `publisher` property references the Organization schema via `@id`, linking the two entities in a graph. The `SearchAction` object tells Google how to construct a search query on your site. Update the `urlTemplate` to match your actual search results URL pattern (inspect the form action on your site search box). If you don't have site search, remove `potentialAction` until you do, but keep the WebSite schema.

---

### 3. Missing BreadcrumbList schema ⚠ HIGH

No BreadcrumbList schema means you lose rich result breadcrumbs in SERPs. Instead of "cpb.bank › Personal Banking › Checking" appearing in the snippet, users see a flat URL. Breadcrumbs improve click-through by showing information architecture at a glance. For a bank with nested service categories (personal, business, loans, etc.), this is a missed opportunity every time a non-home page ranks.

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
      "item": "https://cpb.bank"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Personal Banking",
      "item": "https://cpb.bank/personal"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "Checking Accounts",
      "item": "https://cpb.bank/personal/checking"
    }
  ]
}
```

**Why this specific structure:** Each `ListItem` represents one crumb in the path. `position` must increment sequentially. The final item should match the current page URL. This example is for a hypothetical Checking page. Deploy this schema on every non-home page, dynamically populating `itemListElement` based on the URL path or CMS breadcrumb component.

---

### 4. Missing FAQPage schema ⚠ MEDIUM

The homepage includes no FAQ section or structured Q&A, but for a bank, common questions ("What are your routing numbers?" "How do I open an account online?") are high-value queries. FAQPage schema can surface these directly in Google's rich results and power concise AI answers in SGE, ChatGPT, and Perplexity. Even if there's no dedicated FAQ page today, adding one and marking it up unlocks a new SERP real estate opportunity.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is Central Pacific Bank's routing number?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Central Pacific Bank's routing number is 121301028. This number is used for direct deposits, wire transfers, and ACH transactions."
      }
    },
    {
      "@type": "Question",
      "name": "How do I open a checking account online?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "You can open a checking account online by visiting our application page, providing your personal information, and funding your account with an initial deposit. The process takes about 10 minutes."
      }
    },
    {
      "@type": "Question",
      "name": "What are Central Pacific Bank's branch hours?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Most branches are open Monday through Friday, 9:00 AM to 5:00 PM, and Saturday 9:00 AM to 1:00 PM. Hours may vary by location. Use our branch locator to confirm specific hours."
      }
    }
  ]
}
```

**Why this specific structure:** Each question lives inside `mainEntity` as a `Question` object with an `acceptedAnswer`. Google requires at least two questions for rich result eligibility. Use real customer questions from support tickets or search console queries. Deploy on a dedicated FAQ page or the homepage if the content exists inline.

---

### 5. Missing AggregateRating or Review schema ⚠ MEDIUM

We found no AggregateRating or Review markup. If Central Pacific Bank has customer reviews on third-party sites (Google, Trustpilot, etc.) or testimonials on the site, surfacing an aggregate rating builds trust in search snippets and gives AI engines a "social proof hook" to cite in answers. For financial services, trust signals are conversion drivers.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "BankOrCreditUnion",
  "@id": "https://cpb.bank/#organization",
  "name": "Central Pacific Bank",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.3",
    "reviewCount": "487",
    "bestRating": "5",
    "worstRating": "1"
  }
}
```

**Why this specific structure:** Nest `aggregateRating` inside the existing Organization schema (merge with Finding #1). `ratingValue` must reflect actual review data (pull from Google Business Profile or aggregate multiple sources). Never fabricate ratings. Google can penalize or suppress snippets if ratings don't match reality. If you don't have 30+ reviews, skip this until you do.

---

## Priority list (schema)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Add Organization schema (BankOrCreditUnion) to site-wide header | HIGH | LOW |
| 2 | Add WebSite schema with SearchAction to site-wide header | HIGH | LOW |
| 3 | Add BreadcrumbList schema to all non-home pages | HIGH | MED |
| 4 | Create FAQ page and add FAQPage schema | MED | MED |
| 5 | Add AggregateRating to Organization schema (if 30+ reviews exist) | MED | LOW |

---

## Validation checklist

After the client implements the recommended schema fixes:

- [ ] Google Rich Results Test passes on home page
- [ ] Schema.org Validator shows no warnings
- [ ] Organization + WebSite schemas present in site-wide layout
- [ ] BreadcrumbList on every non-home page
- [ ] Per-page-type schemas (FAQPage on FAQ page, FinancialService on product pages)
- [ ] `@graph` with `@id` references linking schemas together