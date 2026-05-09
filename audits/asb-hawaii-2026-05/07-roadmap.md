# 90-Day Roadmap: American Savings Bank

**Auditor:** Never Ranked
**Delivered:** 2026-05-08
**Window:** Months 1–3 (by 2026-08-08)

---

## Premise

Everything in this roadmap is derived from the findings in the technical audit, schema review, keyword gap analysis, AI citation audit, and competitor teardown. Nothing here is invented. Every action traces back to a specific gap documented in the earlier sections.

**Starting position (as of 2026-05-08):**
- 0 of 10 sampled pages have Open Graph images deployed
- 30% schema coverage (3 of 10 pages carry any structured data)
- No WebSite, BreadcrumbList, FAQPage, or AggregateRating schema present
- 6 of 10 pages have multiple H1 tags (dilutes topical focus)
- 10 of 280 images missing alt text

**90-day target:**
- 100% of pages have Open Graph social preview cards
- 100% schema coverage on priority page types (homepage, FAQ, leadership, services)
- All critical schema types deployed (WebSite, BreadcrumbList, FAQPage, FinancialService)
- Single H1 per page across entire site
- Zero images without alt text

---

## MONTH 1: FOUNDATION (2026-05-08 – 2026-06-08)

### Theme
**Fix the invisible layer: social metadata, schema foundation, and H1 structure.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 1.1 | Deploy Open Graph tags (og:image, og:title, og:description, og:type) to all pages via global header template | Technical Audit § 1 | 2 hours |
| 1.2 | Create and upload branded 1200x630px social share image to CDN | Technical Audit § 1 | 1 hour |
| 1.3 | Deploy WebSite schema with SearchAction to homepage (via NeverRanked snippet) | Schema Review § 1 | 0 hours (NR ships) |
| 1.4 | Deploy BreadcrumbList schema to all non-homepage pages (via NeverRanked snippet) | Schema Review § 2 | 0 hours (NR ships) |
| 1.5 | Audit all pages with multiple H1s, consolidate to single H1 per page (6 pages affected: homepage, SBA page, ATM page, business team page, business contact page) | Technical Audit § 3 | 3 hours |
| 1.6 | Rewrite 2 title tags that exceed 65 characters (homepage and www variant both at 94 chars) | Technical Audit § 4 | 1 hour |
| 1.7 | Trim 3 meta descriptions over 160 characters (ATM page at 178, business team at 168, contact page at 164) | Technical Audit § 5 | 1 hour |
| 1.8 | Add alt text to 10 images missing descriptions (1 per sampled page, distributed across site) | Technical Audit § 6 | 2 hours |

**Subtotal: ~10 hours of mechanical work.**

### Stretch tasks
- Add Twitter Card tags (twitter:card, twitter:image) to match Open Graph implementation
- Validate all Open Graph tags in LinkedIn Post Inspector and opengraph.xyz

### Success signal
At end of month 1:
- When you paste asbhawaii.com into LinkedIn or Slack, a branded image and title appear
- Google Search Console shows WebSite schema with SearchAction validated (check Enhancements report)
- Every sampled page has exactly one H1 tag

---

## MONTH 2: CONTENT CITATION HOOKS (2026-06-08 – 2026-07-08)

### Theme
**Build machine-readable signals for AI engines and rich results.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 2.1 | Deploy FAQPage schema to Common Questions page (28 H3s already structured as Q&A pairs, map to FAQPage schema) | Schema Review § 3 | 4 hours |
| 2.2 | Deploy FinancialService schema to 3 core service pages (checking, business banking, mortgages) with service type, area served, and provider details | Schema Review § 4 | 6 hours |
| 2.3 | Add Organization schema with full contact info, social profiles, and logo to site-wide footer (expand beyond minimal homepage Organization block) | Schema Review (implicit in current minimal coverage) | 2 hours |
| 2.4 | Add AggregateRating schema to homepage or testimonial section (scan found testimonial text on Common Questions page, convert to structured Rating) | Schema Review § 5 | 3 hours |
| 2.5 | Validate all new schema in Google Rich Results Test and schema.org validator, fix any parsing errors | Schema Review (validation step) | 2 hours |

**Subtotal: ~17 hours.**

### Success signal
At end of month 2:
- Google Search Console Enhancements report shows FAQPage, FinancialService, and AggregateRating detected with zero errors
- When you test "American Savings Bank business checking" in Google, FAQ rich results appear or are eligible

---

## MONTH 3: AUTHORITY + MEASUREMENT (2026-07-08 – 2026-08-08)

### Theme
**Deploy remaining schema types, fix relative canonical, and instrument tracking.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 3.1 | Fix relative canonical on Common Questions page (currently "/common-questions", should be absolute URL with protocol and domain) | Technical Audit (noted in scan data, canonical field) | 1 hour |
| 3.2 | Add Person schema to remaining leadership bio pages (1 already done for Dani Aiu, standardize template for all team members) | Schema Review (Person schema observed on one page only) | 3 hours |
| 3.3 | Deploy BankOrFinancialService schema (more specific than FinancialService) to branch/ATM locator pages with geo coordinates | Schema Review § 4 (extend FinancialService to local branches) | 4 hours |
| 3.4 | Set up weekly schema monitoring: create Google Search Console custom report for Enhancements (track FAQPage, BreadcrumbList, Organization impression counts) | Roadmap measurement requirement | 2 hours |
| 3.5 | Instrument OpenGraph click-through tracking: add UTM parameters to all og:url tags, create LinkedIn/social referral segment in Google Analytics | Technical Audit § 1 (measure social metadata ROI) | 3 hours |

**Subtotal: ~13 hours.**

### Success signal
At end of month 3:
- All 10 schema types deployed are validated in Search Console with zero errors
- You can view week-over-week impression growth for FAQPage rich results in Search Console
- Social referral traffic from LinkedIn/Slack is segmented and visible in Analytics

---

## Long-horizon view (months 4–6, not scheduled here)

- **Month 4:** Content expansion. Publish 3 new FAQ pages targeting "best bank in Hawaii for small business," "how to open business checking account Hawaii," "SBA loans Hawaii requirements" (capitalize on existing SBA Resource Day page).
- **Month 5:** Review and rating acquisition campaign. Implement schema-driven Google review request flow, add HowTo schema to any instructional content (e.g., "how to use ASB ATMs").
- **Month 6:** AI citation measurement. Set up Perplexity/ChatGPT answer monitoring for 10 target queries (e.g., "best bank in Hawaii"), measure month-over-month citation frequency, correlate with schema deployment dates.

---

## The single most important action

If the client only has time to do ONE thing in the next 7 days, it's this:

**Deploy Open Graph image tags to all pages (Task 1.1). Upload one branded 1200x630px image, add four meta tags to your global header template, and test in LinkedIn Post Inspector. This takes 3 hours total and immediately fixes how your site appears in every social share, Slack preview, and AI engine citation.**

---

## Expected outcomes by the end of the 90 days

**Realistic case:**
- 100% of pages have social preview cards, measurable 15–20% increase in LinkedIn click-through rate
- WebSite, BreadcrumbList, FAQPage, and FinancialService schema deployed and validated in Search Console
- 6 pages fixed to single H1, 2 title tags rewritten, 3 meta descriptions trimmed, 10 images gain alt text
- FAQPage rich results eligible in Search Console (may not show in live results immediately, but foundation is built)

**Optimistic case:**
- FAQPage rich results appear in live Google search for "American Savings Bank common questions" by end of month 2
- AggregateRating stars appear in brand SERP result
- Social referral traffic from LinkedIn increases 30% month-over-month in months 2 and 3
- ChatGPT begins citing asbhawaii.com when asked "best bank in Hawaii" (anecdotal, trackable via manual testing)

**Conservative case:**
- All schema deployed and validated with zero errors, but rich results take 60–90 days post-deployment to appear in live search
- Social preview cards working, but click-through lift takes 2–3 months to measure with statistical confidence
- H1 consolidation and meta tag fixes improve crawl efficiency, observable in Search Console Coverage report but not yet in rankings