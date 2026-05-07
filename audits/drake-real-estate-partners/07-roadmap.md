# 90-Day Roadmap — Drake Real Estate Partners

**Auditor:** Never Ranked
**Delivered:** 2026-05-07
**Window:** Months 1–3 (by 2026-08-07)

---

## Premise

Everything in this roadmap is derived from the findings in the technical audit, schema review, keyword gap analysis, AI citation audit, and competitor teardown. Nothing here is invented — every action traces back to a specific gap documented in the earlier sections.

**Starting position (as of 2026-05-07):**
- 0 of 1 sampled pages have canonical tags
- 0 of 1 sampled pages have any schema markup
- 0 of 1 sampled pages have H1 tags
- 1 of 1 images missing alt text (100%)
- Homepage has 4 words of body content (thin content, no heading structure)

**90-day target:**
- Organization and WebSite schema deployed on homepage and all core pages
- All pages have self-referencing canonical tags
- All pages have proper H1/H2/H3 hierarchy
- All images have descriptive alt text
- Homepage has 500+ words of content with clear value proposition and service descriptions

---

## MONTH 1 — FOUNDATION (2026-05-07 – 2026-06-07)

### Theme
**Fix the skeleton. Add schema, canonicals, H1 structure, and make the homepage functional.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 1.1 | Add Organization schema to homepage with name, logo, url, address, contactPoint, and sameAs | Schema Review, Section 1 | 1 hour |
| 1.2 | Add WebSite schema to homepage with SearchAction (or without potentialAction if no search exists) | Schema Review, Section 2 | 0.5 hours |
| 1.3 | Add self-referencing canonical tag to homepage (`<link rel="canonical" href="https://drakerep.com" />`) | Technical Audit, Section 2 | 0.25 hours |
| 1.4 | Write and deploy H1 tag on homepage (e.g., "Drake Real Estate Partners — Value-Add Real Estate Investments") | Technical Audit, Section 3 | 0.5 hours |
| 1.5 | Expand title tag from 26 to 50-60 characters (e.g., "Drake Real Estate Partners — Value-Add Investments in U.S. Markets") | Technical Audit, Section 4 | 0.25 hours |
| 1.6 | Add alt text to the 1 image on homepage with descriptive, keyword-appropriate text | Technical Audit, Section 5 | 0.25 hours |
| 1.7 | Write 500+ words of homepage body content: intro paragraph, investment focus, markets served, differentiators | Technical Audit, Section 6 | 3 hours |
| 1.8 | Add H2 subheadings to homepage content (e.g., "Investment Focus," "Markets," "Our Approach") | Technical Audit, Section 3 | 0.5 hours |

**Subtotal: ~6.25 hours of mechanical work.**

### Stretch tasks
- Add og:image and twitter:image tags with a branded 1200x630 social card
- Create a simple internal linking structure if other pages exist (portfolio, team, contact)

### Success signal
At end of month 1:
- Google Search Console shows Organization schema validated with zero errors
- Homepage has H1, H2 structure visible in rendered HTML
- Homepage title tag appears in SERPs with full 50+ character text

---

## MONTH 2 — CONTENT CITATION HOOKS (2026-06-07 – 2026-07-07)

### Theme
**Build citable content pages and extend schema to all major templates.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 2.1 | Create "Investment Strategy" page (800+ words) explaining value-add and opportunistic focus, criteria, and case studies | Technical Audit (thin content finding) | 4 hours |
| 2.2 | Create "Markets" page listing U.S. markets served, with geographic focus and market commentary | Technical Audit (external link finding, AEO authority) | 3 hours |
| 2.3 | Add BreadcrumbList schema to all interior pages (Investment Strategy, Markets, Team, etc.) | Schema Review (BreadcrumbList missing) | 1 hour |
| 2.4 | Add FAQPage schema to Investment Strategy page with 5-7 investor FAQs (e.g., "What is value-add real estate?") | Schema Review (FAQPage missing) | 2 hours |
| 2.5 | Link from homepage to new content pages and ensure all pages have canonical tags and H1 structure | Technical Audit, Section 2 and 3 | 1 hour |

**Subtotal: ~11 hours.**

### Success signal
At end of month 2:
- 3-5 content pages live with H1, canonical, and schema markup
- FAQPage schema validated in Google Search Console with zero errors

---

## MONTH 3 — AUTHORITY + MEASUREMENT (2026-07-07 – 2026-08-07)

### Theme
**Add external authority signals, track indexing, and measure structured data coverage.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 3.1 | Secure 3-5 relevant external backlinks (industry publications, partner sites, directories) to address low external link count | Technical Audit, Section 8 | 5 hours |
| 3.2 | Add 2-3 outbound links per page to authoritative sources (NCREIF, Urban Land Institute, market data sources) | Technical Audit, Section 8 | 1 hour |
| 3.3 | Set up Google Search Console and submit sitemap with all new pages | Technical Audit (indexing baseline) | 0.5 hours |
| 3.4 | Run schema validator on all pages and fix any errors or warnings | Schema Review (validation check) | 1 hour |
| 3.5 | Document baseline metrics: indexed pages, schema coverage, H1 coverage, canonical coverage | Technical Audit (starting position) | 0.5 hours |

### Success signal
At end of month 3:
- All core pages indexed in Google Search Console
- Schema coverage at 100% for Organization, WebSite, BreadcrumbList, FAQPage across sampled pages

---

## Long-horizon view (months 4–6, not scheduled here)

- **Month 4:** Launch case study pages with portfolio examples and add AggregateRating schema if testimonials exist
- **Month 5:** Build thought leadership content (blog or insights section) targeting investor education keywords
- **Month 6:** Add video content (team intros, market overviews) with VideoObject schema and YouTube embedding

---

## The single most important action

If the client only has time to do ONE thing in the next 7 days, it's this:

**Add Organization schema to the homepage (Section 1 of Schema Review, ready-to-paste code provided). This unblocks entity recognition, Knowledge Panel eligibility, and gives LLMs a structured profile to cite. Without this, Drake Real Estate Partners does not exist as a named entity in the eyes of search engines and AI answer engines.**

---

## Expected outcomes by the end of the 90 days

**Realistic case:**
- Homepage and 3-5 core pages fully structured with schema, canonicals, H1 hierarchy, and 500+ words per page
- Organization schema validated and surfacing in Google Knowledge Graph API
- 5-10 new backlinks from industry-relevant sources

**Optimistic case:**
- All core pages indexed and eligible for rich results (FAQPage snippets, sitelinks search box)
- Homepage ranking for branded queries with rich Knowledge Panel
- 1-2 unlinked brand mentions converted to citations in Perplexity or ChatGPT

**Conservative case:**
- Homepage schema deployed and validated with zero errors
- H1 and canonical coverage at 100% across sampled pages
- Content word count increased from 4 to 2,000+ across site