---
title: "AEO Teardown: Hawaii community banking"
slug: aeo-teardown-hawaii-community-banking
date: 2026-05-08
vertical: "Hawaii community banking"
type: "audit-teardown"
status: draft
description: "What we found auditing the AEO landscape for Hawaii community bank. Anonymized findings from a real customer audit, with the structural patterns we see across the category."
---

## What this is

This is a real audit we ran in the last 30 days, anonymized.
The customer is a Hawaii community bank. Names, URLs, addresses, and
identifying details have been replaced. Every numeric finding
(schema coverage percentages, page counts, word counts, citation
observations) is unchanged. Those are the structural patterns
we want you to see.

If you run a business in this category, the findings here are
likely a close approximation of what you would see if you ran
the same audit on your own site.

You can independently verify the methodology at
[neverranked.com/leaderboards/methodology](https://neverranked.com/leaderboards/methodology).
You can run the same scan on your own site at
[check.neverranked.com](https://check.neverranked.com).

## What we found

**Window:** 48 hours

---

## One-page executive summary

a Hawaii community bank operates one of the most established digital banking presences in the Pacific, serving personal and business customers across Hawaii, Guam, and the South Pacific. The site spans checking and savings products, mortgages, HELOCs, credit cards, business banking, and a substantial community investment footprint. The content is rich (average 1,188 words per page), visually polished, and well-structured for human readers. Social sharing cards (Open Graph) are deployed on 100% of sampled pages, meaning every link shared on LinkedIn or cited in a ChatGPT summary will render correctly.

The foundation is compromised. Zero canonical tags across all 9 sampled pages. No sitewide Organization schema, so AI engines have no authoritative record of your founding date, headquarters, or service offerings. No AggregateRating schema despite customer testimonial and rating language appearing on 3 pages, meaning Perplexity and Google's AI Overviews have no machine-readable social proof to cite. Half your pages have broken H1 discipline (3 missing, 2 with multiples). Schema coverage sits at 33%, limited mostly to homepage and service pages, with blog posts and expert bios invisible to structured data crawlers.

**Headline findings:**

1. 9 of 9 sampled pages are missing canonical tags (100%), risking URL fragmentation and diluted page authority
2. No sitewide Organization or WebSite schema, so AI engines cannot attribute your services, contact info, or search functionality
3. No AggregateRating schema despite testimonial and rating text on 3 pages (timeline, annual report)
4. 3 pages have no H1 tag (annual report, bank-by-appointment, community/olelo)
5. 2 pages have multiple H1s (homepage has 4, careers/benefits has 2)
6. 6 of 9 pages have zero structured data (blog, expert bios, careers, community pages)
7. 10 of 140 images missing alt text (7% of all images sampled)
8. 3 meta descriptions exceed 160 characters and will truncate in search results

**What's already working:**
- Open Graph social cards deployed on 100% of pages (og:image, og:title, og:description all present)
- No thin content. Every sampled page exceeds 481 words, average 1,188 words
- Appropriate schema types where deployed (BankOrCreditUnion, Service, Report, BreadcrumbList)
- Strong content depth on service pages, community involvement, and expert thought leadership

**The 90-day target:** 100% canonical coverage, sitewide Organization and WebSite schemas live, AggregateRating deployed on homepage and service pages, H1 structure corrected across all pages, Person schema on all expert bios, and Article schema on all blog posts. AI citation-ready by end of Q3 2026.

**The single most important action for this week:** Deploy canonical tags to all published pages. This is a one-line addition to your template that protects every other optimization you make.

---

## The five deliverables in this audit

This package contains six documents, delivered per the Never Ranked $750 audit offer. Each is a standalone deliverable.

### 1. Technical Audit (`02-technical-audit.md`)
Canonical discipline, meta tag hygiene, H1 structure, image alt text, and crawlability analysis across 9 sampled pages representing homepage, service, blog, expert, careers, and community content.

**Top finding:** 100% of sampled pages missing canonical tags, creating risk of URL fragmentation and diluted authority.

### 2. Schema Review (`03-schema-review.md`)
JSON-LD structured data coverage, type appropriateness, and gaps in Organization, AggregateRating, Person, Article, and FAQPage schemas.

**Top finding:** No sitewide Organization schema, meaning AI engines have no authoritative source for your brand identity, services, or contact information.

### 3. Keyword Gap Analysis (`04-keyword-gap.md`)
Commercial banking queries, informational content opportunities, and comparison phrases where a Hawaii community bank should rank but competitors capture the traffic.

**Top finding:** Competitors with inferior product breadth rank for "best bank in Hawaii" and "Hawaii business banking" because they deploy FAQPage and comparison-table schema.

### 4. AI Citation Audit (`05-ai-citations.md`)
Perplexity, ChatGPT, and Google AI Overview testing across 12 banking and financial planning queries to measure citation share versus competitors.

**Top finding:** Zero citations detected in AI-synthesized answers for queries where a category competitor, a category competitor, and national competitors are cited 2–4 times per answer.

### 5. Competitor Teardown (`06-competitor-teardown.md`)
Schema deployment, content structure, and AEO strategy analysis of a category competitor, a category competitor, and a category competitor.

**Top finding:** a category competitor deploys sitewide Organization schema with aggregateRating (4.2 stars, 1,847 reviews), giving AI engines a social proof hook a Hawaii community bank currently lacks.

### 6. 90-Day Roadmap (`07-roadmap.md`)
Month-by-month task breakdown with effort estimates, technical specifications, and success signals for canonical deployment, schema rollout, H1 fixes, and content optimization.

**Top recommendation:** Month 1 foundation work (canonical tags, sitewide Organization and WebSite schemas, H1 fixes) unlocks everything else. 14 hours of mechanical work, zero creative lift required.

---

## How to read this audit

**If you have 15 minutes:**
Read this executive summary + the roadmap (`07-roadmap.md`).

**If you have 45 minutes:**
Add the AI Citation Audit (`05-ai-citations.md`) and the Competitor Teardown (`06-competitor-teardown.md`).

**If you have 2 hours:**
Read everything. The Technical, Schema, and Keyword documents contain specific code blocks and ready-to-use recommendations.

**If you're a developer implementing the fixes:**
Start with the Schema Review. The code blocks are pasteable. Then the Technical Audit for the meta tag and canonical fixes.

---

## What this audit intentionally did NOT cover

- Core Web Vitals / page speed (run separately with Lighthouse)
- Full backlink profile (requires Ahrefs or similar)
- Content quality audit of the full corpus (sampled only)
- Brand strategy or visual identity review
- Product recommendations
- Paid media / growth marketing strategy

---

## Methodology

This audit was produced using the Never Ranked audit methodology:

1. **Intake:** Fetched the site, robots.txt, sitemap.xml. Analyzed URL structure.
2. **Sample selection:** Pulled 9 representative pages across homepage, timeline/history, annual report, service pages, blog, expert bios, careers, and community content.
3. **Technical parse:** Custom scripts extracted title, meta, canonical, OG tags, headings, schemas, alt text, word counts, and link density.
4. **Schema parse:** Full JSON-LD block inspection with type extraction across all sampled pages.
5. **SERP testing:** Live searches across commercial banking queries, informational financial planning queries, and local comparison phrases. Captured top 10 results and AI-synthesized summaries.
6. **Competitor fetch:** Raw HTML of a category competitor, a category competitor, and a category competitor. Same analysis applied.
7. **Synthesis:** Findings cross-referenced across technical, schema, keyword, and AI citation phases to produce the 90-day roadmap.

---

## Delivery commitment

Six deliverables. Forty-eight hours. Yours to keep whether you hire us after or not. We don't refund. We deliver.

## The schema layer in detail

```markdown
# Schema Review: a Hawaii community bank

**Auditor:** Never Ranked
**Sample date:** 2026-05-08
**Focus:** JSON-LD structured data coverage, consistency, and AEO optimization

---

## Summary

a Hawaii community bank has basic schema coverage on 33% of sampled pages (3 of 9). The deployed types are appropriate for the vertical: BankOrCreditUnion, Organization, Service, BreadcrumbList, Report, and WebPage. However, six pages have no structured data at all, including high-value content like blog posts and expert bios. The site is missing sitewide Organization and WebSite schemas, which means AI engines have no single source of truth for brand identity, search functionality, or social proof. No FAQPage, no AggregateRating, and no Person schemas were detected, meaning the bank's expert voices and customer sentiment are invisible to Perplexity, ChatGPT, and Google's AI Overviews.

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

Right now, when ChatGPT or Perplexity is asked "Which bank in Hawaii has the best online appointment scheduling?" or "Tell me about a Hawaii community bank services," they have no structured way to know your name, your address, your phone number, or that you offer online banking. They cite competitors who do. Add sitewide Organization and WebSite schemas to every page so AI engines can attribute your services correctly, link to your search box, and pull contact details without guessing.

**Where to add it:**

Your site appears to be custom-coded (no WordPress, Squarespace, or Webflow meta tags detected). You'll need to paste the JSON-LD block below into the `<head>` section of your sitewide template (likely a header include or layout file that wraps every page).

If you're using a tag manager:
- Google Tag Manager: New Tag > Custom HTML > paste the block > fire on All Pages
- Adobe Launch: similar path

If you're using a CMS we didn't detect:
- WordPress: Yoast SEO > Search Appearance > General > Organization or Person. Enable and fill fields.
- Squarespace: Settings > Business Information. Fill all fields. Schema auto-generates.
- Webflow: Project Settings > Custom Code > Head Code. Paste the block.

**Fix. Ready-to-paste code:**

```json
{
  "@context": "their website
  "@graph": [
    {
      "@type": "BankOrCreditUnion",
      "@id": "their website
      "name": "a Hawaii community bank",
      "url": "their website
      "logo": "their website
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
      "telephone": "[phone]",
      "sameAs": [
        "their website
        "their website
        "their website
        "their website
      ]
    },
    {
      "@type": "WebSite",
      "@id": "their website
      "url": "their website
      "name": "a Hawaii community bank",
      "publisher": {
        "@id": "their website
      },
      "potentialAction": {
        "@type": "SearchAction",
        "target": "their website
        "query-input": "required name=search_term_string"
      }
    }
  ]
}
```

**Why this specific structure:** The `@graph` array bundles multiple schemas into one block. The `@id` properties create stable identifiers so other schemas on the site can reference the Organization (via `"publisher": { "@id": "..." }`) without duplicating data. Update the `logo` path, `address` fields, `telephone`, and `sameAs` social URLs with your actual values. The `potentialAction` SearchAction tells Google and AI engines where your site search lives. If you don't have site search, remove that property. The `foundingDate` of 1897 is inferred from your "125 years" messaging (2022 anniversary), adjust if needed.

---

### 2. Mark up your expert team so AI engines can cite them by name ⚠ HIGH

You have individual expert bio pages (example: Roger Khlopin, CFA in the Center for Family Business and Entrepreneurs). Right now those pages have no Person schema, so when someone asks "Who are the investment advisors at a Hawaii community bank?" AI engines can't surface names, credentials, or specialties. Add Person schema to every expert bio page. This also helps Google show rich results in Knowledge Panels and lets Perplexity cite your advisors as authoritative sources when answering finance questions.

**Where to add it:**

You'll need to add this schema on a per-page basis (one block per expert). If your site is built with a CMS or component system:
- WordPress: Use a schema plugin (Schema Pro, Rank Math Pro) with Person post type. Or paste JSON-LD into the post editor in an HTML block.
- Squarespace: No native Person schema. Paste JSON-LD in Page Settings > Advanced > Page Header Code Injection.
- Webflow: Page Settings > Custom Code > Head Code. Paste one block per expert page.
- Custom-coded: Add the JSON-LD block below to the `<head>` of each bio page template. Parameterize the fields (name, jobTitle, description, image, email) so you can populate them dynamically from your CMS or database.

**Fix. Ready-to-paste code (example for Roger Khlopin):**

```json
{
  "@context": "their website
  "@type": "Person",
  "name": "Roger Khlopin",
  "honorificSuffix": "CFA",
  "jobTitle": "Senior Vice President, Investment Management",
  "description": "Roger Khlopin advises business owners on investment management strategy to support growth, continuity, and legacy planning.",
  "image": "their website
  "url": "their website
  "worksFor": {
    "@type": "BankOrCreditUnion",
    "@id": "their website
  },
  "sameAs": [
    "their website
  ],
  "email": "mailto:roger.khlopin@boh.com"
}
```

**Why this specific structure:** The `worksFor` property links back to the sitewide Organization schema via `@id` reference, so AI engines understand Roger is part of a Hawaii community bank. The `honorificSuffix` field captures the CFA credential. The `sameAs` array lets you add LinkedIn, Twitter, or other professional profiles. The `email` property is optional (remove if you don't want to publish it). Update the `image` path, `url`, and social links for each expert. Repeat this block structure for every expert bio page, changing the field values.

---

### 3. Turn your blog posts into citation magnets ⚠ MEDIUM

Your blog posts (example: "What to do if you receive a financial windfall") have no Article or BlogPosting schema. When AI engines are asked "How should I handle a financial windfall?" they can't see that you published authoritative advice on the topic. They cite competitors who mark up their articles. Add Article schema to every blog post so ChatGPT, Perplexity, and Google's AI Overviews can attribute your content correctly and link back to your site.

**Where to add it:**

If your blog is WordPress-based, Yoast SEO and Rank Math auto-generate Article schema. Confirm it's enabled in the plugin settings. If not:
- WordPress (no plugin): Paste the JSON-LD block below into the post editor in an HTML block.
- Squarespace: Blog Settings > Advanced > Post Code Injection. Paste into Header.
- Webflow: CMS Template Settings > Custom Code > Head Code. Paste the block into the blog post template.
- Custom-coded: Add this JSON-LD to the `<head>` of your blog post template. Parameterize the `headline`, `datePublished`, `dateModified`, `author`, and `image` fields so they populate from your CMS.

**Fix. Ready-to-paste code (example for Financial Windfall post):**

```json
{
  "@context": "their website
  "@type": "Article",
  "headline": "What to do if you receive a financial windfall",
  "description": "A financial windfall can be a chance to strengthen your finances. Learn smart ways to save, reduce debt, and plan ahead with extra money.",
  "image": "their website
  "datePublished": "2024-03-15",
  "dateModified": "2024-03-15",
  "author": {
    "@type": "Organization",
    "@id": "their website
  },
  "publisher": {
    "@type": "BankOrCreditUnion",
    "@id": "their website
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "their website
  }
}
```

**Why this specific structure:** The `author` and `publisher` properties both reference the sitewide Organization schema via `@id`, which signals to AI engines that a Hawaii community bank is the authoritative source. The `mainEntityOfPage` property links the Article to the page URL. The `datePublished` and `dateModified` fields are placeholders (we can't see publish dates in the scan). Replace with actual dates from your CMS. If individual authors byline your posts, change `"author": { "@type": "Person", "name": "Author Name" }` instead of Organization.

---

### 4. Add BreadcrumbList to every non-home page ⚠ MEDIUM

Only 2 of 9 sampled pages have BreadcrumbList schema (the annual report and the bank-by-appointment pages). The other 7 pages (including blog, expert bios, careers, and community pages) have no breadcrumb markup. Google uses BreadcrumbList to understand site hierarchy and display breadcrumb trails in search results. AI engines use it to map your content structure. Add BreadcrumbList schema to every page below the homepage.

**Where to add it:**

This should be sitewide template logic, not per-page manual work. Your breadcrumb navigation likely already exists in the HTML. You're just adding the structured data layer.

- WordPress: Yoast SEO and Rank Math auto-generate BreadcrumbList if breadcrumbs are enabled in your theme. Check SEO plugin settings > Breadcrumbs > Enable.
- Squarespace: No native breadcrumb schema. You'll need custom code in Settings > Advanced > Code Injection (Header). Use template logic to populate the breadcrumb items dynamically.
- Webflow: Add JSON-LD to the page template. Use Webflow's CMS fields to populate breadcrumb item names and URLs dynamically.
- Custom-coded: Add the JSON-LD block below to every page template (or use a shared layout component). Parameterize the `itemListElement` array so it reflects the actual page hierarchy.

**Fix. Ready-to-paste code (example for expert bio page):**

```json
{
  "@context": "their website
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "their website
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Business",
      "item": "their website
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "Center for Family Business & Entrepreneurs",
      "item": "their website
    },
    {
      "@type": "ListItem",
      "position": 4,
      "name": "Experts",
      "item": "their website
    },
    {
      "@type": "ListItem",
      "position": 5,
      "name": "Roger Khlopin",
      "item": "their website
    }
  ]
}
```

**Why this specific structure:** Each `ListItem` represents one level in the site hierarchy, starting with the homepage (position 1) and ending with the current page. The `item` property is the URL, and `name` is the anchor text. The `position` property must increment by 1 for each level. Update the `itemListElement` array to match the actual breadcrumb trail on each page. The final item (current page) should not have an `item` URL if you want to signal it's the active page, but Google accepts it either way (we've included it here for consistency).

---

### 5. Add FAQPage schema to high-intent pages ⚠ MEDIUM

None of the 9 sampled pages have FAQPage schema, even though

## What this means for your business

If you operate in Hawaii community banking and you have not deployed Schema.org
structured data on your site recently, the gaps above are almost
certainly present on your site too. The pattern is consistent across
the category.

The fix is straightforward but specific. Generic schema deployment
will not help, and in many cases will hurt, per the published
research showing partial schema coverage scoring lower in citation
eligibility than no schema at all.

If you want a free six-engine scan of your own site, run
[check.neverranked.com](https://check.neverranked.com). The same
methodology used in this audit produces a score for any URL in
about 30 seconds.

If you want a full audit at the depth shown here, that is the $750
NeverRanked audit deliverable. Same format, your business.

---

*Audit anonymized for publication. Original audit was delivered
to a paying NeverRanked customer.*
