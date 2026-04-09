# Schema Review — Montaic.com

**Auditor:** Never Ranked
**Sample date:** April 9, 2026
**Focus:** JSON-LD structured data coverage, consistency, and AEO optimization

---

## Summary

Schema coverage on Montaic is **above average for a SaaS** but has systematic gaps that are costing AI citations. The good: FAQPage is well-used across tools, markets, and comparison pages; SoftwareApplication exists on commercial pages with legitimate Offer arrays; the pricing page uses `priceSpecification` with unit pricing correctly. The bad: no Organization schema site-wide, no BreadcrumbList anywhere, no HowTo on tool pages, no Review or AggregateRating, no Person author on blog posts, and the free listing generator has **zero schema at all**.

**Schema grade: C+** (good building blocks, critical gaps)

---

## What exists today

| Page type | FAQPage | SoftwareApplication | Article | Organization | BreadcrumbList | HowTo | Review |
|---|---|---|---|---|---|---|---|
| Homepage | ✓ | ✓ | — | ✗ | ✗ | ✗ | ✗ |
| Pricing | ✗ | ✓ | — | ✗ | ✗ | ✗ | ✗ |
| Free grader | ✗ | ✗ | — | ✗ | ✗ | ✗ | ✗ |
| Blog posts | — | — | ✓ minimal | ✗ | ✗ | — | ✗ |
| Tool pages | ✓ | ✓ | — | ✗ | ✗ | ✗ | ✗ |
| Market pages | ✓ | ✓ | — | ✗ | ✗ | ✗ | ✗ |
| Compare pages | ✓ | ✗ | — | ✗ | ✗ | ✗ | ✗ |

---

## Findings

### 1. No Organization schema site-wide ⚠ CRITICAL

This is the most important gap. Every site should have a single Organization schema block in the site-wide layout (`<head>` of the root template). It tells Google and AI engines: *this is the company, here's the logo, here's who runs it, here's where to find it.*

**Current:** None. The blog post's Article schema references an Organization inline, but it's minimal (just name + URL). There's no standalone Organization.

**Fix — add to the root layout:**

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://montaic.com/#organization",
  "name": "Montaic",
  "url": "https://montaic.com",
  "logo": {
    "@type": "ImageObject",
    "url": "https://montaic.com/logo.png",
    "width": 512,
    "height": 512
  },
  "description": "AI-native listing content platform for real estate agents and yacht brokers.",
  "foundingDate": "2025",
  "founder": {
    "@type": "Person",
    "name": "Lance Roylo",
    "url": "https://montaic.com/about"
  },
  "sameAs": [
    "https://www.linkedin.com/company/montaic",
    "https://twitter.com/montaic",
    "https://www.instagram.com/montaic"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer support",
    "email": "support@montaic.com"
  }
}
```

**Why this matters:** AI engines use Organization schema to build entity profiles. Without it, ChatGPT and Perplexity have to guess what Montaic is. With it, they get a clean fact sheet they can cite from directly.

---

### 2. No BreadcrumbList anywhere ⚠ HIGH

A site with 222 URLs organized into tools, markets, marine, blog, and compare categories is begging for breadcrumbs. Google shows them in SERPs as rich results, and AI engines use them to understand hierarchy.

**Fix — add BreadcrumbList per page type:**

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://montaic.com"},
    {"@type": "ListItem", "position": 2, "name": "Tools", "item": "https://montaic.com/tools"},
    {"@type": "ListItem", "position": 3, "name": "MLS Description Generator", "item": "https://montaic.com/tools/mls-description-generator"}
  ]
}
```

This is trivial to template per page type. High ROI.

---

### 3. No WebSite schema with SearchAction ⚠ HIGH

The WebSite schema with a potentialAction enables the search box rich result in Google and helps AI engines understand site navigation.

**Fix — add to root layout:**

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://montaic.com/#website",
  "url": "https://montaic.com",
  "name": "Montaic",
  "publisher": {"@id": "https://montaic.com/#organization"},
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://montaic.com/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

(You'll need a working site search endpoint — if `/search?q=` doesn't exist yet, this is also a product feature worth building.)

---

### 4. HowTo schema missing on every tool page ⚠ HIGH

Tool pages describe a process: "Enter your property details → Get your MLS description." That's a textbook use case for HowTo schema, which Google surfaces in rich results and AI engines cite directly when users ask "how to write an MLS listing."

**Fix — add to each tool page:**

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How to generate an MLS listing description with Montaic",
  "description": "Generate a compliant, voice-matched MLS listing description in 30 seconds.",
  "step": [
    {"@type": "HowToStep", "position": 1, "name": "Enter property details", "text": "Input address, bed/bath count, square footage, and key features."},
    {"@type": "HowToStep", "position": 2, "name": "Pick your voice profile", "text": "Select your saved voice profile or upload a past listing to calibrate."},
    {"@type": "HowToStep", "position": 3, "name": "Generate", "text": "Montaic produces an MLS-compliant description, Fair Housing checked, in your voice."},
    {"@type": "HowToStep", "position": 4, "name": "Review and copy", "text": "Edit any line, regenerate sections, or copy straight to your MLS system."}
  ],
  "totalTime": "PT30S",
  "tool": [{"@type": "HowToTool", "name": "Montaic"}]
}
```

**Why this matters:** "How to write a listing description" is a high-volume informational query. AI engines cite HowTo-marked content preferentially because it's already structured for their answers.

---

### 5. No Review or AggregateRating anywhere ⚠ HIGH

This is the single biggest credibility gap. Montaic is a SaaS with (presumably) real customers. Without any Review or AggregateRating markup, AI engines have no way to say "customers rate this 4.8/5" when someone asks "is Montaic any good?"

**Fix — add AggregateRating to the SoftwareApplication block on the homepage and pricing page:**

```json
{
  "@type": "SoftwareApplication",
  "name": "Montaic",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": 47,
    "bestRating": "5"
  }
}
```

**Requirement:** You need actual reviews to back this up. Use real ones. If you don't have 5+ yet, email your first users and ask. Even 8-12 real reviews dramatically change how AI engines describe the product.

**Alternative:** Individual Review blocks on the pricing page with real customer quotes. These can be pulled into AI answers directly.

---

### 6. Blog post Article schema is thin ⚠ MEDIUM

Current blog schema has only: headline, description, dates, author (org), publisher, mainEntityOfPage.

**Missing fields that AI engines use:**
- `image` — hero image URL (required for Google News / Discover eligibility)
- `author` should be a `Person`, not just an `Organization` name
- `wordCount`
- `articleBody` (optional but good for LLMs)
- `articleSection` (e.g., "Real Estate Marketing")
- `keywords`
- `isAccessibleForFree: true`
- `@type` should be `BlogPosting` for specificity

**Fix — upgrade the Article block:**

```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "@id": "https://montaic.com/blog/best-ai-listing-description-generator#article",
  "headline": "...",
  "description": "...",
  "image": "https://montaic.com/blog/best-ai-listing-description-generator/og.jpg",
  "datePublished": "2026-02-10",
  "dateModified": "2026-02-10",
  "wordCount": 2103,
  "keywords": ["AI listing description", "real estate AI tools", "MLS copy generator"],
  "articleSection": "Real Estate Marketing",
  "isAccessibleForFree": true,
  "author": {
    "@type": "Person",
    "name": "Lance Roylo",
    "url": "https://montaic.com/about",
    "jobTitle": "Founder, Montaic"
  },
  "publisher": {"@id": "https://montaic.com/#organization"},
  "mainEntityOfPage": "https://montaic.com/blog/best-ai-listing-description-generator"
}
```

---

### 7. Free Listing Generator has zero schema ⚠ CRITICAL

Already flagged in the technical audit. Schema needed:

- `SoftwareApplication` (or more specific `WebApplication`) with `offers: {price: 0}` and `isAccessibleForFree: true`
- `HowTo` with the 3-step grader process
- `FAQPage` with 6-8 questions
- `BreadcrumbList`

---

### 8. No @graph relationships ⚠ MEDIUM

All schema blocks are standalone. Best practice is to use `@graph` at the site level with `@id` references so the Organization, WebSite, and per-page schemas are linked.

**Fix:** Wrap site-wide schemas (Organization, WebSite) in a single `@graph` block and reference them from per-page schemas via `@id`:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {"@type": "Organization", "@id": "https://montaic.com/#organization", ...},
    {"@type": "WebSite", "@id": "https://montaic.com/#website", "publisher": {"@id": "https://montaic.com/#organization"}, ...}
  ]
}
```

Then on a tool page, the SoftwareApplication references the organization:

```json
{
  "@type": "SoftwareApplication",
  "publisher": {"@id": "https://montaic.com/#organization"}
}
```

This lets AI engines traverse the entity graph rather than guessing what links to what.

---

### 9. Comparison pages missing SoftwareApplication ⚠ MEDIUM

The `/compare/montaic-vs-chatgpt` page has FAQPage but no SoftwareApplication for Montaic itself. Comparison pages are high-intent commercial queries ("is Montaic better than ChatGPT for real estate") and should have the full SaaS markup.

---

### 10. No Product schema on listing-type tool variants ⚠ LOW

The listing generator has 25+ subtype pages (luxury, waterfront, commercial, etc.). These could each be Product schema instances with unique descriptions and target audiences. Current implementation reuses the same SoftwareApplication.

This is a nice-to-have, not a critical fix.

---

## Priority list (schema)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Add Organization schema site-wide | CRITICAL | LOW |
| 2 | Add WebSite schema with SearchAction | HIGH | LOW (needs search endpoint) |
| 3 | Add BreadcrumbList to every non-home page | HIGH | MEDIUM |
| 4 | Add HowTo schema to all tool pages | HIGH | MEDIUM |
| 5 | Add AggregateRating + real Reviews | HIGH | MEDIUM (needs actual reviews) |
| 6 | Add schema to /free-listing-generator | CRITICAL | LOW |
| 7 | Upgrade blog Article → BlogPosting with Person author | MEDIUM | MEDIUM |
| 8 | Add SoftwareApplication to compare pages | MEDIUM | LOW |
| 9 | Wrap site-wide schemas in @graph with @id refs | MEDIUM | LOW |
| 10 | Add Product schema to listing-type variants | LOW | MEDIUM |
