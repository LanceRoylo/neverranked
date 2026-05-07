# Schema Review — Drake Real Estate Partners

**Auditor:** Never Ranked
**Sample date:** 2026-05-07
**Focus:** JSON-LD structured data coverage, consistency, and AEO optimization

---

## Summary

Drake Real Estate Partners has zero schema deployed. No Organization, no WebSite, no BreadcrumbList, no per-page-type markup. This is a complete gap. When ChatGPT or Perplexity is asked about New York real estate investment firms, they have no structured way to know who Drake is, where you operate, or what services you offer. Competitors with Organization schema get cited. You don't.

**Schema grade: F** (no structured data detected on the home page)

---

## What exists today

| Page type | Organization | WebSite | BreadcrumbList | Service | FinancialService | FAQPage | AggregateRating |
|---|---|---|---|---|---|---|---|
| Homepage | ❌ | ❌ | n/a | ❌ | ❌ | ❌ | ❌ |

We sampled one page (the home page). No JSON-LD blocks were found. No schema of any type is live.

---

## Findings

### 1. Tell Google and AI engines who you are ⚠ CRITICAL

Right now, when ChatGPT or Perplexity is asked "Who are the top real estate investment firms in New York?" they have no structured way to know your name, your focus, or your services. They cite competitors who have Organization schema deployed. This is the foundational piece. Without it, you are invisible to entity engines.

**Where to add it:**

We can infer from the scan that this is a custom-coded site (14KB HTML, minimal CMS fingerprints, low word count suggesting a splash page with JavaScript rendering elsewhere). Here's how to deploy by platform:

- **Custom-coded site (most likely your case):** Paste the JSON-LD block below into the `<head>` of every page, or add it to a sitewide template/layout file so it appears globally.
- **WordPress:** Install Yoast SEO or Rank Math. Go to SEO → General → Knowledge Graph. Select "Organization," enter your name, logo URL, and contact details. The plugin will auto-generate the schema.
- **Squarespace:** Settings → Business Information → fill in company name, logo, address. Squarespace auto-generates basic Organization schema.
- **Webflow:** Project Settings → SEO → Custom Code → paste the JSON-LD block below into the Head Code field (applies sitewide).
- **Wix:** Dashboard → Marketing & SEO → SEO Tools → Structured Data Markup → Add New → paste the JSON-LD block.

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
  "sameAs": [
    "https://www.linkedin.com/company/drake-real-estate-partners"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "Investor Relations",
    "email": "info@drakerep.com"
  }
}
```

**Why this specific structure:** The `@id` property creates a unique entity identifier that other schemas (WebSite, BreadcrumbList, Service) can reference via `publisher` or `provider` fields, creating a knowledge graph Google can follow. Replace `logo.png` with the actual path to your logo (at least 112×112 px, ideally square). Add your LinkedIn URL or other social profiles to `sameAs` to help Google confirm entity identity. Update the email and contact type to match your actual contact structure. If you have a street address, add `streetAddress` and `postalCode` to the `address` block.

---

### 2. Enable site search and sitelinks in Google ⚠ CRITICAL

WebSite schema tells Google your canonical home URL and enables the search box feature in Google results (the little input that lets users search your site directly from the SERP). Right now Google has no signal that drakerep.com is your official domain. This also matters for AEO: when Perplexity or ChatGPT cites you, they use the URL declared in WebSite schema as the canonical reference.

**Where to add it:**

Same deployment paths as Finding 1. This goes in the same `<head>` block, ideally on every page (or in a sitewide template). You can combine both schemas into a single `<script type="application/ld+json">` tag using a `@graph` array (see Layer 3 below).

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://drakerep.com/#website",
  "url": "https://drakerep.com",
  "name": "Drake Real Estate Partners",
  "description": "Drake Real Estate Partners is a real estate investment firm focused on value-add and opportunistic investments across U.S. markets.",
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

**Why this specific structure:** `publisher` references the Organization schema via `@id` chaining, which tells Google "the organization with ID `#organization` publishes this website." The `potentialAction` block enables site search rich results in Google (the search box that appears under your listing). Replace `/search?q={search_term_string}` with your actual search URL pattern. If you don't have site search, remove the `potentialAction` block entirely. The baseline WebSite schema (without SearchAction) is still critical for entity recognition.

---

### 3. Show breadcrumbs in Google results ⚠ HIGH

Breadcrumb schema replaces the plain URL in Google results with a clickable breadcrumb trail (Home > Services > Investment Management). This increases click-through rate by 15–30% in category pages and makes your site appear more organized. Right now Google shows `drakerep.com` with no structure. BreadcrumbList should be on every non-home page.

**Where to add it:**

BreadcrumbList is page-specific (it reflects the actual navigation path to that page), so it goes in the `<head>` of each individual page, not the sitewide template. You'll need to generate it dynamically based on the page's position in your site hierarchy.

- **Custom-coded:** Add logic to your page template to output BreadcrumbList JSON-LD based on the current URL path. See code example below.
- **WordPress:** Yoast SEO and Rank Math auto-generate BreadcrumbList if you enable breadcrumbs in Settings → Advanced → Enable Breadcrumbs. Confirm it's on.
- **Squarespace:** No native support. Use a third-party plugin or add custom JSON-LD via Code Injection on a per-page basis.
- **Webflow:** No native support. Add JSON-LD to each page's Custom Code (Page Settings → Custom Code → Head).
- **Wix:** Dashboard → Marketing & SEO → Structured Data Markup → Add BreadcrumbList per page.

**Fix — ready-to-paste code (example for a subpage like /services/investment-management):**

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
      "name": "Services",
      "item": "https://drakerep.com/services"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "Investment Management",
      "item": "https://drakerep.com/services/investment-management"
    }
  ]
}
```

**Why this specific structure:** Each `ListItem` represents one step in the breadcrumb trail. `position` must be sequential (1, 2, 3...). The final item is the current page. Google ignores BreadcrumbList on the home page (no breadcrumb to show), so deploy this only on subpages. Update the `name` and `item` URL for each page's actual path.

---

### 4. Describe your services so AI engines can cite them ⚠ HIGH

You are a financial services firm offering investment management, advisory, and asset management. Right now there is no structured declaration of what you do. When ChatGPT is asked "Which firms in New York offer value-add real estate investment services?" it has no service-level data to parse. Service schema (or FinancialService, a subtype) tells AI engines exactly what you offer, at what geographic scope, and for whom.

**Where to add it:**

Service schema should live on a services page or on the home page if you don't have a dedicated services section. It can also appear per service (one Service block per offering).

- **Custom-coded:** Paste the JSON-LD block below into the `<head>` of your services page or home page. If you have multiple services, create one Service object per offering and wrap them in a `@graph` array.
- **WordPress:** Plugins like Schema Pro or WP SEO Structured Data Schema let you add Service schema via a UI. Or paste JSON-LD into the page head via a code snippet plugin.
- **Squarespace, Webflow, Wix:** Add via Custom Code or Code Injection on the relevant page.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "FinancialService",
  "@id": "https://drakerep.com/#financialservice",
  "name": "Value-Add and Opportunistic Real Estate Investment",
  "description": "Drake Real Estate Partners provides value-add and opportunistic real estate investment services across U.S. markets, focusing on commercial and multifamily properties.",
  "provider": {
    "@id": "https://drakerep.com/#organization"
  },
  "areaServed": {
    "@type": "Country",
    "name": "United States"
  },
  "serviceType": "Real Estate Investment Management"
}
```

**Why this specific structure:** FinancialService is the correct schema type for investment firms (it's a subtype of Service). `provider` links to your Organization via `@id`. `areaServed` tells Google and AI engines your geographic scope. If you serve specific states or metro areas, replace `Country` with `State` or `City` and add multiple `areaServed` objects in an array. `serviceType` is a free-text field. Use the exact phrasing your prospects search for ("real estate investment management," "commercial property investment," etc.).

---

### 5. Add social preview cards so shares don't appear blank ⚠ MEDIUM

Right now when your site is shared on LinkedIn, Slack, or referenced by ChatGPT, the preview is blank. No image, no title card, no description. Open Graph image (`og:image`) is missing on the home page. This is not schema, but it's critical for AEO and social discovery. AI engines use Open Graph tags when generating citations and previews.

**Where to add it:**

- **Custom-coded:** Add two `<meta>` tags to the `<head>` of every page (or your sitewide template):
  ```html
  <meta property="og:image" content="https://drakerep.com/og-image.jpg">
  <meta name="twitter:image" content="https://drakerep.com/og-image.jpg">
  ```
  Use a 1200×630 px image (or 1200×1200 for square). Upload it to your server and replace the URL above.
- **WordPress (Yoast):** SEO → Social → Facebook tab → upload a default Open Graph image. Repeat for Twitter tab.
- **WordPress (Rank Math):** SEO → Titles & Meta → Social Meta → upload default image.
- **Squarespace:** Settings → Marketing → SEO → Social Image Thumbnail → upload image.
- **Webflow:** Page Settings → Open Graph Settings → upload image. Repeat for each page or set a default in Project Settings.
- **Wix:** Dashboard → Marketing & SEO → Social Share → upload default image.

**Technical detail:** Open Graph tags live in the `<head>` as `<meta property="og:image">`. The image must be an absolute URL (not relative). Minimum size is 200×200 px, but 1200×630 is recommended for LinkedIn and Facebook. Twitter uses `twitter:image` (same URL). If you want different images per page, set them per-page in your CMS or dynamically in your page template.

---

### 6. Add a visible H1 to the home page ⚠ MEDIUM

The home page has zero H1 tags. Google and AI engines use the H1 as the primary topic signal. Without it, they guess. Add one H1 that clearly states what Drake Real Estate Partners does. Example: "Value-Add Real Estate Investment Across U.S. Markets" or "Institutional-Quality Real Estate Investment for Private Capital." Place it above the fold, visible to users.

**Where to add it:**

- **Custom-coded:** Wrap your main headline in an `<h1>` tag. Example: `<h1>Value-Add Real Estate Investment Across U.S. Markets</h1>`. Remove any `<div>` or `<span>` styling the current headline and replace with `<h1>`.
- **WordPress, Squarespace, Webflow, Wix:** Edit the home page. Find the main headline block and change its tag from Paragraph or Heading 2 to Heading 1 (H1) in the block settings or style panel.

One H1 per page. It should be the most prominent text on the page, summarizing the page topic in 5��12 words. Do not keyword-stuff. Write for humans first.

---

### 7. Expand the title tag to include a value proposition ⚠ MEDIUM

The home page title is "Drake Real Estate Partners" (26 characters). This is too short and tells Google nothing about what you do. Ideal length is 50–60 characters. Add a value proposition. Example: "Drake Real Estate Partners | Value-Add Investment Across U.S. Markets" (68 characters, slightly long but acceptable). Or "Drake Real Estate Partners | Real Estate Investment Firm | New York" (67 characters).

**Where to add it:**

- **Custom-coded:** Update the `<title>` tag in the `<head>`. Example: `<title>Drake Real Estate Partners | Value-Add Real Estate Investment</title>`.
- **WordPress (Yoast):** Edit the page → Yoast SEO panel at bottom → SEO title field.
- **WordPress (Rank Math):** Edit the page → Rank Math panel → Title field.
- **Squarespace:** Edit page → gear icon (Page Settings) → SEO → Page Title.
- **Webflow:** Page Settings → SEO Settings → Title Tag.
- **Wix:** Edit page → Page Menu (three dots) → SEO (Google) → Page title.

Title tags appear in Google results as the blue clickable link and in browser tabs. Aim for 50–60 characters. Front-load the most important keywords. Include a brand separator (pipe `|` or dash) and a value phrase.

---

### 8. Add alt text to all images ⚠ LOW

1 of 1 images on the home page is missing alt text. Alt text helps Google understand image content and is required for accessibility (screen readers read it aloud). Every image should have a descriptive alt attribute. Example: if the image is your office building, use `alt="Drake Real Estate Partners New York office exterior"`. If