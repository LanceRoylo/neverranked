# Schema Review — Central Pacific Bank

**Auditor:** Never Ranked
**Sample date:** 2026-05-08
**Focus:** JSON-LD structured data coverage, consistency, and AEO optimization

---

## Summary

Central Pacific Bank's homepage has zero structured data. No Organization schema, no WebSite schema, no BreadcrumbList, no FAQPage. This means Google Knowledge Graph has no formal identity hook, AI engines like ChatGPT and Perplexity have no structured way to cite the bank's services or locations, and the site is invisible to every rich result format (sitelinks search box, FAQ snippets, review stars). For a financial institution competing in local and regional search, this is a complete gap. Competitors with even basic Organization + WebSite schema are getting entity recognition and Knowledge Panel real estate that CPB is leaving on the table.

**Schema grade: F** (zero structured data deployed on sampled page)

---

## What exists today

| Page type | FAQPage | FinancialService | Article | Organization | BreadcrumbList | HowTo | AggregateRating |
|---|---|---|---|---|---|---|---|
| Homepage | ❌ | ❌ | ❌ | ❌ | ❌ | ��� | ❌ |

---

## Findings

### 1. Tell Google and AI engines who you are ⚠ CRITICAL

Right now, when ChatGPT or Perplexity is asked "What banks serve Hawaii?" or "Central Pacific Bank hours," they have no structured way to know your name, address, services, or locations. They cite competitors who publish Organization schema. Google has no formal entity record to populate a Knowledge Panel. This schema is the single highest-value addition for a financial institution. It powers brand SERP features, local pack inclusion, and AI citation.

**How to add it (by platform):**

- **WordPress:** If using Yoast SEO, go to SEO → General → Knowledge Graph. Select "Organization," upload your logo, add business name and legal name. If using Rank Math, go to Rank Math → General Settings → Knowledge Graph and fill the same fields.
- **Squarespace:** Settings → Business Information. Fill out business name, address, and logo. Squarespace auto-generates basic Organization schema from those fields.
- **Webflow:** Project Settings → SEO → Custom Code (site-wide head). Paste the JSON-LD block below.
- **Wix:** Dashboard → Marketing & SEO → SEO Tools → Structured Data Markup. Add a new item, select "Organization," paste the JSON-LD block below.
- **Custom-coded site:** Paste the JSON-LD block below into the `<head>` section of your site-wide template (so it appears on every page).

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "BankOrCreditUnion",
  "@id": "https://www.cpb.bank/#organization",
  "name": "Central Pacific Bank",
  "alternateName": "CPB",
  "url": "https://www.cpb.bank",
  "logo": "https://www.cpb.bank/logo.png",
  "image": "https://www.cpb.bank/logo.png",
  "description": "Central Pacific Bank serves Hawaii with personal banking, business banking, mortgages, and wealth management.",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "220 South King Street",
    "addressLocality": "Honolulu",
    "addressRegion": "HI",
    "postalCode": "96813",
    "addressCountry": "US"
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+1-808-544-0500",
    "contactType": "customer service",
    "areaServed": "US-HI",
    "availableLanguage": ["en"]
  },
  "sameAs": [
    "https://www.facebook.com/CentralPacificBank",
    "https://www.linkedin.com/company/central-pacific-bank",
    "https://twitter.com/CPBHawaii"
  ]
}
```

**Why this specific structure:** We use `BankOrCreditUnion` (a specialized subtype of `FinancialService`) because it gives Google and AI engines the most specific entity signal. The `@id` property creates a reusable anchor so other schemas on the site (like `BreadcrumbList` or `WebSite`) can reference this entity without duplicating the full block. Replace the logo URL, street address, phone number, and social URLs with your actual values. If you have multiple branch locations, add an array of `location` objects, each with its own `PostalAddress` and `geo` coordinates.

---

### 2. Enable the sitelinks search box in Google results ⚠ HIGH

When someone searches "Central Pacific Bank" on Google, your brand result can show a search box that lets users jump directly to loan products, account pages, or branch locators. Right now you have no WebSite schema, so Google will not display that feature. Competitors with WebSite schema get higher click-through on branded queries because users can search without landing on the homepage first.

**How to add it (by platform):**

- **WordPress (Yoast / Rank Math):** Most modern SEO plugins auto-generate WebSite schema. Check under SEO → General → Schema (Yoast) or Rank Math → General Settings → Schema. Confirm "WebSite" is enabled and that the search URL pattern is set (usually `https://www.cpb.bank/?s={search_term_string}`).
- **Squarespace:** WebSite schema is not auto-generated. Go to Settings → Advanced → Code Injection → Header, paste the JSON-LD block below.
- **Webflow / Wix / Custom-coded:** Paste the JSON-LD block below into your site-wide `<head>` template.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://www.cpb.bank/#website",
  "url": "https://www.cpb.bank",
  "name": "Central Pacific Bank",
  "publisher": {
    "@id": "https://www.cpb.bank/#organization"
  },
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://www.cpb.bank/search?q={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
}
```

**Why this specific structure:** The `publisher` property uses an `@id` reference to link back to the Organization schema (from Finding 1), creating a single connected graph. The `potentialAction` tells Google where to send search queries. Replace `https://www.cpb.bank/search?q={search_term_string}` with your actual search results URL pattern. If you do not have site search, remove the `potentialAction` block entirely (the WebSite schema is still valuable for entity binding).

---

### 3. Add breadcrumb trails for navigation context ⚠ MEDIUM

Google shows breadcrumb trails in search results (the "Home > Personal Banking > Checking" path above the meta description) when you publish BreadcrumbList schema. Right now you have none, so Google either invents breadcrumbs from your URL structure (often incorrectly) or shows none at all. Proper breadcrumbs improve click-through on deep pages (mortgage product pages, branch detail pages) because users see the path before they click.

**How to add it (by platform):**

- **WordPress (Yoast / Rank Math / SEOPress):** Most SEO plugins auto-generate BreadcrumbList schema if you enable breadcrumbs in the plugin settings. Go to SEO → Search Appearance → Breadcrumbs (Yoast) or Rank Math → General Settings → Breadcrumbs and turn on "Enable Breadcrumbs."
- **Squarespace / Wix:** No built-in breadcrumb schema generation. You will need to add the JSON-LD block below manually on each page template, updating the `itemListElement` array to match the actual breadcrumb path for that page.
- **Webflow / Custom-coded:** Add the JSON-LD block below to each page template. Use dynamic template variables to populate the `name` and `item` fields based on page hierarchy.

**Fix — ready-to-paste code (example for a mortgage product page):**

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://www.cpb.bank"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Personal Banking",
      "item": "https://www.cpb.bank/personal"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "Home Loans",
      "item": "https://www.cpb.bank/personal/home-loans"
    }
  ]
}
```

**Why this specific structure:** Each breadcrumb step is a `ListItem` with a position (1-indexed), a human-readable name, and the full URL. Google uses this to render breadcrumbs in the SERP and to understand your site hierarchy. Add this schema to every non-homepage page, updating the `itemListElement` array to reflect the actual navigation path. Do not include the current page as the final crumb (Google infers that from the page itself).

---

### 4. Publish FAQ schema for common banking questions ⚠ MEDIUM

If your homepage or product pages answer questions like "What are your business hours?" or "How do I open an account?" or "What are your mortgage rates?", you can mark those up with FAQPage schema. Google shows FAQ rich results (the expandable question/answer accordion) in the SERP, which pushes competitors down and increases your SERP real estate. AI engines like ChatGPT and Perplexity also cite FAQ schema directly when answering user questions about your services.

**How to add it (by platform):**

- **WordPress (Yoast / Rank Math / Schema Pro):** Yoast 14.0+ includes an FAQ block (Gutenberg editor). Add the FAQ block to your page, type your questions and answers, and Yoast auto-generates the schema. Rank Math has a similar FAQ block. Schema Pro plugin lets you add FAQ schema to any page via a meta box.
- **Squarespace / Wix / Webflow / Custom-coded:** Add the JSON-LD block below to the `<head>` or before the closing `</body>` tag of any page where you display FAQ content. Update the `mainEntity` array with your actual questions and answers.

**Fix — ready-to-paste code (example with 3 questions):**

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What are Central Pacific Bank's business hours?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Most branches are open Monday through Friday, 8:30 AM to 4:00 PM, and Saturday 9:00 AM to 1:00 PM. Hours vary by location. Check our branch locator for specific hours."
      }
    },
    {
      "@type": "Question",
      "name": "How do I open a checking account online?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Visit our online account opening page, choose the checking account type, and complete the application. You will need a government-issued ID, Social Security number, and an initial deposit. Most applications are approved within minutes."
      }
    },
    {
      "@type": "Question",
      "name": "Does Central Pacific Bank offer mobile banking?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Our mobile app is available for iOS and Android. You can check balances, transfer funds, deposit checks, pay bills, and locate ATMs. Download the app from the App Store or Google Play."
      }
    }
  ]
}
```

**Why this specific structure:** Each question is a `Question` object with a `name` (the question text) and an `acceptedAnswer` (an `Answer` object with a `text` field containing the answer). Google requires at least 2 questions for FAQ rich results to appear. The answer text should be the full answer as displayed on the page (Google will truncate in the SERP if too long, but the schema should match your on-page content). Add this schema only to pages that actually display the FAQ content visibly. Do not use FAQPage schema for single questions (use `Question` type instead) or for questions that are not answered on the page.

---

### 5. Add AggregateRating schema if you display customer reviews ⚠ LOW

If your homepage or product pages display a star rating or review count (for example, "4.8 stars from 1,200 customers"), you can mark that up with AggregateRating schema. Google shows star snippets in search results, and AI engines cite the rating when recommending banks. Right now we see no rating text on the homepage, so this is lower priority. If you add testimonials or reviews in the future, add this schema at the same time.

**How to add it (by platform):**

- **WordPress (WP Review Pro / Schema Pro / Rank Math):** Most review plugins auto-generate AggregateRating schema. If you display reviews manually, use Rank Math's schema builder (edit the page, scroll to Rank Math schema meta box, add "Review" schema type).
- **Squarespace / Wix / Webflow / Custom-coded:** Add the JSON-LD block below to any page where you display aggregate reviews or ratings.

**Fix — ready-to-paste code (example):**

```json
{
  "@context": "https://schema.org",
  "@type": "BankOrCreditUnion",
  "@id": "https://www.cpb.bank/#organization",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "1200",
    "bestRating": "5",
    "worstRating": "1"
  }
}
```

**Why this specific structure:** The `aggregateRating` property nests inside your Organization schema (from Finding 1). If you already have Organization schema deployed, add the `aggregateRating` property to that existing block rather than creating a duplicate. The `ratingValue` is the average star rating (0 to 5 scale, or your custom scale). The `reviewCount` is the total number of reviews. Google requires at least 2 reviews and a valid `ratingValue` for star snippets to appear. Replace the numbers with your actual rating data. If you collect reviews on a third-party platform (Google, Trustpilot, etc.), link to that platform in a `review` property and cite the source.

---

### 6. Fix canonical tag and Open Graph image gaps (foundational SEO) ⚠ CRITICAL

Your homepage has no canonical tag and no Open Graph image. The canonical tag tells Google which version of a URL is the preferred one (important if your site is accessible at both www and non-www, or http and https). The Open Graph image controls what appears when your site is shared on LinkedIn, Slack, or cited by ChatGPT. Right now every share shows a blank preview. Both of these are foundational SEO hygiene, not schema, but they are critical gaps.

**How to add canonical tags (by platform):**

- **WordPress (Yoast / Rank Math / All in One SEO):** These plugins auto-generate canonical tags on every page. Check that the plugin is active and that canonical tags are enabled under SEO → General → Features (Yoast) or similar.
- **Squarespace / Wix:** Canonical tags are auto-generated. No action needed unless you see duplicate URL patterns (like `/page?query=123` and `/page`).
- **Webflow:** Webflow auto-generates canonical tags for CMS pages. For static pages, go to Page Settings → SEO Settings and confirm "Auto