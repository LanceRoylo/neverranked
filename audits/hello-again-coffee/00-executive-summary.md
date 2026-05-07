# The Hello Again Coffee Audit

**Prepared for:** Hello Again Coffee
**Prepared by:** Never Ranked
**Date:** 2026-05-07
**Deliverable type:** $750 Audit — full SEO & AEO
**Window:** 48 hours

---

## One-page executive summary

Hello Again Coffee operates a specialty coffee shop in Honolulu, HI, with a focus on creating memorable coffee moments beyond the morning rush. The homepage emphasizes afternoon coffee culture and brand personality, but the site architecture is minimal (we sampled 1 page, the homepage). The technical foundation is clean: canonical tags work, Open Graph metadata is present, and all 7 images carry alt text. But the site is structurally invisible to Google's entity graph and AI engines.

The core finding: 0% schema markup coverage. Zero JSON-LD blocks exist on the homepage. No Organization schema, no LocalBusiness schema, no WebSite schema. For a physical coffee shop competing in a tourist-heavy market like Honolulu, this means no local pack eligibility, no knowledge panel signal, and no citeable entity hooks for ChatGPT or Perplexity. The homepage also has no H1, a 25-character title tag (below Google's 30-character minimum), and only 224 words of body copy (flagged as thin content). Google sees a text page, not a business.

**Headline findings:**

1. Zero schema markup on homepage — no CoffeeShop, Organization, or WebSite blocks detected
2. Homepage missing H1 — header hierarchy starts at H2, breaking semantic structure
3. Title tag at 25 characters ("Home - Hello Again Coffee") — under minimum threshold for keyword coverage
4. 224 words of body copy on homepage — flagged as thin content by our parser
5. Meta description at 162 characters — will truncate in mobile SERPs
6. No local pack eligibility — no structured address, hours, geo coordinates, or phone number
7. No AI citation hooks — AI engines have no entity data to reference in Honolulu coffee queries
8. No sitelink search box eligibility — missing WebSite schema with SearchAction

**What's already working:**
- Canonical tag present and correct on homepage (points to https://helloagaincoffee.com/)
- All 7 images have alt text (0 missing alt attributes)
- Open Graph metadata complete (og:title, og:description, og:image, og:type all present)
- Robots meta set to "index, follow" (no accidental noindex blocks)

**The 90-day target:** LocalBusiness schema live on all core pages, homepage word count above 500, H1 and title tag fixed, Google Business Profile connected and monitored, and local pack eligibility restored with full structured data.

**The single most important action for this week:** Add CoffeeShop schema to the homepage with address, geo coordinates, hours, and phone number — this unlocks local pack eligibility and entity recognition in one deployment.

---

## The five deliverables in this audit

This package contains six documents, delivered per the Never Ranked $750 audit offer. Each is a standalone deliverable.

### 1. Technical Audit (`02-technical-audit.md`)
Covers meta tags, canonical implementation, header hierarchy, word count, alt text, and crawlability for Hello Again Coffee's homepage.

**Top finding:** Homepage has no H1 and only 224 words of body copy — Google has weak signals for page topic and thin content flags undermine ranking potential.

### 2. Schema Review (`03-schema-review.md`)
Full JSON-LD analysis with ready-to-paste code blocks for CoffeeShop, Organization, WebSite, and AggregateRating schemas.

**Top finding:** Zero schema markup across all sampled pages — no LocalBusiness, no Organization, no entity recognition for a physical Honolulu coffee shop.

### 3. Keyword Gap Analysis (`04-keyword-gap.md`)
Identifies commercial, local, and informational queries where Hello Again Coffee should rank but currently does not appear in top 50 results.

**Top finding:** Site is invisible in "best coffee Honolulu" and "specialty coffee Honolulu" queries — competitors with LocalBusiness schema dominate local pack and AI overviews.

### 4. AI Citation Audit (`05-ai-citations.md`)
Tests ChatGPT, Perplexity, and Google AI Overviews for citation presence in Honolulu coffee queries.

**Top finding:** Hello Again Coffee receives zero citations in AI-generated answers for "best coffee shops Honolulu" — competitors with review schema and entity markup are cited instead.

### 5. Competitor Teardown (`06-competitor-teardown.md`)
Side-by-side schema, content depth, and local SEO comparison against 3 direct Honolulu coffee shop competitors.

**Top finding:** All 3 sampled competitors deploy LocalBusiness schema with AggregateRating, while Hello Again Coffee has no structured data at all.

### 6. 90-Day Roadmap (`07-roadmap.md`)
Month-by-month task list derived directly from audit findings, with effort estimates and success signals for each sprint.

**Top recommendation:** Deploy CoffeeShop schema with full address, geo, hours, and phone in month 1 — this is the single unlock for local pack visibility and AI citation eligibility.

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
2. **Sample selection:** Pulled 1 representative page (homepage) for deep analysis.
3. **Technical parse:** Custom scripts extracted title, meta, canonical, OG tags, headings, schemas, alt text, word counts, and link density.
4. **Schema parse:** Full JSON-LD block inspection with type extraction (zero blocks found).
5. **SERP testing:** Live searches across commercial, informational, and local Honolulu coffee queries. Captured top 10 results and AI-synthesized summaries.
6. **Competitor fetch:** Raw HTML of 3 direct Honolulu coffee shop competitors. Same technical and schema analysis.
7. **Synthesis:** Findings cross-referenced across phases to produce the roadmap.

---

## Delivery commitment

Six deliverables. Forty-eight hours. Yours to keep whether you hire us after or not. We don't refund. We deliver.