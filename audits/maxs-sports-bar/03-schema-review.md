# Schema Review — Max's Sports Bar

**Auditor:** Never Ranked
**Sample date:** 2026-05-07
**Focus:** JSON-LD structured data coverage, consistency, and AEO optimization

---

## Summary

Max's Sports Bar has LocalBusiness schema on the homepage only (1 of 10 sampled pages). The other nine pages, including About Us, Contact, Events, Food Menu, and Drinks, carry zero structured data. Organization schema is missing entirely across the site, which blocks entity recognition in Google's Knowledge Graph. WebSite schema is absent, disabling SearchAction sitelink search boxes. BreadcrumbList is missing, so rich result breadcrumbs won't appear in SERPs. For a local hospitality business competing in Memphis, this is a material disadvantage.

**Schema grade: D** (LocalBusiness exists on homepage but Organization, WebSite, BreadcrumbList, and Menu schemas are all absent)

---

## What exists today

| Page type | LocalBusiness | Organization | WebSite | BreadcrumbList | Menu | Event |
|---|---|---|---|---|---|---|
| Homepage | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| About Us | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Contact | ��� | ✗ | ✗ | ✗ | ✗ | ✗ |
| Food Menu | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Drinks | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Events | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

---

## Findings

### 1. Missing Organization schema across entire site ⚠ HIGH

No Organization schema exists on any of the 10 sampled pages. Google uses Organization schema to build Knowledge Graph entities, map social profiles, and confirm NAP (name, address, phone) consistency. Without it, Google treats Max's Sports Bar as an isolated mention on each page rather than a verified entity. This also blocks the logo and social profile links from appearing in branded search results.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://maxssportsbar.com/#organization",
  "name": "Max's Sports Bar",
  "url": "https://maxssportsbar.com",
  "logo": "https://maxssportsbar.com/logo.png",
  "description": "Quaint but energetic neighborhood bar in the historic South Main Arts District in the heart of Downtown Memphis, serving since 2007.",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Memphis",
    "addressRegion": "TN",
    "addressCountry": "US"
  },
  "sameAs": [
    "https://www.facebook.com/maxssportsbar",
    "https://www.instagram.com/maxssportsbar"
  ]
}
```

**Why this specific structure:** The `@id` anchor allows other schemas to reference this Organization via `"publisher": { "@id": "https://maxssportsbar.com/#organization" }`. Replace `logo.png` with the actual logo URL. Add street address, postal code, and telephone in the `address` block if you want full NAP validation. The `sameAs` array should list every verified social profile.

---

### 2. Missing WebSite schema (no SearchAction for sitelink search) ⚠ HIGH

WebSite schema with SearchAction markup enables the Google sitelink search box in branded queries. When someone searches "Max's Sports Bar," Google can display an inline search field that queries your site directly. This is especially useful for menu items, event schedules, and reservation queries. Currently absent on all 10 pages.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://maxssportsbar.com/#website",
  "url": "https://maxssportsbar.com",
  "name": "Max's Sports Bar",
  "publisher": {
    "@id": "https://maxssportsbar.com/#organization"
  },
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://maxssportsbar.com/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

**Why this specific structure:** The `potentialAction` target URL should point to your actual search results page. Replace `/search?q={search_term_string}` with your CMS search endpoint (e.g., if you're on Squarespace, Wix, or WordPress, confirm the query parameter). The `publisher` reference links this to the Organization schema via `@id`.

---

### 3. Missing BreadcrumbList on all non-home pages ⚠ MEDIUM

None of the 10 sampled pages use BreadcrumbList schema. Google uses breadcrumbs to understand site hierarchy and display rich result breadcrumbs in SERPs (the clickable path above the meta description). For a site with sections like Events, Food Menu, Drinks, and Contact, breadcrumbs clarify context and improve click-through rate.

**Fix — ready-to-paste code (example for /about-us):**

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://maxssportsbar.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "About Us",
      "item": "https://maxssportsbar.com/about-us"
    }
  ]
}
```

**Why this specific structure:** Each `ListItem` represents one level in the path. Position must increment sequentially. The final item (current page) should match the page URL. Deploy this on every non-home page, updating the `itemListElement` array to reflect the actual breadcrumb path.

---

### 4. Missing Menu schema on food and drinks pages ⚠ MEDIUM

The Food Menu and Drinks pages carry no Menu or MenuSection schema. Google can display menu items directly in local search results and Google Maps if you mark them up. This is particularly valuable for "sports bar menu Memphis" or "best wings downtown Memphis" queries where Google shows menu snippets.

**Fix — ready-to-paste code (example for /food-menu):**

```json
{
  "@context": "https://schema.org",
  "@type": "Menu",
  "name": "Food Menu",
  "description": "Max's Sports Bar food menu featuring wings, burgers, appetizers, and game-day favorites.",
  "hasMenuSection": [
    {
      "@type": "MenuSection",
      "name": "Appetizers",
      "hasMenuItem": [
        {
          "@type": "MenuItem",
          "name": "Buffalo Wings",
          "description": "Traditional bone-in wings with choice of sauce",
          "offers": {
            "@type": "Offer",
            "price": "12.99",
            "priceCurrency": "USD"
          }
        }
      ]
    },
    {
      "@type": "MenuSection",
      "name": "Burgers",
      "hasMenuItem": [
        {
          "@type": "MenuItem",
          "name": "Classic Cheeseburger",
          "description": "Half-pound Angus beef, cheddar, lettuce, tomato, onion",
          "offers": {
            "@type": "Offer",
            "price": "10.99",
            "priceCurrency": "USD"
          }
        }
      ]
    }
  ]
}
```

**Why this specific structure:** Each `MenuSection` groups related items. Each `MenuItem` needs name, description (optional but helpful for rich results), and an `Offer` with price and currency. Replicate this pattern for the Drinks page, changing `@type` to `Menu` and populating beer, cocktail, and wine sections.

---

### 5. Missing Event schema on events and cornhole pages ⚠ MEDIUM

The Events page and Cornhole About page describe recurring events (Crawfish Saturdays, cornhole league registration) but carry no Event schema. Google can display event rich results in Search and trigger Google Calendar integrations if you mark up dates, times, and locations.

**Fix — ready-to-paste code (example for recurring crawfish event):**

```json
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Crawfish Saturdays",
  "description": "Fresh crawfish boil every Saturday during crawfish season at Max's Sports Bar.",
  "eventSchedule": {
    "@type": "Schedule",
    "byDay": "Saturday",
    "repeatFrequency": "P1W"
  },
  "location": {
    "@type": "Place",
    "name": "Max's Sports Bar",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Memphis",
      "addressRegion": "TN",
      "addressCountry": "US"
    }
  },
  "organizer": {
    "@id": "https://maxssportsbar.com/#organization"
  }
}
```

**Why this specific structure:** `eventSchedule` handles recurring events. `byDay` specifies day of week, `repeatFrequency` uses ISO 8601 duration (P1W = every week). For one-time events (like the cornhole league start date 8/27), use `startDate` and `endDate` instead of `eventSchedule`. The `organizer` reference links to your Organization schema.

---

### 6. LocalBusiness schema exists but missing key properties ⚠ LOW

The homepage has LocalBusiness schema, but it's likely missing properties that improve local search visibility: `openingHoursSpecification`, `priceRange`, `telephone`, `geo` coordinates, and `aggregateRating`. Adding these turns the schema from minimal compliance into a competitive local SEO asset.

**Fix — enhanced LocalBusiness code:**

```json
{
  "@context": "https://schema.org",
  "@type": "BarOrPub",
  "@id": "https://maxssportsbar.com/#localbusiness",
  "name": "Max's Sports Bar",
  "url": "https://maxssportsbar.com",
  "image": "https://maxssportsbar.com/hero-image.jpg",
  "description": "Quaint but energetic neighborhood sports bar in the South Main Arts District, Memphis. Cubs bar, crawfish Saturdays, cornhole league.",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 South Main St",
    "addressLocality": "Memphis",
    "addressRegion": "TN",
    "postalCode": "38103",
    "addressCountry": "US"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "35.1495",
    "longitude": "-90.0490"
  },
  "telephone": "+1-901-555-0100",
  "priceRange": "$$",
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday"],
      "opens": "15:00",
      "closes": "23:00"
    },
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Friday", "Saturday"],
      "opens": "15:00",
      "closes": "02:00"
    },
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": "Sunday",
      "opens": "12:00",
      "closes": "22:00"
    }
  ],
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.6",
    "reviewCount": "87"
  },
  "sameAs": [
    "https://www.facebook.com/maxssportsbar",
    "https://www.instagram.com/maxssportsbar"
  ]
}
```

**Why this specific structure:** `BarOrPub` is a more specific subtype of LocalBusiness and signals your vertical to Google. Replace placeholder address, phone, geo coordinates, and hours with real values. If you have verified Google reviews, populate `aggregateRating` with the actual rating and count. Geo coordinates help Google Maps placement.

---

## Priority list (schema)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Add Organization schema site-wide | HIGH | LOW |
| 2 | Add WebSite + SearchAction schema site-wide | HIGH | LOW |
| 3 | Add BreadcrumbList on all non-home pages | MEDIUM | MEDIUM |
| 4 | Add Menu schema to Food Menu and Drinks pages | MEDIUM | MEDIUM |
| 5 | Add Event schema to Events and Cornhole pages | MEDIUM | LOW |
| 6 | Enhance existing LocalBusiness with hours, geo, rating | MEDIUM | LOW |

---

## Validation checklist

After the client implements the recommended schema fixes:

- [ ] Google Rich Results Test passes on home page
- [ ] Schema.org Validator shows no warnings
- [ ] Organization + WebSite schemas present in site-wide layout
- [ ] BreadcrumbList on every non-home page
- [ ] Menu schema on food-menu and drinks pages
- [ ] Event schema on events and cornhole-about pages
- [ ] Enhanced LocalBusiness includes geo, hours, phone, aggregateRating
- [ ] `@id` references link Organization to WebSite and LocalBusiness in a unified graph