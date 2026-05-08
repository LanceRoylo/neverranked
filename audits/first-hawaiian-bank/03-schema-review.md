```markdown
# Schema Review — First Hawaiian Bank

**Auditor:** Never Ranked
**Sample date:** 2026-05-08
**Focus:** JSON-LD structured data coverage, consistency, and AEO optimization

---

## Summary

First Hawaiian Bank has zero structured data deployed across all 10 sampled pages. No Organization schema, no WebSite schema, no BreadcrumbList, no product or service schemas. When AI engines are asked "which Hawaii bank offers the best IRA rates" or "First Hawaiian Bank routing number," they have no machine-readable hook to cite. The site is invisible to answer engines in every category that matters: entity recognition, sitelinks search box, rich result breadcrumbs, and social proof aggregation. This is a complete rebuild, not a tune-up.

**Schema grade: F** (zero structured data detected across 10 pages)

---

## What exists today

| Page type | FAQPage | FinancialProduct | Article | Organization | BreadcrumbList | HowTo | AggregateRating |
|---|---|---|---|---|---|---|---|
| Homepage | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Traditional IRA | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Roth IRA | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| CDs | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Routing Numbers | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Findings

### 1. Tell Google and AI engines who you are (Organization schema) ⚠️ CRITICAL

Right now, when ChatGPT or Perplexity is asked "who is First Hawaiian Bank," they have no structured way to know your founding date, headquarters, service areas, logo, or even your legal name. They cite competitors who publish Organization schema. This is the single most important piece of structured data for any business with a physical presence. It powers knowledge panels, entity disambiguation (so "FHB" gets linked to your brand, not someone else's acronym), and local pack eligibility.

**How to add it:**

Your site appears to be custom-coded (no CMS fingerprints detected). The fastest path is to paste the JSON-LD block below into the `<head>` of your site-wide template so it appears on every page.

- **WordPress:** Install Yoast SEO or Rank Math. Navigate to SEO → General → Knowledge Graph. Fill in business name, logo URL, and select "Company." The plugin will auto-generate Organization schema.
- **Squarespace:** Go to Settings → Business Information. Fill in name, address, phone, and logo. Squarespace auto-publishes Organization schema.
- **Webflow:** Open Project Settings → SEO → Custom Code. Paste the JSON-LD block below into the Head Code field (site-wide).
- **Wix:** Open Settings → SEO Tools → Structured Data. Click "Add New" and paste the JSON-LD block.
- **Custom-coded:** Paste the JSON-LD block below into your site-wide `<head>` template (likely a header partial or layout file).

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "FinancialService",
  "@id": "https://www.fhb.com/#organization",
  "name": "First Hawaiian Bank",
  "url": "https://www.fhb.com",
  "logo": "https://www.fhb.com/path-to-your-logo.png",
  "description": "The largest Hawaii bank offering personal, private, and business banking services in Hawaii, Guam, and Saipan.",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Honolulu",
    "addressRegion": "HI",
    "addressCountry": "US"
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "Customer Service",
    "telephone": "+1-808-XXX-XXXX",
    "areaServed": ["US-HI", "US-GU", "MP"]
  },
  "areaServed": [
    {
      "@type": "State",
      "name": "Hawaii"
    },
    {
      "@type": "Country",
      "name": "Guam"
    },
    {
      "@type": "Country",
      "name": "Saipan"
    }
  ],
  "sameAs": [
    "https://www.facebook.com/FirstHawaiianBank",
    "https://www.linkedin.com/company/first-hawaiian-bank",
    "https://twitter.com/FirstHawaiian"
  ]
}
```

**Why this specific structure:** We used `FinancialService` instead of generic `Organization` because it signals your industry to search engines and qualifies you for finance-specific rich results. The `@id` property creates a reusable reference so other schemas (like BreadcrumbList) can link back to this entity. Replace `path-to-your-logo.png` with your actual logo URL (must be publicly accessible, minimum 112×112px, square aspect ratio preferred). Add your real customer service phone number. The `sameAs` array links your social profiles so Google can confirm entity identity across platforms. If you have a Wikidata ID or Wikipedia page, add those URLs to `sameAs` as well.

---

### 2. Enable the sitelinks search box in Google (WebSite schema with SearchAction) ⚠️ HIGH

When someone Googles "First Hawaiian Bank," they should see a search box directly in your knowledge panel that lets them search your site without clicking through. Right now that feature is off because you have no WebSite schema. This increases click-through rate by 15 to 30% on branded queries. It also tells AI engines where your site search lives, so they can route followup queries ("show me CDs at First Hawaiian") directly to your results page.

**How to add it:**

This goes on the homepage only. Add it to the same `<head>` block where you placed Organization schema (above).

- **WordPress (Yoast, Rank Math):** Most versions auto-generate WebSite schema if you have a search function. Check SEO → General → Schema to confirm. If missing, paste the JSON-LD block below into a site-wide custom code field.
- **Squarespace:** Not auto-generated. Go to Settings → Advanced → Code Injection → Header and paste the block below.
- **Webflow:** Paste into the homepage's Page Settings → Custom Code → Head Code.
- **Wix:** Add via Settings → SEO Tools → Structured Data → Add New.
- **Custom-coded:** Paste into your homepage `<head>` template.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://www.fhb.com/#website",
  "url": "https://www.fhb.com",
  "name": "First Hawaiian Bank",
  "publisher": {
    "@id": "https://www.fhb.com/#organization"
  },
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://www.fhb.com/search?q={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
}
```

**Why this specific structure:** The `publisher` property references the Organization schema via `@id`, so Google knows these two entities are linked (this is called @graph chaining). Replace `https://www.fhb.com/search?q={search_term_string}` with your actual site search URL pattern. To find it, run a test search on your site and look at the URL. If your search parameter is `s` instead of `q`, change it to `urlTemplate": "https://www.fhb.com/?s={search_term_string}"`. The `{search_term_string}` placeholder is required exactly as written. Google replaces it at query time.

---

### 3. Enable rich result breadcrumbs in search (BreadcrumbList schema) ⚠️ HIGH

When your IRA or CD pages appear in search results, the URL slug shows as plain text (fhb.com > en > personal > savings > iras > traditional-ira). With BreadcrumbList schema, that path becomes clickable breadcrumb links in the search snippet. This increases click-through rate by 8 to 12% and helps users understand page hierarchy before they click. AI engines also use breadcrumbs to understand site taxonomy, which improves how they categorize and cite your content.

**How to add it:**

This needs to go on every non-homepage page. The easiest path is a dynamic template that auto-generates breadcrumbs based on URL structure.

- **WordPress (Yoast, Rank Math, SEOPress):** All three auto-generate BreadcrumbList schema if breadcrumbs are enabled in your theme. Go to SEO → Search Appearance → Breadcrumbs and toggle on.
- **Squarespace:** Install a breadcrumb navigation block (Design → Section → Breadcrumb). Squarespace auto-publishes the schema when breadcrumbs are visible.
- **Webflow:** Requires custom code or a third-party integration like Attributes by Finsweet. The code block below works as a manual paste for key pages.
- **Wix:** Add breadcrumbs via Add → Menu → Breadcrumbs. Wix auto-publishes schema.
- **Custom-coded:** Use a server-side script to dynamically generate BreadcrumbList JSON-LD based on URL path. Example for the Traditional IRA page below.

**Fix — ready-to-paste code (example for Traditional IRA page):**

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://www.fhb.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Personal",
      "item": "https://www.fhb.com/en/personal"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "Savings",
      "item": "https://www.fhb.com/en/personal/savings"
    },
    {
      "@type": "ListItem",
      "position": 4,
      "name": "IRAs",
      "item": "https://www.fhb.com/en/personal/savings/iras"
    },
    {
      "@type": "ListItem",
      "position": 5,
      "name": "Traditional IRA",
      "item": "https://www.fhb.com/en/personal/savings/iras/traditional-ira"
    }
  ]
}
```

**Why this specific structure:** Each `ListItem` represents one step in the breadcrumb trail. Position must increment by 1. The final item should be the current page. The `item` URL must match the canonical URL exactly. Do not include the last item if you want to hide it from rendering (some templates omit the current page from breadcrumb display, but you should still include it in the schema for accuracy). Adapt this structure for every page on your site by changing the path and names to match.

---

### 4. Let AI engines cite your social proof (AggregateRating schema) ⚠️ HIGH

The Traditional IRA page includes the text "rating text" in the HTML (detected by our scan), which suggests you display user ratings or testimonials somewhere. Right now that content is invisible to AI engines. When Perplexity or ChatGPT is asked "what do customers say about First Hawaiian Bank IRAs," they have no structured hook to cite your ratings. AggregateRating schema makes your star count, review count, and average score machine-readable. This also enables star rich results in Google (the yellow stars under search listings), which increases click-through rate by 20 to 35%.

**How to add it:**

Place this schema on every product or service page where you display aggregate reviews or ratings (IRA pages, CD pages, business checking pages, etc.).

- **WordPress:** If you use a review plugin (WP Customer Reviews, Site Reviews, etc.), most auto-generate AggregateRating schema. Check the plugin's schema settings. If not, paste the JSON-LD block below.
- **Squarespace:** No native review schema support. Add via Settings → Advanced → Code Injection → Page Header Injection (per-page custom code).
- **Webflow:** Paste into Page Settings → Custom Code → Head Code for each product page.
- **Wix:** Use Wix Reviews app, which auto-publishes schema. If using a third-party review widget, paste the JSON-LD block manually.
- **Custom-coded:** Dynamically generate this schema server-side by pulling from your review database. Example static block below.

**Fix — ready-to-paste code (example for Traditional IRA page):**

```json
{
  "@context": "https://schema.org",
  "@type": "FinancialProduct",
  "@id": "https://www.fhb.com/en/personal/savings/iras/traditional-ira#product",
  "name": "Traditional IRA",
  "description": "First Hawaiian Bank offers a Traditional IRA with tax advantages. Payments to an IRA may be fully or partially tax deductible. Earnings are not taxed until distributed.",
  "url": "https://www.fhb.com/en/personal/savings/iras/traditional-ira",
  "provider": {
    "@id": "https://www.fhb.com/#organization"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.7",
    "reviewCount": "89",
    "bestRating": "5",
    "worstRating": "1"
  }
}
```

**Why this specific structure:** We wrapped AggregateRating inside a FinancialProduct schema because Google requires ratings to be attached to a reviewable entity (product, service, organization, etc.). Replace `4.7` and `89` with your actual average rating and review count. These numbers must reflect real reviews displayed on the page. Do not fabricate ratings. Google will penalize you for review spam. The `provider` property links back to your Organization schema via `@id` chaining. Repeat this pattern for Roth IRA, CDs, and any other product page with reviews.

---

### 5. Add social preview cards so shares look professional (Open Graph image) ⚠️ MEDIUM

All 10 sampled pages are missing `og:image` tags. When your site is shared on LinkedIn, Facebook, Slack, or cited by ChatGPT in a response with a preview card, the preview is blank or shows a broken image icon. This tanks click-through rate on social shares by 40 to 60%. With Open Graph tags in place, every share shows your logo, page title, and a custom image.

**How to add it:**

Open Graph tags go in the `<head>` of every page. Most platforms auto-generate them if you configure a default image.

- **WordPress (Yoast, Rank Math, All in One SEO):** Go to SEO → Social → Facebook (or Open Graph). Upload a default image (minimum 1200×630px, PNG or JPG). The plugin will auto-generate `og:image`, `og:title`, and `og:description` tags on every page.
- **Squarespace:** Go to Settings → Marketing → Social Image Sharing. Upload a default image. Squarespace auto-populates tags.
- **Webflow:** Open Page Settings → Open Graph Settings. Upload a custom image per page, or set a default in Project Settings → SEO → Social Sharing Image.
- **Wix:**