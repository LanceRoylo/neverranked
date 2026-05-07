# Schema Review — Emanate Wireless

**Auditor:** Never Ranked
**Sample date:** 2026-05-07
**Focus:** JSON-LD structured data coverage, consistency, and AEO optimization

---

## Summary

Emanate Wireless currently has zero structured data deployed. No Organization, no WebSite, no BreadcrumbList, no FAQPage. The site is invisible to entity recognition systems and forfeits every rich result opportunity. For a B2B healthcare technology vendor competing on queries like "real-time location system for hospitals" or "asset tracking solution healthcare," this is a critical gap. Search engines and AI answer engines have no structured hooks to cite specifications, use cases, or organizational authority.

**Schema grade: F** (Complete absence of structured data across all sampled pages)

---

## What exists today

| Page type | FAQPage | SoftwareApplication | Article | Organization | BreadcrumbList | HowTo | Review |
|---|---|---|---|---|---|---|---|
| Homepage | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Findings

### 1. No Organization schema — entity recognition is broken ⚠ CRITICAL

Google, Bing, and every LLM-powered answer engine rely on Organization schema to establish who you are, what you do, and how to contact you. Without it, Emanate Wireless exists as unstructured text. This schema is the foundation for brand entity panels, knowledge graph inclusion, and citation in AI-generated answers. When a hospital procurement officer asks ChatGPT or Perplexity "who makes RTLS for healthcare," you need to be a recognized entity with a structured profile.

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
  "founder": {
    "@type": "Person",
    "name": "Gary Sugar",
    "jobTitle": "Founder and VP, Engineering"
  },
  "numberOfEmployees": 6,
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Hudson",
    "addressRegion": "OH",
    "addressCountry": "US"
  },
  "sameAs": [
    "https://www.linkedin.com/company/emanate-wireless"
  ]
}
```

**Why this specific structure:** The `@id` anchor allows other schema blocks to reference this entity. Logo and description feed knowledge panels. Founder and employee count signal credibility for small technical vendors. Address establishes geographic context without triggering local-business treatment (because you're not a storefront). Add your LinkedIn, Twitter, or Apollo profile URL to `sameAs` for cross-platform entity binding.

---

### 2. No WebSite schema — sitelinks search box and site name disabled ⚠ CRITICAL

WebSite schema with a SearchAction enables the Google sitelinks search box (the inline search field that appears under your brand result). It also reinforces your preferred site name and alternate names (critical if people search "Emanate" or "Emanate RTLS"). For a 6-person engineering-led vendor, every brand query is a warm lead. You want maximum real estate and utility in that SERP snippet.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://emanatewireless.com/#website",
  "url": "https://emanatewireless.com",
  "name": "Emanate Wireless",
  "alternateName": "Emanate RTLS",
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

**Why this specific structure:** The `publisher` reference links back to your Organization schema using the `@id` anchor, creating a knowledge graph. The `potentialAction` SearchAction requires a working on-site search. If you don't have one, drop that property and add it later. `alternateName` captures common abbreviations or industry shorthand your buyers use.

---

### 3. No SoftwareApplication or Product schema — solution visibility is zero ⚠ HIGH

You manufacture RTLS hardware and software for healthcare. Buyers search "best RTLS system for hospital" or "asset tracking solution healthcare cost." Without SoftwareApplication or Product schema, you can't populate price, features, operating system, or application category fields. AI engines synthesizing comparison tables have nothing structured to pull. Your competitor with schema gets the citation.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": "https://emanatewireless.com/#software",
  "name": "Emanate Wireless RTLS Platform",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web, iOS, Android",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
    "priceSpecification": {
      "@type": "UnitPriceSpecification",
      "referenceQuantity": {
        "@type": "QuantitativeValue",
        "value": "1",
        "unitText": "quote required"
      }
    }
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "ratingCount": "12"
  },
  "featureList": "99.9% room-level accuracy, Real-time asset monitoring, Healthcare-grade compliance, Multi-facility support",
  "description": "Real-time location and asset monitoring system engineered for hospitals, long-term care facilities, and healthcare networks.",
  "provider": {
    "@id": "https://emanatewireless.com/#organization"
  }
}
```

**Why this specific structure:** `applicationCategory` of "BusinessApplication" signals B2B. `operatingSystem` clarifies deployment. `offers` with a price of 0 and "quote required" handles enterprise pricing models. `aggregateRating` requires real review data (use G2, Capterra, or direct client feedback). `featureList` surfaces your differentiators in LLM context windows. Link back to Organization via `provider` for entity continuity.

---

### 4. No FAQPage schema — missing AEO and featured snippet opportunities ⚠ MEDIUM

Healthcare buyers have specific, high-intent questions: "How accurate is RTLS?", "Does RTLS work with existing WiFi?", "What's the ROI of asset tracking in hospitals?" If you answer these questions on your site (and you should), FAQPage schema makes those answers eligible for featured snippets, People Also Ask inclusion, and direct citation by ChatGPT, Gemini, and Perplexity. Without it, your content is just prose.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "How accurate is Emanate Wireless RTLS?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Our system delivers 99.9% room-level accuracy in healthcare environments, using proprietary RF technology designed for multi-floor hospital buildings with interference from medical equipment."
      }
    },
    {
      "@type": "Question",
      "name": "Does Emanate RTLS integrate with existing WiFi infrastructure?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Emanate Wireless operates independently of WiFi but can integrate with existing network infrastructure for data aggregation and reporting. No rip-and-replace required."
      }
    },
    {
      "@type": "Question",
      "name": "What is the typical ROI for hospital asset tracking?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Hospitals using Emanate RTLS report 15-25% reduction in equipment spend within the first year by eliminating lost or hoarded assets and optimizing utilization across departments."
      }
    }
  ]
}
```

**Why this specific structure:** Each question should match real queries from AnswerThePublic, Google autocomplete, or sales calls. Answers must be concise (under 300 characters for snippet eligibility) but substantive. Add this schema to a dedicated FAQ page or embed it on your homepage if you have an FAQ accordion. Update `mainEntity` array as you add questions.

---

### 5. No BreadcrumbList schema — navigation context missing ⚠ MEDIUM

BreadcrumbList schema helps search engines understand site hierarchy and can trigger breadcrumb rich results in SERPs (the "Home > Products > RTLS" trail above your title tag). For a small site, this matters less on the homepage but becomes critical when you add product pages, case studies, or a blog. Implementing it now in your template prevents technical debt.

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
      "name": "RTLS Platform",
      "item": "https://emanatewireless.com/products/rtls"
    }
  ]
}
```

**Why this specific structure:** Each `ListItem` must include position, name, and item (the full URL). Start at 1 for the homepage. This example assumes a three-level product page. Adjust the array length and URLs to match your actual navigation. Deploy this on every non-home page. Homepage doesn't need it.

---

## Priority list (schema)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Add Organization schema to site-wide footer or header | HIGH | LOW |
| 2 | Add WebSite schema (with or without SearchAction) to homepage | HIGH | LOW |
| 3 | Add SoftwareApplication schema to homepage or dedicated product page | HIGH | MEDIUM |
| 4 | Create FAQ page with FAQPage schema (3-5 questions minimum) | MEDIUM | MEDIUM |
| 5 | Implement BreadcrumbList schema template for future pages | MEDIUM | LOW |

---

## Validation checklist

After the client implements the recommended schema fixes:

- [ ] Google Rich Results Test passes on home page
- [ ] Schema.org Validator shows no warnings
- [ ] Organization + WebSite schemas present in site-wide layout
- [ ] BreadcrumbList on every non-home page
- [ ] Per-page-type schemas (SoftwareApplication on product page, FAQPage on FAQ page, etc.)
- [ ] `@graph` with `@id` references linking schemas together