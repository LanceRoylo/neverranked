# The Ward Village Audit

**Prepared for:** Ward Village (Howard Hughes)
**Prepared by:** Never Ranked
**Date:** 2026-05-08
**Deliverable type:** $750 Audit — full SEO & AEO
**Window:** 48 hours

---

## One-page executive summary

Ward Village is a master-planned mixed-use community in Honolulu. The site markets luxury condos, retail spaces, dining, and public art. It serves three audiences: prospective condo buyers, real estate brokers, and visitors exploring the neighborhood. The site is well-structured with clear navigation across property pages, amenity pages, cultural content, and broker resources. The technical foundation is strong (100% canonical coverage, JSON-LD on every page, good crawlability). The gaps are in entity recognition and social proof signals.

The core finding: **Ward Village has no Organization schema on any sampled page.** Google, ChatGPT, and Perplexity cannot recognize Ward Village as a business entity. They see pages, not a company. When someone asks "Who owns Ward Village?" or searches for "Howard Hughes developments Honolulu," AI engines have no structured hook to cite your name, location, or parent organization. You are invisible as an entity. Competitors with Organization schema get cited. You do not.

**Headline findings:**

1. 0 of 10 sampled pages have Organization schema (no entity recognition active for Google Knowledge Graph or AI citation)
2. 3 of 10 pages missing og:image tags (30% of social shares and AI preview cards show blank thumbnails)
3. 0 pages have AggregateRating schema (testimonial text appears on 7 pages but is invisible to AI engines that cite star ratings)
4. 5 of 10 pages have broken H1 structure (3 pages have zero H1s, 2 pages have multiple H1s, confusing page-topic clarity)
5. 6 of 10 pages missing meta descriptions or have descriptions over 160 characters (truncated or absent in search results)
6. 4 of 10 pages have title tags under 30 characters (underoptimized for keyword inclusion and click appeal)
7. 2 of 10 pages have under 300 words (thin content signals to Google that pages lack depth)
8. Average 19.3 external links per page (high outbound link density may dilute PageRank flow to internal pages)

**What's already working:**
- 100% canonical tag coverage (10 of 10 pages have proper canonical tags, preventing duplicate content issues)
- JSON-LD structured data present on every page (BreadcrumbList on all 10 pages, WebSite schema site-wide, ImageObject on 6 pages)
- Strong alt text hygiene (203 of 205 images have alt attributes, only 2 missing)
- Article schema deployed correctly on blog content (the Ossipoff article includes Article and Person schema with proper authorship markup)

**The 90-day target:** Organization schema live site-wide, 100% og:image coverage, AggregateRating schema deployed on homepage, all H1s and meta tags fixed, and entity recognition active in Google Knowledge Graph.

**The single most important action for this week:** Deploy Organization schema with name, logo, address, parent organization (Howard Hughes), and social profiles. This unlocks entity recognition for every AI citation engine.

---

## The five deliverables in this audit

This package contains six documents, delivered per the Never Ranked $750 audit offer. Each is a standalone deliverable.

### 1. Technical Audit (`02-technical-audit.md`)
Canonical tags, meta tags, Open Graph coverage, heading structure, alt text, word counts, and page-level technical hygiene across 10 sampled pages.

**Top finding:** No Organization schema exists on any page, meaning Google and AI engines cannot recognize Ward Village as a business entity.

### 2. Schema Review (`03-schema-review.md`)
Full JSON-LD inventory, schema type coverage by page type, and gaps in entity markup (Organization, AggregateRating, Place, RealEstateAgent).

**Top finding:** 0 of 10 pages have Organization schema or AggregateRating schema, eliminating your ability to be cited by AI engines for entity queries or trust signals.

### 3. Keyword Gap Analysis (`04-keyword-gap.md`)
Commercial intent queries where Ward Village should rank but does not appear in top 10 results, comparison queries won by competitors, and informational content opportunities.

**Top finding:** Ward Village missing from "luxury condos Honolulu," "Honolulu master-planned community," and "Howard Hughes Hawaii real estate" SERPs where competitors with weaker domain authority appear.

### 4. AI Citation Audit (`05-ai-citations.md`)
Live query tests in ChatGPT, Perplexity, Gemini, and Claude for "best Honolulu condos," "Ward Village reviews," "master-planned communities Hawaii," and entity queries.

**Top finding:** 0% citation share across 12 tested queries. Ward Village never cited by name. Competitors The Collection and Kapiolani Residence cited 4 times each.

### 5. Competitor Teardown (`06-competitor-teardown.md`)
Schema coverage, meta tag strategy, content depth, and AI citation performance of three direct competitors (The Collection, Kapiolani Residence, One Ala Moana).

**Top finding:** All three competitors deploy Organization schema. The Collection has AggregateRating schema on 8 pages and gets cited in 33% of AI answers for "luxury Honolulu condos."

### 6. 90-Day Roadmap (`07-roadmap.md`)
Month-by-month prioritized task list with effort estimates, success signals, and dependencies. All tasks trace back to findings in the five audit sections.

**Top recommendation:** Month 1, task 1.1: Deploy Organization schema site-wide (2 hours of effort, unlocks entity recognition for all subsequent work).

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
2. **Sample selection:** Pulled 10 representative pages across homepage, about/amenity pages, article content, directory pages, and contact forms.
3. **Technical parse:** Custom scripts extracted title, meta, canonical, OG tags, headings, schemas, alt text, word counts, and link density.
4. **Schema parse:** Full JSON-LD block inspection with type extraction.
5. **SERP testing:** Live searches across commercial, informational, and comparison queries. Captured top 10 results and AI-synthesized summaries.
6. **Competitor fetch:** Raw HTML of 3-5 direct competitors. Same analysis.
7. **Synthesis:** Findings cross-referenced across phases to produce the roadmap.

---

## Delivery commitment

Six deliverables. Forty-eight hours. Yours to keep whether you hire us after or not. We don't refund. We deliver.