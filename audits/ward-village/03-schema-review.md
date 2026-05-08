# Schema Review — Ward Village

**Auditor:** Never Ranked
**Sample date:** 2026-05-08
**Focus:** JSON-LD structured data coverage, consistency, and AEO optimization

---

## Summary

Ward Village has basic schema hygiene in place. All 10 sampled pages include JSON-LD, with site-wide BreadcrumbList and WebSite schemas present. Coverage is strong on navigational markup (BreadcrumbList on every page, ImageObject on 6 of 10 pages). The critical gap is entity recognition. No Organization schema exists anywhere on the site, which means Google, ChatGPT, and Perplexity have no structured way to know who Ward Village is, what they do, or where they operate. The second gap is social proof. No AggregateRating or Review schema exists, even though testimonial text appears on at least 7 pages. Real estate developments live and die on trust signals, and right now those signals are invisible to AI citation engines.

**Schema grade: C+** (Good breadcrumb coverage and technical execution, but missing the two entity-recognition primitives that matter most for a master-planned community competing for "Honolulu condos" and "Ward Village real estate" queries.)

---

## What exists today

| Page type | Organization | AggregateRating | RealEstateAgent | Place | BreadcrumbList | Article | WebPage |
|---|---|---|---|---|---|---|---|
| Homepage | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ |
| Art & Culture | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ |
| Ads Archive | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ (uses CollectionPage) |
| Amenities | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ |
| Article (Ossipoff) | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| Broker Portal | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ |
| Ae'o Shops | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ |
| Contact | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ |

---

## Findings

### 1. Tell Google and AI engines who you are ⚠ CRITICAL

Right now, when ChatGPT or Perplexity is asked "What is Ward Village?" or "Best master-planned communities in Honolulu," they have no structured way to know your name, location, parent company, or what you offer. Google Search has the same problem. Organization schema is how you tell every AI engine and search platform "this is who we are." Without it, you are not a recognized entity. You are just text on a page. Competitors with Organization schema get cited. You do not.

**How to add it:**

Your site appears to be custom-coded (no visible CMS generator tags). This means you will paste the JSON-LD block below into the `<head>` section of your site-wide template (the file that wraps every page). If you use a tag manager (Google Tag Manager, Segment, etc.), you can inject it there instead.

- **WordPress (Yoast, Rank Math, SEOPress):** Yoast SEO → Search Appearance → General → Organization info. Fill in name, logo URL, social profiles. The plugin auto-generates the JSON-LD.
- **Squarespace:** Settings → Business Information. Name, address, and logo fields populate Organization schema automatically.
- **Webflow:** Project Settings → SEO → Sitewide Schema. Paste the JSON-LD block below into the "Head Code" field.
- **Wix:** SEO Tools → Structured Data. Add as JSON-LD custom code.
- **Custom-coded (your case):** Paste the block below into the `<head>` of your global template (header.php, layout component, etc.).

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://www.wardvillage.com/#organization",
  "name": "Ward Village",
  "url": "https://www.wardvillage.com",
  "logo": "https://www.wardvillage.com/path-to-your-logo.png",
  "description": "Honolulu's premier master-planned community: a cosmopolitan setting embracing Hawaiian culture with the perfect mix of urban and island living.",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Honolulu",
    "addressRegion": "HI",
    "addressCountry": "US"
  },
  "parentOrganization": {
    "@type": "Organization",
    "name": "Howard Hughes Corporation"
  },
  "sameAs": [
    "https://www.facebook.com/WardVillage",
    "https://www.instagram.com/wardvillage",
    "https://twitter.com/WardVillage"
  ]
}
```

**Why this specific structure:** The `@id` field creates a stable reference so other schemas on your site can link back to this Organization entity using `"publisher": { "@id": "https://www.wardvillage.com/#organization" }`. The `parentOrganization` field ties Ward Village to Howard Hughes Corporation, which strengthens entity recognition (Google knows Howard Hughes, so this inheritance helps). The `sameAs` array links your social profiles, which Google uses to verify identity and build your Knowledge Graph entry. Replace `"logo"` with the actual URL of your primary logo image (must be accessible, square or 16:9 aspect ratio, minimum 112px wide). Add street address if you want local SEO signals (you may prefer city-level since this is a district, not a single building).

---

### 2. Show visitor ratings and social proof to AI engines ⚠ HIGH

We found testimonial text on 7 of 10 sampled pages. That is great. The problem is it exists only as HTML prose. Google and ChatGPT cannot extract a star rating or review count from a paragraph of text. AggregateRating schema is how you make those signals machine-readable. Right now, when an AI is asked "Is Ward Village worth it?" or "Ward Village reviews," it has no structured data to cite. Competitors with AggregateRating get featured. You get skipped.

**How to add it:**

You need to aggregate your actual ratings (from Google reviews, Facebook, internal surveys, whatever sources you trust) and declare them in AggregateRating schema. This should live inside your Organization schema (nested) or on pages where reviews appear (like a testimonials page, if you have one).

If you display individual reviews on the site (names, quotes, dates), mark each one up with Review schema. If you only want to show the aggregate (e.g., "4.8 stars from 127 reviews"), use AggregateRating alone.

- **WordPress (WP Review Pro, Schema Pro, Yoast Local SEO add-on):** These plugins let you input aggregate rating data in a UI. They output the JSON-LD automatically.
- **Squarespace, Webflow, Wix:** No native aggregate-rating UI. You will paste JSON-LD into a site-wide code injection area (same as Organization schema above).
- **Custom-coded (your case):** Paste the block below into your site-wide `<head>`, nested inside the Organization schema we added in Finding #1. Alternatively, paste it as a standalone block if you prefer separation.

**Fix — ready-to-paste code (nested version, to go inside your Organization schema):**

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://www.wardvillage.com/#organization",
  "name": "Ward Village",
  "url": "https://www.wardvillage.com",
  "logo": "https://www.wardvillage.com/path-to-your-logo.png",
  "description": "Honolulu's premier master-planned community: a cosmopolitan setting embracing Hawaiian culture with the perfect mix of urban and island living.",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Honolulu",
    "addressRegion": "HI",
    "addressCountry": "US"
  },
  "parentOrganization": {
    "@type": "Organization",
    "name": "Howard Hughes Corporation"
  },
  "sameAs": [
    "https://www.facebook.com/WardVillage",
    "https://www.instagram.com/wardvillage",
    "https://twitter.com/WardVillage"
  ],
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "127",
    "bestRating": "5",
    "worstRating": "1"
  }
}
```

**Why this specific structure:** Nesting `aggregateRating` inside Organization tells Google and AI engines that the 4.8-star rating applies to Ward Village as an entity, not to a single condo listing or blog post. Replace `"ratingValue"` and `"reviewCount"` with your actual numbers. You can pull these from Google Business Profile API, Facebook reviews export, or manual aggregation. Google requires `reviewCount` to be at least 2 for rich results to show. If you have fewer than 2 public reviews, hold off on this schema until you collect more (or use individual Review schema instead, which has no minimum-count requirement).

---

### 3. Fix broken Open Graph image coverage on 3 pages ⚠ MEDIUM

When someone shares your site on LinkedIn, Slack, or ChatGPT references it in a citation card, the preview image comes from the `og:image` meta tag. Right now, 3 of your 10 sampled pages are missing that tag. Those pages show up as blank gray boxes when shared. The pages with the gap: `/ads/`, `/amenities/`, `/broker-portal/`, and `/contact-information/` (4 pages total, actually — all missing `og:image` or `twitter:image`).

**How to fix it:**

You need to add `<meta property="og:image" content="https://www.wardvillage.com/default-share-image.jpg">` to the `<head>` of every page. Most sites use a default fallback image (your logo or a hero shot of the development) and override it on specific pages (e.g., Art & Culture page uses a mural photo, article pages use the featured image).

- **WordPress (Yoast, Rank Math):** Yoast SEO → Social → Facebook → Upload default image. Per-page overrides: edit any page → Yoast SEO panel → Social tab → upload page-specific image.
- **Squarespace:** Settings → Marketing → Social Image Sharing → upload default image. Per-page: Page Settings → Social Image.
- **Webflow:** Page Settings → Open Graph Image → upload. Set a site-wide default in Project Settings → SEO → Default Open Graph Image.
- **Wix:** SEO Tools → Social Share → upload default image. Per-page overrides in page settings.
- **Custom-coded (your case):** Paste this into your `<head>` template, or add it dynamically per page if you want unique images per URL:

```html
<meta property="og:image" content="https://www.wardvillage.com/images/default-share-preview.jpg">
<meta name="twitter:image" content="https://www.wardvillage.com/images/default-share-preview.jpg">
```

Replace the URL with your actual image path. Image should be 1200×630px (or 1.91:1 ratio), under 8 MB, and publicly accessible (not behind a login).

**Why this matters:** ChatGPT, Perplexity, LinkedIn, and Slack all use Open Graph tags to generate preview cards. Missing `og:image` means your link shows up as text-only, which gets 3x lower click-through than links with images. You already have `og:image` on 7 pages, so this is just cleanup on the stragglers.

---

### 4. Add Place schema for Ward Village as a physical location ⚠ MEDIUM

Ward Village is not just a company. It is a 60-acre master-planned neighborhood. Right now, you have Organization schema (once you add Finding #1 above), but you do not have Place schema. Place schema tells Google and AI engines "this is a specific geographic location with boundaries, amenities, and things to do here." It is the difference between being cited as "a real estate developer" versus "a walkable urban district in Honolulu." Queries like "things to do in Ward Village" or "Ward Village neighborhood guide" need Place schema to trigger rich results and AI citations.

**How to add it:**

Place schema should live on your homepage or on a dedicated "About Ward Village" or "Neighborhood" page. It can coexist with Organization schema (you can have both on the same page, linked via `@id` references).

- **WordPress, Squarespace, Webflow, Wix:** No CMS natively generates Place schema. You will paste the JSON-LD block below into a site-wide or page-specific code injection area.
- **Custom-coded (your case):** Paste the block below into the `<head>` of your homepage (or whichever page best describes the neighborhood itself).

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "Place",
  "@id": "https://www.wardvillage.com/#place",
  "name": "Ward Village",
  "description": "A 60-acre master-planned community in Honolulu blending urban living, Hawaiian culture, shops, dining, and public art.",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "1240 Ala Moana Blvd",
    "addressLocality": "Honolulu",
    "addressRegion": "HI",
    "postalCode": "96814",
    "addressCountry": "US"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "21.2920",
    "longitude": "-157.8510"
  },
  "url": "https://www.wardvillage.com",
  "photo": "https://www.wardvillage.com/images/ward-village-aerial.jpg",
  "containedInPlace": {
    "@type": "City",
    "name": "Honolulu"
  }
}
```

**Why this specific structure:** The `geo` coordinates (latitude/longitude) let Google plot Ward Village on a map and associate it with local queries. The `containedInPlace` property nests Ward Village inside Honolulu, which helps with "neighborhoods in Honolulu" queries. The `@id` field lets you reference this Place from other schemas (e.g., you could add `"location": { "@id": "https://www.wardvillage.com/#place" }` to events or condo listings). Replace the `photo` URL with an actual aerial or hero shot of the development. Replace `streetAddress` and coordinates with the precise center point of Ward Village (I used an approximation based on Ala Moana Blvd, but verify the exact coords).

---

### 5. Clean up title tag length on 6 pages ⚠ LOW

4 pages have title tags under 30 characters (too short), and 2 pages are over 65 characters (too long). Short titles waste space in search results. Long titles get truncated with "..." and lose the tail end of your message. Neither case is fatal, but both are sloppy. The pages with issues:

- **Too short (under 30 chars):** `/ads/` (26 chars), `/amenities/` (24 chars), `/broker-portal/` (28 chars), `/centers/aeo-shops/` (25 chars)