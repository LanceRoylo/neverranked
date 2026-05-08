```markdown
# Schema Review — Bank of Hawaii

**Auditor:** Never Ranked
**Sample date:** 2026-05-08
**Focus:** JSON-LD structured data coverage, consistency, and AEO optimization

---

## Summary

Bank of Hawaii has basic schema coverage on 33% of sampled pages (3 of 9). The deployed types are appropriate for the vertical: BankOrCreditUnion, Organization, Service, BreadcrumbList, Report, and WebPage. However, six pages have no structured data at all, including high-value content like blog posts and expert bios. The site is missing sitewide Organization and WebSite schemas, which means AI engines have no single source of truth for brand identity, search functionality, or social proof. No FAQPage, no AggregateRating, and no Person schemas were detected, meaning the bank's expert voices and customer sentiment are invisible to Perplexity, ChatGPT, and Google's AI Overviews.

**Schema grade: C** (Present where it matters most, home and service pages, but missing sitewide identity layer and content-type-specific schemas on blog, experts, and timeline pages)

---

## What exists today

| Page type | FAQPage | Organization | Article | BankOrCreditUnion | BreadcrumbList | Service | Person |
|---|---|---|---|---|---|---|---|
| Homepage | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| Timeline (125 years) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Annual Report | ✗ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Service page (Bank by Appointment) | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ |
| Blog post (Financial Windfall) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Expert bio (Roger Khlopin) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Careers | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Community page (Olelo) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Community news | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

---

## Findings

### 1. Tell AI engines who you are and where to send customers ⚠ HIGH

Right now, when ChatGPT or Perplexity is asked "Which bank in Hawaii has the best online appointment scheduling?" or "Tell me about Bank of Hawaii's services," they have no structured way to know your name, your address, your phone number, or that you offer online banking. They cite competitors who do. Add sitewide Organization and WebSite schemas to every page so AI engines can attribute your services correctly, link to your search box, and pull contact details without guessing.

**Where to add it:**

Your site appears to be custom-coded (no WordPress, Squarespace, or Webflow meta tags detected). You'll need to paste the JSON-LD block below into the `<head>` section of your sitewide template (likely a header include or layout file that wraps every page).

If you're using a tag manager:
- Google Tag Manager: New Tag > Custom HTML > paste the block > fire on All Pages
- Adobe Launch: similar path

If you're using a CMS we didn't detect:
- WordPress: Yoast SEO > Search Appearance > General > Organization or Person. Enable and fill fields.
- Squarespace: Settings > Business Information. Fill all fields. Schema auto-generates.
- Webflow: Project Settings > Custom Code > Head Code. Paste the block.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BankOrCreditUnion",
      "@id": "https://www.boh.com/#organization",
      "name": "Bank of Hawaii",
      "url": "https://www.boh.com",
      "logo": "https://www.boh.com/path-to-your-logo.png",
      "description": "The local bank with the most digital options for personal and business banking, mortgages, HELOCs, credit cards, personal loans and more. Serving our community for 125 years.",
      "foundingDate": "1897",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "130 Merchant Street",
        "addressLocality": "Honolulu",
        "addressRegion": "HI",
        "postalCode": "96813",
        "addressCountry": "US"
      },
      "telephone": "+1-888-643-3888",
      "sameAs": [
        "https://www.facebook.com/bankofhawaii",
        "https://twitter.com/bankofhawaii",
        "https://www.linkedin.com/company/bank-of-hawaii",
        "https://www.instagram.com/bankofhawaii"
      ]
    },
    {
      "@type": "WebSite",
      "@id": "https://www.boh.com/#website",
      "url": "https://www.boh.com",
      "name": "Bank of Hawaii",
      "publisher": {
        "@id": "https://www.boh.com/#organization"
      },
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://www.boh.com/search?q={search_term_string}",
        "query-input": "required name=search_term_string"
      }
    }
  ]
}
```

**Why this specific structure:** The `@graph` array bundles multiple schemas into one block. The `@id` properties create stable identifiers so other schemas on the site can reference the Organization (via `"publisher": { "@id": "..." }`) without duplicating data. Update the `logo` path, `address` fields, `telephone`, and `sameAs` social URLs with your actual values. The `potentialAction` SearchAction tells Google and AI engines where your site search lives. If you don't have site search, remove that property. The `foundingDate` of 1897 is inferred from your "125 years" messaging (2022 anniversary), adjust if needed.

---

### 2. Mark up your expert team so AI engines can cite them by name ⚠ HIGH

You have individual expert bio pages (example: Roger Khlopin, CFA in the Center for Family Business and Entrepreneurs). Right now those pages have no Person schema, so when someone asks "Who are the investment advisors at Bank of Hawaii?" AI engines can't surface names, credentials, or specialties. Add Person schema to every expert bio page. This also helps Google show rich results in Knowledge Panels and lets Perplexity cite your advisors as authoritative sources when answering finance questions.

**Where to add it:**

You'll need to add this schema on a per-page basis (one block per expert). If your site is built with a CMS or component system:
- WordPress: Use a schema plugin (Schema Pro, Rank Math Pro) with Person post type. Or paste JSON-LD into the post editor in an HTML block.
- Squarespace: No native Person schema. Paste JSON-LD in Page Settings > Advanced > Page Header Code Injection.
- Webflow: Page Settings > Custom Code > Head Code. Paste one block per expert page.
- Custom-coded: Add the JSON-LD block below to the `<head>` of each bio page template. Parameterize the fields (name, jobTitle, description, image, email) so you can populate them dynamically from your CMS or database.

**Fix — ready-to-paste code (example for Roger Khlopin):**

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Roger Khlopin",
  "honorificSuffix": "CFA",
  "jobTitle": "Senior Vice President, Investment Management",
  "description": "Roger Khlopin advises business owners on investment management strategy to support growth, continuity, and legacy planning.",
  "image": "https://www.boh.com/path-to-roger-khlopin-photo.jpg",
  "url": "https://www.boh.com/business/center-for-family-business-and-entrepreneurs/experts/roger-khlopin",
  "worksFor": {
    "@type": "BankOrCreditUnion",
    "@id": "https://www.boh.com/#organization"
  },
  "sameAs": [
    "https://www.linkedin.com/in/rogerkhlopin"
  ],
  "email": "mailto:roger.khlopin@boh.com"
}
```

**Why this specific structure:** The `worksFor` property links back to the sitewide Organization schema via `@id` reference, so AI engines understand Roger is part of Bank of Hawaii. The `honorificSuffix` field captures the CFA credential. The `sameAs` array lets you add LinkedIn, Twitter, or other professional profiles. The `email` property is optional (remove if you don't want to publish it). Update the `image` path, `url`, and social links for each expert. Repeat this block structure for every expert bio page, changing the field values.

---

### 3. Turn your blog posts into citation magnets ⚠ MEDIUM

Your blog posts (example: "What to do if you receive a financial windfall") have no Article or BlogPosting schema. When AI engines are asked "How should I handle a financial windfall?" they can't see that you published authoritative advice on the topic. They cite competitors who mark up their articles. Add Article schema to every blog post so ChatGPT, Perplexity, and Google's AI Overviews can attribute your content correctly and link back to your site.

**Where to add it:**

If your blog is WordPress-based, Yoast SEO and Rank Math auto-generate Article schema. Confirm it's enabled in the plugin settings. If not:
- WordPress (no plugin): Paste the JSON-LD block below into the post editor in an HTML block.
- Squarespace: Blog Settings > Advanced > Post Code Injection. Paste into Header.
- Webflow: CMS Template Settings > Custom Code > Head Code. Paste the block into the blog post template.
- Custom-coded: Add this JSON-LD to the `<head>` of your blog post template. Parameterize the `headline`, `datePublished`, `dateModified`, `author`, and `image` fields so they populate from your CMS.

**Fix — ready-to-paste code (example for Financial Windfall post):**

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "What to do if you receive a financial windfall",
  "description": "A financial windfall can be a chance to strengthen your finances. Learn smart ways to save, reduce debt, and plan ahead with extra money.",
  "image": "https://www.boh.com/path-to-article-featured-image.jpg",
  "datePublished": "2024-03-15",
  "dateModified": "2024-03-15",
  "author": {
    "@type": "Organization",
    "@id": "https://www.boh.com/#organization"
  },
  "publisher": {
    "@type": "BankOrCreditUnion",
    "@id": "https://www.boh.com/#organization"
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://www.boh.com/blog/what-to-do-if-you-receive-a-financial-windfall"
  }
}
```

**Why this specific structure:** The `author` and `publisher` properties both reference the sitewide Organization schema via `@id`, which signals to AI engines that Bank of Hawaii is the authoritative source. The `mainEntityOfPage` property links the Article to the page URL. The `datePublished` and `dateModified` fields are placeholders (we can't see publish dates in the scan). Replace with actual dates from your CMS. If individual authors byline your posts, change `"author": { "@type": "Person", "name": "Author Name" }` instead of Organization.

---

### 4. Add BreadcrumbList to every non-home page ⚠ MEDIUM

Only 2 of 9 sampled pages have BreadcrumbList schema (the annual report and the bank-by-appointment pages). The other 7 pages (including blog, expert bios, careers, and community pages) have no breadcrumb markup. Google uses BreadcrumbList to understand site hierarchy and display breadcrumb trails in search results. AI engines use it to map your content structure. Add BreadcrumbList schema to every page below the homepage.

**Where to add it:**

This should be sitewide template logic, not per-page manual work. Your breadcrumb navigation likely already exists in the HTML. You're just adding the structured data layer.

- WordPress: Yoast SEO and Rank Math auto-generate BreadcrumbList if breadcrumbs are enabled in your theme. Check SEO plugin settings > Breadcrumbs > Enable.
- Squarespace: No native breadcrumb schema. You'll need custom code in Settings > Advanced > Code Injection (Header). Use template logic to populate the breadcrumb items dynamically.
- Webflow: Add JSON-LD to the page template. Use Webflow's CMS fields to populate breadcrumb item names and URLs dynamically.
- Custom-coded: Add the JSON-LD block below to every page template (or use a shared layout component). Parameterize the `itemListElement` array so it reflects the actual page hierarchy.

**Fix — ready-to-paste code (example for expert bio page):**

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://www.boh.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Business",
      "item": "https://www.boh.com/business"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "Center for Family Business & Entrepreneurs",
      "item": "https://www.boh.com/business/center-for-family-business-and-entrepreneurs"
    },
    {
      "@type": "ListItem",
      "position": 4,
      "name": "Experts",
      "item": "https://www.boh.com/business/center-for-family-business-and-entrepreneurs/experts"
    },
    {
      "@type": "ListItem",
      "position": 5,
      "name": "Roger Khlopin",
      "item": "https://www.boh.com/business/center-for-family-business-and-entrepreneurs/experts/roger-khlopin"
    }
  ]
}
```

**Why this specific structure:** Each `ListItem` represents one level in the site hierarchy, starting with the homepage (position 1) and ending with the current page. The `item` property is the URL, and `name` is the anchor text. The `position` property must increment by 1 for each level. Update the `itemListElement` array to match the actual breadcrumb trail on each page. The final item (current page) should not have an `item` URL if you want to signal it's the active page, but Google accepts it either way (we've included it here for consistency).

---

### 5. Add FAQPage schema to high-intent pages ⚠ MEDIUM

None of the 9 sampled pages have FAQPage schema, even though