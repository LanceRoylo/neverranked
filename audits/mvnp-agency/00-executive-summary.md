# The MVNP Audit

**Prepared for:** MVNP
**Prepared by:** Never Ranked
**Date:** 2026-05-08
**Deliverable type:** $750 Audit — full SEO & AEO
**Window:** 48 hours

---

## One-page executive summary

MVNP is a full-service advertising and public relations firm based in Honolulu, operating since 1972. The site is clean, visually strong, and has the metadata hygiene most agencies neglect (perfect canonical tags, complete alt text, Open Graph deployed across all 9 sampled pages). But underneath that polish, the site has three structural problems that limit both traditional Google rank and AI citation potential. Eight of nine pages have no H1 tag at all. Seven of nine pages contain fewer than 300 words. And the schema layer stops at basic Organization and WebPage markup, with no Service schema, no BreadcrumbList, and no Review markup despite testimonial text appearing on every page.

The core finding: when we tested queries like "best advertising agency in Honolulu" and "Hawaii PR firm services," AI engines cited competitors with Service schema and richer content. MVNP was invisible. Not because the work isn't there (the capabilities page lists strong services), but because the machine-readable layer that AI engines parse for citation is missing. Google sees the site. ChatGPT and Perplexity skip it.

**Headline findings:**

1. 8 of 9 pages missing H1 tags (no semantic anchor for Google or AI engines)
2. 7 of 9 pages under 300 words (too thin for AI engines to cite)
3. Zero Service schema published (competitors with Service markup get named in AI answers, you don't)
4. Zero BreadcrumbList schema (no rich breadcrumbs in Google search results)
5. Testimonial text on every page but no Review or AggregateRating schema (social proof invisible to machines)
6. 4 title tags under 30 characters (homepage title is strong at 60 chars, but newsletter archives and about page titles are too short to rank well)
7. Homepage has 4 H1 tags when it should have 1 (dilutes the primary signal)
8. Average 16.3 external links per page (high for an agency site, suggests possible over-linking in footer or sidebar)

**What's already working:**
- 100% canonical tag coverage (9 of 9 pages have proper canonical tags pointing to clean URLs)
- 100% Open Graph image coverage (every page has og:image, which means social shares and AI preview cards work)
- Zero images missing alt text (36 images scanned, all tagged)
- Meta descriptions perfect across all 9 pages (all between 80-160 characters, none duplicated)

**The 90-day target:** All pages have proper H1 structure, Service and BreadcrumbList schema live site-wide, 3 client testimonials wrapped in Review schema with AggregateRating on homepage, and 4 thin pages expanded to 400+ words with citation-ready service details.

**The single most important action for this week:** Add Service schema to your homepage and capabilities page. This is a 90-minute task that makes your service catalog machine-readable to AI engines.

---

## The five deliverables in this audit

This package contains six documents, delivered per the Never Ranked $750 audit offer. Each is a standalone deliverable.

### 1. Technical Audit (`02-technical-audit.md`)
Covers title tags, meta descriptions, canonical tags, Open Graph, heading structure, alt text, word counts, and thin content across 9 sampled pages.

**Top finding:** 8 of 9 pages have no H1 tag, which removes the primary semantic signal Google and AI engines use to understand page intent.

### 2. Schema Review (`03-schema-review.md`)
Full JSON-LD structured data analysis covering what schema exists today and what's missing (Service, BreadcrumbList, Review, FAQPage).

**Top finding:** No Service schema detected, which means when AI engines are asked "what does MVNP do," there is no machine-readable service catalog to cite.

### 3. Keyword Gap Analysis (`04-keyword-gap.md`)
Query-by-query testing of commercial and informational searches relevant to Hawaii advertising agencies, PR firms, and marketing services, with competitor rank comparison.

**Top finding:** Competitors with Service schema and 800+ word service pages rank in top 3 for "advertising agency Honolulu" and "Hawaii PR firm." MVNP appears on page 2 or not at all.

### 4. AI Citation Audit (`05-ai-citations.md`)
Live testing of ChatGPT, Perplexity, and Google AI Overviews across 12 queries to measure how often MVNP is cited vs. competitors.

**Top finding:** Zero citations detected across 12 tested queries. Competitors with Service schema and client case studies were cited 4-6 times each.

### 5. Competitor Teardown (`06-competitor-teardown.md`)
Schema, content depth, and technical analysis of 3 Honolulu-area agency competitors to identify what they publish that you don't.

**Top finding:** All 3 competitors publish Service schema. Two publish FAQPage schema. One publishes Review schema with AggregateRating. MVNP publishes none of these.

### 6. 90-Day Roadmap (`07-roadmap.md`)
Month-by-month task list with effort estimates, owner assignments, and success metrics. Everything in the roadmap traces back to a specific finding in the earlier sections.

**Top recommendation:** Month 1 focus is semantic foundation (add H1s, deploy Service schema, deploy BreadcrumbList). Month 2 is content expansion. Month 3 is social proof markup and FAQ content.

---

## How to read this audit

**If you have 15 minutes:**
Read this executive summary + the roadmap (`07-roadmap.md`).

**If you have 45 minutes:**
Add the AI Citation Audit (`05-ai-citations.md`) and the Competitor Teardown (`06-competitor-teardown.md`).

**If you have 2 hours:**
Read everything. The Technical, Schema, and Keyword documents contain specific code blocks and ready-to-use recommendations.

**If you're a developer implementing the fixes:**
Start with the Schema Review. The code blocks are pasteable. Then the Technical Audit for the H1 and title tag fixes.

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
2. **Sample selection:** Pulled 9 representative pages across homepage, newsletter archives, about section, awards, capabilities, and careers.
3. **Technical parse:** Custom scripts extracted title, meta, canonical, OG tags, headings, schemas, alt text, word counts, and link density.
4. **Schema parse:** Full JSON-LD block inspection with type extraction.
5. **SERP testing:** Live searches across commercial, informational, and comparison queries. Captured top 10 results and AI-synthesized summaries.
6. **Competitor fetch:** Raw HTML of 3 direct Hawaii agency competitors. Same analysis.
7. **Synthesis:** Findings cross-referenced across phases to produce the roadmap.

---

## Delivery commitment

Six deliverables. Forty-eight hours. Yours to keep whether you hire us after or not. We don't refund. We deliver.