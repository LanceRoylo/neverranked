# The Max's Sports Bar Audit

**Prepared for:** Max's Sports Bar
**Prepared by:** Never Ranked
**Date:** 2026-05-07
**Deliverable type:** $750 Audit — full SEO & AEO
**Window:** 48 hours

---

## One-page executive summary

Max's Sports Bar is a neighborhood sports bar in the South Main Arts District of downtown Memphis, established in 2007. The site spans 10 pages covering the core customer journey: homepage, about, contact, food and drink menus, events (crawfish Saturdays), Cubs fandom, cornhole league, and NFL pick'em rules. The Open Graph implementation is perfect (10 of 10 pages carry og:image, og:title, og:description, twitter:card). Social sharing will work flawlessly. But the technical SEO foundation that search engines and AI models depend on is broken.

Zero pages have canonical tags. Nine out of 10 title tags are under 30 characters, leaving no room for keyword or location modifiers. Only the homepage carries any schema at all (LocalBusiness), and the critical entity signals (Organization, WebSite, BreadcrumbList) are completely absent. Eight of 10 pages fall under 300 words. When we tested 12 Memphis sports bar and local dining queries in ChatGPT, Perplexity, and Google AI Overviews, Max's appeared zero times. Not once. Meanwhile, three direct competitors (Loflin Yard, Brookhaven Pub, Bardog Tavern) were cited in 67% of AI responses.

**Headline findings:**

1. 0 of 10 pages have canonical tags (100% missing, allowing duplicate URL variants to dilute authority)
2. 0% AI citation share across 12 tested queries (competitors captured 67% of mentions)
3. Organization schema missing site-wide (no entity recognition in Google Knowledge Graph)
4. 9 of 10 pages have title tags under 30 characters (too short to rank for competitive terms)
5. 8 of 10 pages contain fewer than 300 words (thin content, weak topical depth signal)
6. WebSite schema missing (sitelink search box disabled in branded queries)
7. BreadcrumbList schema missing (no rich result breadcrumbs in SERPs)
8. 10 of 21 images missing alt text (48% accessibility and image search gap)

**What's already working:**
- Open Graph and Twitter Card markup is flawless across all 10 pages (social shares will render perfectly)
- Homepage has LocalBusiness schema with correct @type
- One page (About Us) exceeds 300 words and the cornhole league page hits 1,458 words (strong depth)
- All pages have H1 tags except two outliers (Food Menu, NFL Pick'em), and none have multiple H1s (clean heading hierarchy)

**The 90-day target:** Get Max's Sports Bar cited in at least 3 of 12 Memphis sports bar AI queries, eliminate all 10 canonical gaps, deploy Organization and WebSite schema, and expand 6 thin pages past 300 words with menu details, event FAQs, and neighborhood context.

**The single most important action for this week:** Add Organization schema to the site header with name, logo, address, phone, and social profiles. This unlocks entity recognition across Google, ChatGPT, and Perplexity.

---

## The five deliverables in this audit

This package contains six documents, delivered per the Never Ranked $750 audit offer. Each is a standalone deliverable.

### 1. Technical Audit (`02-technical-audit.md`)
Covers canonical tags, title and meta description length, H1 structure, image alt text, and word count across the 10-page sample.

**Top finding:** 100% of sampled pages are missing canonical tags, fragmenting link equity across URL variants.

### 2. Schema Review (`03-schema-review.md`)
Documents existing JSON-LD structured data (LocalBusiness on homepage only) and identifies missing Organization, WebSite, BreadcrumbList, Menu, and Event schemas.

**Top finding:** Organization schema is absent site-wide, preventing Google from building a Knowledge Graph entity for Max's Sports Bar.

### 3. Keyword Gap Analysis (`04-keyword-gap.md`)
Compares Max's organic visibility against Loflin Yard, Brookhaven Pub, and Bardog Tavern across 18 commercial and informational Memphis sports bar queries.

**Top finding:** Max's ranks for zero of the 18 tested queries while competitors own positions 1–5 for terms like "best sports bar Memphis," "watch Cubs game Memphis," and "Memphis bar with cornhole."

### 4. AI Citation Audit (`05-ai-citations.md`)
Tests 12 queries in ChatGPT, Perplexity, and Google AI Overviews to measure citation share and identify why Max's is invisible in AI-generated answers.

**Top finding:** Max's Sports Bar received zero citations across 12 queries while Loflin Yard, Brookhaven Pub, and Bardog Tavern appeared in 8 of 12 responses (67% citation share).

### 5. Competitor Teardown (`06-competitor-teardown.md`)
Schema, technical, and content analysis of three direct competitors to document what they're doing that Max's is not.

**Top finding:** All three competitors have Organization schema, 2 of 3 have Menu schema, and all maintain 400+ word pages with neighborhood context and event calendars.

### 6. 90-Day Roadmap (`07-roadmap.md`)
Month-by-month task list with effort estimates, source citations, and success signals to close the gaps identified in the prior five deliverables.

**Top recommendation:** Deploy canonical tags, Organization schema, and rewrite title tags in Month 1 (19 hours of work, eliminates 3 of the 8 headline findings).

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
2. **Sample selection:** Pulled 10 representative pages across page types (homepage, about, contact, menus, events, leagues).
3. **Technical parse:** Custom scripts extracted title, meta, canonical, OG tags, headings, schemas, alt text, word counts, and link density.
4. **Schema parse:** Full JSON-LD block inspection with type extraction.
5. **SERP testing:** Live searches across commercial, informational, and comparison queries. Captured top 10 results and AI-synthesized summaries.
6. **Competitor fetch:** Raw HTML of 3 direct Memphis sports bars. Same analysis.
7. **Synthesis:** Findings cross-referenced across phases to produce the roadmap.

---

## Delivery commitment

Six deliverables. Forty-eight hours. Yours to keep whether you hire us after or not. We don't refund. We deliver.