# Schema Review — Drake Real Estate Partners

**Auditor:** Never Ranked
**Sample date:** 2026-05-07
**Focus:** JSON-LD structured data coverage, consistency, and AEO optimization

---

## Summary

Drake Real Estate Partners has zero schema markup deployed. The homepage carries no Organization schema (critical for entity recognition), no WebSite schema (blocking SearchAction sitelinks), and no structured data of any kind. In financial services, where trust signals and authority are paramount, this leaves LLMs and Google with no structured way to cite credentials, extract facts, or surface the firm in answer engines. We sampled one page and found a completely blank slate.

**Schema grade: F** (No structured data exists. Missing every foundational schema type.)

---

## What exists today

| Page type | FAQPage | SoftwareApplication | Article | Organization | BreadcrumbList | HowTo | Review |
|---|---|---|---|---|---|---|---|
| Homepage | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Findings

### 1. Missing Organization schema ⚠ HIGH

Drake Real Estate Partners has no Organization schema on the homepage. This is the single most important structured data type for a financial services firm. Without it, Google and LLMs cannot reliably connect the brand name, logo, contact information, and social profiles into a single entity. Entity recognition is the foundation of AEO. When Perplexity or ChatGPT scan the site, they see unstructured text with no authoritative metadata to cite. Organization schema also powers the Google Knowledge Panel and rich result eligibility.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://drakerep.com/#organization",
  "name": "Drake Real Estate Partners",
  "url": "https://drakerep.com",
  "logo": "https://drakerep.com/logo.png",
  "description": "Drake Real Estate Partners is a real estate investment firm focused on value-add and opportunistic investments across U.S. markets.",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "New York",
    "addressRegion": "NY",
    "addressCountry": "US"
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "Investor Relations",
    "email": "info@drakerep.com"
  },
  "sameAs": [
    "https://www.linkedin.com/company/drake-real-estate-partners"
  ]
}
```

**Why this specific structure:** We use `@id` to create a reusable entity reference that other schemas can link to. The `logo` field powers Knowledge Panel images. `address` signals geographic focus without triggering LocalBusiness schema (which would be wrong for an investment firm). `contactPoint` provides a structured way for LLMs to extract contact methods. Add real social URLs to `sameAs` to strengthen entity consolidation across the web.

---

### 2. Missing WebSite schema with SearchAction ⚠ HIGH

No WebSite schema means Google cannot display a sitelinks search box in SERPs. More importantly, LLMs scanning the site have no structured signal that this is the canonical homepage or that internal search exists. SearchAction markup tells engines how to query the site programmatically, which can surface in AI-generated answers that link directly to search results pages.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://drakerep.com/#website",
  "url": "https://drakerep.com",
  "name": "Drake Real Estate Partners",
  "publisher": {
    "@id": "https://drakerep.com/#organization"
  },
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://drakerep.com/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

**Why this specific structure:** The `publisher` property references the Organization schema via `@id`, linking the two entities. If the site has no search function, remove `potentialAction` entirely but keep the WebSite schema. The `target` URL should match the actual search endpoint (update `/search?q=` to the real parameter). This schema belongs in the site-wide header or footer so it appears on every page.

---

### 3. Missing BreadcrumbList schema ⚠ MEDIUM

Breadcrumb schema is absent. Once the site adds interior pages (portfolio, team, insights), breadcrumbs provide hierarchical context that helps LLMs understand site architecture and page relationships. Rich result breadcrumbs in Google SERPs also improve click-through rates by showing the page's place in the information hierarchy.

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
      "item": "https://drakerep.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Portfolio",
      "item": "https://drakerep.com/portfolio"
    }
  ]
}
```

**Why this specific structure:** Each `ListItem` represents one breadcrumb level. `position` must be sequential starting at 1. The final item (current page) can omit the `item` property per schema.org guidelines, but we include it for consistency. Generate this dynamically per page. On the homepage, you would only have one item pointing to itself.

---

### 4. No AggregateRating or Review schema ⚠ MEDIUM

The site has no structured reviews or ratings. In financial services, trust is currency. If Drake Real Estate Partners has client testimonials, case study results, or third-party ratings, wrapping them in Review or AggregateRating schema gives LLMs a citation-ready social proof hook. Without it, qualitative praise lives in unstructured text that AI engines are less likely to extract or cite.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://drakerep.com/#organization",
  "name": "Drake Real Estate Partners",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "12",
    "bestRating": "5",
    "worstRating": "1"
  }
}
```

**Why this specific structure:** This nests inside the existing Organization schema (merge with Finding #1). `ratingValue` and `reviewCount` must reflect real data. Google may ignore or penalize fabricated ratings. If the firm has individual client testimonials on the site, mark each one up with a standalone Review schema that references the Organization via `itemReviewed`.

---

### 5. No Service or FinancialService schema ⚠ LOW

Drake Real Estate Partners offers investment services (value-add, opportunistic strategies), but none of that is structured. Service schema (or the more specific FinancialService type) allows each offering to be marked up with `serviceType`, `areaServed`, and `provider`. This helps LLMs answer queries like "real estate investment firms focused on value-add in New York" by matching structured service metadata.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "FinancialService",
  "name": "Value-Add Real Estate Investment",
  "url": "https://drakerep.com/services/value-add",
  "provider": {
    "@id": "https://drakerep.com/#organization"
  },
  "serviceType": "Real Estate Investment",
  "areaServed": {
    "@type": "Country",
    "name": "United States"
  },
  "description": "Opportunistic and value-add real estate investment strategies across U.S. markets."
}
```

**Why this specific structure:** Each service offering should get its own FinancialService block on the relevant service detail page. `provider` links back to the Organization entity. `areaServed` can be Country, State, or City depending on geographic focus. If the firm has separate pages for each strategy (value-add, opportunistic, core-plus), deploy one schema block per page with the specific `name` and `url`.

---

## Priority list (schema)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Add Organization schema to homepage | HIGH | LOW |
| 2 | Add WebSite schema with SearchAction | HIGH | LOW |
| 3 | Add BreadcrumbList to all interior pages | MEDIUM | MEDIUM |
| 4 | Add AggregateRating (if reviews exist) | MEDIUM | LOW |
| 5 | Add FinancialService schema per offering | LOW | MEDIUM |

---

## Validation checklist

After the client implements the recommended schema fixes:

- [ ] Google Rich Results Test passes on home page
- [ ] Schema.org Validator shows no warnings
- [ ] Organization + WebSite schemas present in site-wide layout
- [ ] BreadcrumbList on every non-home page
- [ ] Per-page-type schemas (FinancialService on service pages, Article on insights/blog)
- [ ] `@graph` with `@id` references linking schemas together