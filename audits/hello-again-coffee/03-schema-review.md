# Schema Review — Hello Again Coffee

**Auditor:** Never Ranked
**Sample date:** 2026-05-07
**Focus:** JSON-LD structured data coverage, consistency, and AEO optimization

---

## Summary

Hello Again Coffee has zero structured data across all sampled pages. The homepage carries no Organization, LocalBusiness, or WebSite schema. For a Honolulu coffee shop, this means Google has no entity signal, no address or hours structured for local pack, and no menu or product markup for query answers. Most independent coffee shops in competitive tourist markets deploy at least Organization and LocalBusiness. This site is invisible to entity-based retrieval.

**Schema grade: F** (no JSON-LD present on any sampled page)

---

## What exists today

| Page type | FAQPage | LocalBusiness | Article | Organization | BreadcrumbList | Product | Review |
|---|---|---|---|---|---|---|---|
| Homepage | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Findings

### 1. Missing LocalBusiness schema on homepage ⚠ HIGH

The homepage has no LocalBusiness or CoffeShop schema. Google cannot surface the business in local pack results, show hours or address in knowledge panels, or associate reviews with the entity. For a Honolulu coffee shop competing with dozens of alternatives in tourist and local queries ("coffee near me", "best coffee Honolulu"), this is a critical gap. The meta description mentions "Located in Honolulu, HI" but no machine-readable address, geo coordinates, opening hours, or menu exist.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "CoffeeShop",
  "@id": "https://helloagaincoffee.com/#organization",
  "name": "Hello Again Coffee",
  "url": "https://helloagaincoffee.com",
  "logo": "https://helloagaincoffee.com/logo.png",
  "image": "https://helloagaincoffee.com/storefront.jpg",
  "description": "Afternoon coffee is just as good as morning coffee. At Hello Again Coffee, we're creating ridiculously great moments that stick with you.",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Main Street",
    "addressLocality": "Honolulu",
    "addressRegion": "HI",
    "postalCode": "96813",
    "addressCountry": "US"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "21.3099",
    "longitude": "-157.8581"
  },
  "telephone": "+1-808-555-0100",
  "priceRange": "$$",
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "opens": "07:00",
      "closes": "18:00"
    },
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Saturday", "Sunday"],
      "opens": "08:00",
      "closes": "16:00"
    }
  ],
  "servesCuisine": "Coffee",
  "acceptsReservations": "False"
}
```

**Why this specific structure:** CoffeeShop is a subtype of FoodEstablishment, which signals to Google the business category. The `@id` allows other schemas to reference this entity. `geo` coordinates enable map placement. `openingHoursSpecification` populates hours in knowledge panels and local pack. Replace placeholder address, phone, hours, and image URLs with actual values. If the shop has a menu, add `hasMenu` with a URL or MenuItem array. If reviews exist on Google or Yelp, add `aggregateRating`.

---

### 2. Missing Organization schema for entity recognition ⚠ HIGH

No Organization schema exists, so Google has no canonical entity record for "Hello Again Coffee." This blocks knowledge graph inclusion, entity linking in AI overviews, and brand SERP features. The site has Open Graph tags but no structured identity. Without Organization schema, the business name, logo, social profiles, and founding details remain unstructured text.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://helloagaincoffee.com/#organization",
  "name": "Hello Again Coffee",
  "url": "https://helloagaincoffee.com",
  "logo": {
    "@type": "ImageObject",
    "url": "https://helloagaincoffee.com/logo.png",
    "width": 600,
    "height": 600
  },
  "sameAs": [
    "https://www.instagram.com/helloagaincoffee",
    "https://www.facebook.com/helloagaincoffee"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+1-808-555-0100",
    "contactType": "Customer Service",
    "areaServed": "US",
    "availableLanguage": "English"
  }
}
```

**Why this specific structure:** Organization acts as the root entity. The `@id` should match the LocalBusiness `@id` if you merge them, or reference it in a `@graph`. `sameAs` links social profiles for entity verification. `logo` should be square, minimum 112px. If you already have LocalBusiness, you can fold Organization properties into it (LocalBusiness is a subtype of Organization). For simplicity on a single-location coffee shop, merge both into one CoffeeShop schema with all Organization properties included.

---

### 3. Missing WebSite schema with SearchAction ⚠ MEDIUM

No WebSite schema exists, so Google cannot offer a sitelinks search box in brand SERPs. For a local business, this matters less than for e-commerce or content sites, but if the site adds a blog, menu search, or location finder, WebSite schema enables that search box in results. It also signals the canonical domain to search engines.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://helloagaincoffee.com/#website",
  "url": "https://helloagaincoffee.com",
  "name": "Hello Again Coffee",
  "publisher": {
    "@id": "https://helloagaincoffee.com/#organization"
  },
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://helloagaincoffee.com/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

**Why this specific structure:** `@id` allows BreadcrumbList and other schemas to reference the website entity. `publisher` links to the Organization via `@id`. `potentialAction` requires a working search endpoint. If no search exists, omit `potentialAction` and keep only the WebSite identity markup. This should live site-wide in the header or footer template.

---

### 4. Missing AggregateRating for social proof ⚠ MEDIUM

No AggregateRating schema exists, so star ratings cannot appear in search results or AI answer boxes. If the business has reviews on Google, Yelp, or a testimonial page, adding AggregateRating to the LocalBusiness schema enables rich snippets and citation in AI overviews. We found no `has_rating_text` signal on the homepage, but many coffee shops display review counts or average ratings in their footer or about section.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "CoffeeShop",
  "@id": "https://helloagaincoffee.com/#organization",
  "name": "Hello Again Coffee",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "127",
    "bestRating": "5",
    "worstRating": "1"
  }
}
```

**Why this specific structure:** Nest `aggregateRating` inside the CoffeeShop schema. `ratingValue` should be the average (e.g., 4.8 out of 5). `reviewCount` must reflect actual reviews you can link to. Google may penalize fake or unverifiable ratings. If you have individual Review schema objects on a testimonials page, link them with `review` property array. For local businesses, pulling Google Business Profile average rating is common practice.

---

### 5. Missing BreadcrumbList for navigation clarity ⚠ LOW

No BreadcrumbList schema exists. The homepage scan shows only one page, so breadcrumbs matter less here, but once the site expands to product pages, blog, or location pages, BreadcrumbList enables rich breadcrumb trails in search results and helps Google understand site hierarchy.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "@id": "https://helloagaincoffee.com/menu#breadcrumb",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://helloagaincoffee.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Menu",
      "item": "https://helloagaincoffee.com/menu"
    }
  ]
}
```

**Why this specific structure:** Each `ListItem` represents one breadcrumb level. `position` starts at 1 for the homepage. `item` is the full URL. Deploy this on every non-home page. The final item (current page) can omit `item` or include it. Match breadcrumb schema to visible breadcrumb UI if present. If no breadcrumb UI exists, add one for usability and schema alignment.

---

## Priority list (schema)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Add CoffeeShop schema with address, geo, hours, phone | HIGH | LOW |
| 2 | Add AggregateRating to CoffeeShop schema | HIGH | LOW |
| 3 | Add WebSite schema with SearchAction (if search exists) | MEDIUM | LOW |
| 4 | Add BreadcrumbList to all non-home pages once site expands | LOW | MEDIUM |

---

## Validation checklist

After the client implements the recommended schema fixes:

- [ ] Google Rich Results Test passes on home page
- [ ] Schema.org Validator shows no warnings
- [ ] Organization + WebSite schemas present in site-wide layout
- [ ] BreadcrumbList on every non-home page
- [ ] LocalBusiness schema includes address, geo, hours, phone, priceRange
- [ ] `@graph` with `@id` references linking schemas together