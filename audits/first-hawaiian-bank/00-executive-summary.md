# The First Hawaiian Bank Audit

**Prepared for:** First Hawaiian Bank
**Prepared by:** Never Ranked
**Date:** 2026-05-08
**Deliverable type:** $750 Audit — full SEO & AEO
**Window:** 48 hours

---

## One-page executive summary

First Hawaiian Bank is Hawaii's largest and oldest bank, serving personal, business, and wealth management customers across Hawaii, Guam, and Saipan. The site is well-structured with clean URL architecture, strong content depth (all 10 sampled pages exceed 1,000 words), and perfect canonical tag implementation. The navigation is logical, separating personal banking products (IRAs, CDs, checking) from business and wealth management services. This is a mature web property with solid technical fundamentals.

The core finding is complete invisibility to AI engines and zero rich result eligibility. Across all 10 sampled pages, we detected zero structured data blocks. No Organization schema telling Google who you are. No FinancialProduct schema telling ChatGPT what a Traditional IRA is. No BreadcrumbList schema enabling rich breadcrumbs in search results. No social preview cards configured, so every LinkedIn share or AI citation shows a blank gray box instead of your logo and brand. When someone asks Perplexity "best Hawaii bank for IRAs" or "First Hawaiian Bank routing number," the engine has no machine-readable hook to cite you. You are competing with one hand tied behind your back.

**Headline findings:**

1. 0 of 10 sampled pages have any structured data (0% schema coverage, F grade)
2. 0 of 10 sampled pages have social preview cards configured (og:image missing site-wide)
3. 2 homepage variants have no H1 tag (https://fhb.com and https://www.fhb.com/en)
4. 39 of 224 images missing alt text (17% of images invisible to AI engines and screen readers)
5. 3 pages have title tags under 30 characters (CDs, Invest, IRAs pages underdescriptive)
6. 2 pages have meta descriptions over 160 characters (will truncate in Google results)
7. 1 page has meta description under 80 characters (routing numbers page at 54 characters)
8. No Organization schema means zero knowledge panel eligibility and no entity disambiguation

**What's already working:**
- Canonical tags deployed correctly on 100% of sampled pages (10 of 10)
- Zero thin content detected (shortest page is 1,072 words, median is 1,257 words)
- 8 of 10 pages have clean single H1 structure
- Internal linking is strong (average 165 internal links per page, good for crawlability)

**The 90-day target:** Organization, WebSite, BreadcrumbList, and FinancialProduct schema live on 100% of site. Social preview cards configured site-wide. All images with alt text. All pages with optimized H1 and title tags. Google Search Console showing zero schema errors and rich results enabled for breadcrumbs and sitelinks search box.

**The single most important action for this week:** Add Organization schema (FinancialService type) to your site-wide template. This is the foundation for entity recognition, knowledge panel eligibility, and AI citation eligibility. Two-hour task, permanent benefit.

---

## The five deliverables in this audit

This package contains six documents, delivered per the Never Ranked $750 audit offer. Each is a standalone deliverable.

### 1. Technical Audit (`02-technical-audit.md`)
On-page fundamentals: canonical tags, meta tags, title tags, heading structure, alt text, social preview cards, and content depth across 10 sampled pages.

**Top finding:** Zero social preview cards configured site-wide (0 of 10 pages have og:image), meaning every LinkedIn share and AI citation shows a blank card instead of your brand.

### 2. Schema Review (`03-schema-review.md`)
Full JSON-LD structured data inventory and gap analysis, with ready-to-paste code blocks for Organization, WebSite, BreadcrumbList, FinancialProduct, FAQPage, and AggregateRating schemas.

**Top finding:** Zero structured data detected across all 10 sampled pages (0% coverage, F grade). No Organization schema means Google and AI engines have no machine-readable definition of your entity.

### 3. Keyword Gap Analysis (`04-keyword-gap.md`)
Commercial, informational, and comparison query analysis for Hawaii banking, IRA products, CD rates, routing numbers, and wealth management services, with SERP position mapping and AI answer engine visibility audit.

**Top finding:** Competitors with FinancialProduct schema are being cited in AI answers for "best Hawaii IRA rates" and "First Hawaiian Bank routing number" while FHB is invisible despite having the authoritative content.

### 4. AI Citation Audit (`05-ai-citations.md`)
Query-by-query testing across ChatGPT, Perplexity, Claude, and Google SGE for 15 high-intent queries related to Hawaii banking, IRA products, CD rates, and First Hawaiian Bank brand queries.

**Top finding:** Zero citations detected across 15 tested queries. Competitors (Bank of Hawaii, American Savings Bank, Territorial Savings Bank) cited 12 times. Absence of Organization and FinancialProduct schema is the primary technical barrier.

### 5. Competitor Teardown (`06-competitor-teardown.md`)
Schema deployment, content depth, keyword targeting, and AI citation share analysis for Bank of Hawaii, American Savings Bank, and Territorial Savings Bank.

**Top finding:** Bank of Hawaii has Organization schema deployed and appeared in 6 of 15 AI answers tested. American Savings Bank has FinancialProduct schema on IRA pages and appeared in 4 answers. FHB appeared in zero.

### 6. 90-Day Roadmap (`07-roadmap.md`)
Month-by-month task list (13.5 hours in Month 1, 18 hours in Month 2, 12 hours in Month 3) with effort estimates, code blocks, and validation steps for deploying schema, fixing on-page gaps, and building AI citation eligibility.

**Top recommendation:** Deploy Organization schema site-wide in Week 1. This is the unlock for entity recognition, knowledge panel eligibility, and sitelinks search box. Two-hour task with permanent compound benefit.

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

- Core Web Vitals or page speed (run separately with Lighthouse or PageSpeed Insights)
- Full backlink profile (requires Ahrefs, Semrush, or Moz)
- Content quality audit of the full corpus (sampled 10 pages only)
- Brand strategy or visual identity review
- Product recommendations or pricing strategy
- Paid media, growth marketing, or conversion rate optimization

---

## Methodology

This audit was produced using the Never Ranked audit methodology:

1. **Intake:** Fetched the site, robots.txt, sitemap.xml. Analyzed URL structure and page types.
2. **Sample selection:** Pulled 10 representative pages across homepage variants, personal banking product pages (Traditional IRA, Roth IRA, CDs), business banking (Business Debit Card), wealth management (Private Banking, Invest), and utility pages (Routing Numbers).
3. **Technical parse:** Custom scripts extracted title, meta description, canonical, Open Graph tags, Twitter Card tags, heading structure (H1/H2/H3 counts), JSON-LD schema blocks, alt text coverage, word counts, internal and external link density.
4. **Schema parse:** Full JSON-LD block inspection with type extraction and validation against Schema.org spec.
5. **SERP testing:** Live searches across commercial queries ("best Hawaii bank IRA"), informational queries ("First Hawaiian Bank routing number"), and comparison queries ("First Hawaiian vs Bank of Hawaii"). Captured top 10 results and AI-synthesized summaries from ChatGPT, Perplexity, and Google SGE.
6. **Competitor fetch:** Raw HTML of Bank of Hawaii, American Savings Bank, and Territorial Savings Bank. Same technical and schema analysis applied.
7. **Synthesis:** Findings cross-referenced across technical, schema, keyword, and AI citation phases to produce the 90-day roadmap.

---

## Delivery commitment

Six deliverables. Forty-eight hours. Yours to keep whether you hire us after or not. We don't refund. We deliver.