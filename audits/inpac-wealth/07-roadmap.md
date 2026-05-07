# 90-Day Roadmap — InPac Wealth

**Auditor:** Never Ranked
**Delivered:** 2026-05-07
**Window:** Months 1–3 (by 2026-08-07)

---

## Premise

Everything in this roadmap is derived from the findings in the technical audit, schema review, keyword gap analysis, AI citation audit, and competitor teardown. Nothing here is invented — every action traces back to a specific gap documented in the earlier sections.

**Starting position (as of 2026-05-07):**
- 0 of 1 sampled pages have canonical tags (100% missing)
- 0 JSON-LD blocks deployed across the entire sampled homepage
- 9 H1 tags on the homepage (chaotic heading structure)
- 14 of 16 images missing alt text (87.5% accessibility and crawler gap)
- No Organization, WebSite, FAQPage, or Service schema deployed

**90-day target:**
- Canonical tags deployed on 100% of pages
- Organization, WebSite, and FAQPage schema live on homepage
- Single H1 per page with clean hierarchy (H2, H3 structure)
- 100% of images have descriptive alt text
- og:image and twitter:image deployed for social share visibility

---

## MONTH 1 — FOUNDATION (2026-05-07 – 2026-06-07)

### Theme
**Fix the technical foundation: canonicals, schema, heading structure, and image accessibility.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 1.1 | Add self-referencing canonical tag to homepage (`<link rel="canonical" href="https://inpacwealth.com" />`) | Technical Audit § 2 | 0.5 hours |
| 1.2 | Deploy Organization schema (FinancialService type) with name, logo, url, contactPoint, address, and sameAs social links | Schema Review § 1 | 2 hours |
| 1.3 | Deploy WebSite schema with potentialAction SearchAction (or minimal WebSite block if no search endpoint exists) | Schema Review § 2 | 1 hour |
| 1.4 | Refactor homepage to use single H1 ("Dream with Inspiration. Plan with a Purpose. Live with Intention.") and convert remaining 8 H1s to H2 or H3 based on content hierarchy | Technical Audit § 3 | 3 hours |
| 1.5 | Write and add descriptive alt text to all 14 images currently missing alt attributes on homepage | Technical Audit (red flags) | 2 hours |
| 1.6 | Create or select og:image asset (1200×630 px) and add og:image and twitter:image meta tags to homepage | Technical Audit § 4 | 1.5 hours |
| 1.7 | Audit and add canonical tags to all other pages in the site (if multi-page site exists beyond homepage sample) | Technical Audit § 2 | 4 hours |
| 1.8 | Validate all schema markup using Google Rich Results Test and Schema.org validator, fix any parse errors | Schema Review § 1, § 2 | 1 hour |

**Subtotal: ~15 hours of mechanical work.**

### Stretch tasks
- Add BreadcrumbList schema if the site has multi-level navigation (e.g., Services > Financial Planning)
- Lengthen title tag from 12 characters ("INPAC WEALTH") to 50–60 characters with descriptive keyword phrase (e.g., "InPac Wealth | Financial Planning & Wealth Advisory")

### Success signal
At end of month 1:
- Google Search Console shows canonical tags indexed for homepage and all published pages
- Organization and WebSite schema visible in Google Rich Results Test with zero errors
- Homepage has exactly 1 H1 and clean H2/H3 hierarchy when inspected in browser DevTools
- All images on homepage display alt text when hovering or inspecting element
- Social share preview (tested in LinkedIn post composer or Twitter card validator) displays og:image correctly

---

## MONTH 2 — CONTENT CITATION HOOKS (2026-06-08 – 2026-07-08)

### Theme
**Add FAQPage schema and Service schema to give AI engines structured hooks for wealth management queries.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 2.1 | Identify or write 5–8 common client questions about financial planning, retirement planning, and wealth management services | Schema Review § 3 (inference from missing FAQPage) | 3 hours |
| 2.2 | Deploy FAQPage schema on homepage or dedicated FAQ page with Question/Answer pairs using acceptedAnswer property | Schema Review § 3 | 2 hours |
| 2.3 | Create service pages (or identify existing pages) for core offerings: Financial Planning, Investment Advisory, Retirement Planning, Estate Planning | Schema Review § 1 (FinancialService entity needs service pages) | 6 hours |
| 2.4 | Add Service schema to each service page with name, description, provider (reference to Organization @id), areaServed, and serviceType | Schema Review § 1 | 4 hours |
| 2.5 | Test all new schema blocks in Google Rich Results Test and verify FAQPage eligibility | Schema Review § 3 | 1 hour |

**Subtotal: ~16 hours.**

### Success signal
At end of month 2:
- FAQPage schema live and passing validation with 5+ Question entities
- Service schema deployed on at least 3 service pages, each referencing the Organization @id
- Google Search Console shows expanded schema coverage (Organization, WebSite, FAQPage, Service types all indexed)

---

## MONTH 3 — AUTHORITY + MEASUREMENT (2026-07-09 – 2026-08-07)

### Theme
**Add social proof schema (if testimonials or ratings exist) and establish measurement baseline for AI citation tracking.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 3.1 | Audit existing testimonials or client reviews. If present, add AggregateRating or Review schema to homepage or testimonial page | Schema Review (red flags mention missing AggregateRating) | 3 hours |
| 3.2 | Set up Google Search Console property (if not already configured) and verify all pages are indexed with new schema types visible | Technical Audit (measurement foundation) | 1 hour |
| 3.3 | Install and configure Bing Webmaster Tools, submit sitemap, verify schema coverage in Bing's schema explorer | Technical Audit (dual-engine visibility) | 1 hour |
| 3.4 | Establish baseline for AI citation tracking: query ChatGPT, Perplexity, and Google AI Overviews with "best financial advisors for families" and "wealth management firms [city/region]" and document whether InPac Wealth is cited | Schema Review § 1 (AEO optimization goal) | 2 hours |
| 3.5 | Document before-and-after schema deployment in a tracking sheet: schema types live, Google Rich Results Test pass/fail, AI citation baseline, social share preview screenshots | Technical Audit + Schema Review (holistic measurement) | 2 hours |

**Subtotal: ~9 hours.**

### Success signal
At end of month 3:
- AggregateRating or Review schema live (if applicable testimonials exist) and passing validation
- Google Search Console and Bing Webmaster Tools both show InPac Wealth's Organization entity indexed with logo and contact points
- Baseline AI citation report complete with screenshots showing pre-schema and post-schema query results in ChatGPT, Perplexity, and Google AI Overviews

---

## Long-horizon view (months 4–6, not scheduled here)

- **Month 4:** Publish 2–3 long-form content pieces (1,500+ words each) targeting "how to choose a financial advisor" and "retirement planning checklist" with HowTo or Article schema to feed AI training pipelines
- **Month 5:** Build backlinks from local business directories, chamber of commerce, and industry associations. Add sameAs references to Organization schema for new authoritative profiles.
- **Month 6:** Launch monthly AI citation tracking cadence. Query 10–15 wealth management buyer queries and measure citation rate, position in AI answers, and competitor mentions. Adjust content and schema based on gaps.

---

## The single most important action

If the client only has time to do ONE thing in the next 7 days, it's this:

**Deploy Organization schema (FinancialService type) to the homepage with name, logo, url, contactPoint, address, and sameAs social links. This unlocks entity recognition in Google, Bing, ChatGPT, and Perplexity. Paste the code block from Schema Review § 1 into the `<head>` or footer as JSON-LD. Test in Google Rich Results Test. This single action makes InPac Wealth machine-readable.**

---

## Expected outcomes by the end of the 90 days

**Realistic case:**
- InPac Wealth appears in Google's knowledge graph when branded queries are issued (knowledge panel eligibility triggered by Organization schema)
- FAQPage rich results appear in Google search for at least 1–2 wealth management queries
- Social shares on LinkedIn display correct og:image and meta description, improving click-through from referrals
- Baseline AI citation tracking shows InPac Wealth mentioned in 1–2 of 10 test queries (up from zero)

**Optimistic case:**
- Google displays sitelinks search box under branded query due to WebSite schema with SearchAction
- FAQPage rich results live for 3+ queries, driving incremental traffic to homepage or FAQ page
- InPac Wealth cited in ChatGPT or Perplexity answers for "financial advisors [city]" or "best wealth management firms for families" queries
- Bing Webmaster Tools shows Organization entity fully populated with logo, contact, and social profiles

**Conservative case:**
- All schema deployed and passing validation in Google Rich Results Test, but rich results and AI citations lag due to crawl/index delay (expect 4–8 weeks post-deployment)
- Canonical tags eliminate duplicate indexing risk and consolidate link equity to single URLs
- Image alt text improves accessibility score and provides descriptive hooks for image search indexing
- Social share previews function correctly, improving professional perception on LinkedIn and Facebook shares