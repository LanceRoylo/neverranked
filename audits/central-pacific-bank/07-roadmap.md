# 90-Day Roadmap — Central Pacific Bank

**Auditor:** Never Ranked
**Delivered:** 2026-05-08
**Window:** Months 1–3 (by 2026-08-08)

---

## Premise

Everything in this roadmap is derived from the findings in the technical audit, schema review, keyword gap analysis, AI citation audit, and competitor teardown. Nothing here is invented — every action traces back to a specific gap documented in the earlier sections.

**Starting position (as of 2026-05-08):**
- 0 of 1 sampled pages have structured data of any kind
- 0 of 1 sampled pages have Open Graph tags (broken social previews and AI citations)
- 0 of 1 sampled pages have canonical tags (search engines cannot determine preferred URL)
- 8 competing H1 tags on homepage (heading structure is broken)
- 34 of 56 images missing alt text (accessibility and image search invisible)

**90-day target:**
- Organization and WebSite schema deployed site-wide (entity recognition live in Google Knowledge Graph)
- Open Graph and Twitter Card tags on all key pages (clean social previews and AI citation cards)
- Canonical tags on 100% of pages (duplicate content risk eliminated)
- Single H1 per page on homepage and all sampled templates (heading hierarchy fixed)
- Alt text on 100% of images on homepage and product pages (accessibility compliant and image search optimized)

---

## MONTH 1 — FOUNDATION (2026-05-08 – 2026-06-08)

### Theme
**Get visible to AI engines and fix the broken social preview problem.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 1.1 | Deploy Organization schema (BankOrCreditUnion type) site-wide via NeverRanked snippet | Schema Review, Finding 1 | 2 hours |
| 1.2 | Deploy WebSite schema with SearchAction for sitelinks search box | Schema Review, Finding 2 | 1 hour |
| 1.3 | Add Open Graph tags (og:title, og:description, og:image, og:type) to homepage template | Technical Audit, Finding 2 | 3 hours |
| 1.4 | Add Twitter Card tags (twitter:card, twitter:image) to homepage template | Technical Audit, Finding 2 | 1 hour |
| 1.5 | Add canonical tag to homepage and identify site-wide template for rollout | Technical Audit, Finding 3 | 2 hours |
| 1.6 | Write and deploy meta description for homepage (120-155 characters) | Technical Audit, Finding 4 | 1 hour |
| 1.7 | Audit homepage heading structure and consolidate to single H1 | Technical Audit, Finding 5 | 2 hours |
| 1.8 | Add alt text to all 34 images missing alt attributes on homepage | Technical Audit, Finding 6 | 4 hours |

**Subtotal: ~16 hours of mechanical work.**

### Stretch tasks
- Create and upload 1200×630 px branded Open Graph image for social shares
- Deploy BreadcrumbList schema on interior pages if site has multi-level navigation

### Success signal
At end of month 1:
- Google Rich Results Test shows valid Organization and WebSite schema on homepage
- LinkedIn and Slack preview cards show branded image and description when homepage URL is shared
- Homepage has single H1 and all images have descriptive alt text

---

## MONTH 2 — CONTENT CITATION HOOKS (2026-06-08 – 2026-07-08)

### Theme
**Build the structured data layer that makes CPB citable by AI engines in local and service queries.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 2.1 | Deploy FAQPage schema on any pages with Q&A content (products, services, support) | Schema Review, Finding 3 | 4 hours |
| 2.2 | Identify and mark up branch locations with LocalBusiness schema (per-location markup) | Schema Review (implied by BankOrCreditUnion context) | 6 hours |
| 2.3 | Add BreadcrumbList schema to interior pages (product pages, branch pages, resources) | Schema Review (red flag: no breadcrumb schema detected) | 3 hours |
| 2.4 | Roll out canonical tags site-wide to all templates (product, location, blog, legal) | Technical Audit, Finding 3 | 4 hours |
| 2.5 | Roll out Open Graph and Twitter Card tags to all key landing pages (products, branch pages) | Technical Audit, Finding 2 | 5 hours |

**Subtotal: ~22 hours.**

### Success signal
At end of month 2:
- At least 3 branch pages have valid LocalBusiness schema and appear in Google Rich Results Test
- FAQPage schema deployed on at least 2 high-traffic service pages and validated
- 100% of audited templates have canonical tags and Open Graph tags

---

## MONTH 3 — AUTHORITY + MEASUREMENT (2026-07-08 – 2026-08-08)

### Theme
**Close the remaining technical gaps and build a measurement layer to track AI citation and entity recognition.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 3.1 | Audit all images site-wide and add alt text to any remaining images missing attributes | Technical Audit, Finding 6 | 8 hours |
| 3.2 | Add AggregateRating schema to product or service pages if customer reviews exist | Schema Review (red flag: no AggregateRating detected) | 3 hours |
| 3.3 | Validate all deployed schema using Google Rich Results Test and Schema Markup Validator | Schema Review, technical detail sections | 2 hours |
| 3.4 | Set up Google Search Console property and submit sitemap with all schema-enhanced pages | Technical Audit (implied measurement step) | 2 hours |
| 3.5 | Establish baseline AI citation tracking (query CPB in ChatGPT, Perplexity, Gemini and document current citation rate) | Schema Review, Finding 1 (impact statement references AI citation) | 3 hours |

### Success signal
At end of month 3:
- All deployed schema types pass Google Rich Results Test with zero errors
- Google Search Console shows impressions for rich result types (FAQs, organization, sitelinks search box)
- Baseline AI citation report documents current state in 3 AI engines for 5 core queries

---

## Long-horizon view (months 4–6, not scheduled here)

- **Month 4:** Content expansion (publish 4-6 FAQ pages targeting "best bank in Hawaii for [X]" queries, mark up with FAQPage schema)
- **Month 5:** Review and rating aggregation (collect and publish customer testimonials, deploy Review schema on product pages)
- **Month 6:** Advanced entity linking (add sameAs references to Wikidata, Crunchbase, government filings, build out Knowledge Graph depth)

---

## The single most important action

If the client only has time to do ONE thing in the next 7 days, it's this:

**Deploy Organization schema (BankOrCreditUnion type) on the homepage using the JSON-LD block from Schema Review Finding 1. This is the foundation for all entity recognition, Knowledge Panel eligibility, and AI citation. Every other schema type references this anchor.**

---

## Expected outcomes by the end of the 90 days

**Realistic case:**
- Central Pacific Bank appears as a known entity in Google Knowledge Graph
- Social shares show branded preview cards with image and description
- At least 1 AI engine (ChatGPT, Perplexity, or Gemini) cites CPB in response to "banks in Hawaii" query

**Optimistic case:**
- CPB appears in Google local pack for "banks near me" queries in Honolulu
- FAQ rich results appear in Google SERP for at least 2 product-related queries
- 2 or more AI engines cite CPB with structured details (address, services, hours) in answer cards

**Conservative case:**
- All technical gaps fixed (canonical tags, Open Graph, single H1, alt text complete)
- Organization and WebSite schema validated with zero errors in Google Rich Results Test
- Baseline measurement established for AI citation tracking in future quarters