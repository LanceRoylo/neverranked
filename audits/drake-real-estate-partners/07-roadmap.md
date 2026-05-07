# 90-Day Roadmap — Drake Real Estate Partners

**Auditor:** Never Ranked
**Delivered:** 2026-05-07
**Window:** Months 1–3 (by 2026-08-07)

---

## Premise

Everything in this roadmap is derived from the findings in the technical audit, schema review, keyword gap analysis, AI citation audit, and competitor teardown. Nothing here is invented — every action traces back to a specific gap documented in the earlier sections.

**Starting position (as of 2026-05-07):**
- 0 of 1 sampled pages have Organization schema (entity recognition is impossible)
- 0 of 1 sampled pages have canonical tags (duplicate content risk is unmitigated)
- 0 of 1 sampled pages have og:image (every LinkedIn share renders blank)
- 1 of 1 sampled pages has 4 words of body text (thin content, no AEO surface area)
- 1 of 1 sampled pages has no H1 (heading structure is nonexistent)

**90-day target:**
- Organization, WebSite, and Service schema live on homepage and all core pages
- Canonical tags deployed sitewide
- Social preview cards rendering correctly on LinkedIn, Slack, and Twitter
- Homepage expanded to 800+ words with proper H1/H2 structure
- At least one FAQ page live with FAQPage schema for answer box eligibility

---

## MONTH 1 — FOUNDATION (2026-05-07 – 2026-06-07)

### Theme
**Fix the invisible infrastructure. Deploy schema, add canonical tags, enable social previews, and give the homepage a heading structure.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 1.1 | Deploy Organization schema on homepage and sitewide template | Technical Audit §1, Schema Review §1 | 1 hour |
| 1.2 | Deploy WebSite schema with SearchAction on homepage | Schema Review §2 | 0.5 hours |
| 1.3 | Add canonical tag to homepage (self-referencing to https://drakerep.com) | Technical Audit (red flag: canonical missing on 1 of 1 pages) | 0.25 hours |
| 1.4 | Create and upload 1200×630 social preview image, add og:image and twitter:image tags to homepage | Technical Audit §2 | 2 hours |
| 1.5 | Add H1 to homepage ("Drake Real Estate Partners: Value-Add and Opportunistic Investments Across U.S. Markets" or similar) | Technical Audit (red flag: 1 page has no H1) | 0.5 hours |
| 1.6 | Expand homepage body text from 4 words to at least 400 words (overview of firm, investment thesis, markets served, contact CTA) | Technical Audit (red flag: 1 page has under 300 words) | 4 hours |
| 1.7 | Add alt text to the 1 image on homepage | Technical Audit (red flag: 1 of 1 images missing alt text) | 0.25 hours |
| 1.8 | Lengthen homepage title tag from 26 characters to 50-60 characters ("Drake Real Estate Partners | Value-Add Real Estate Investment Firm in New York") | Technical Audit (red flag: 1 page has title under 30 characters) | 0.25 hours |

**Subtotal: ~8.75 hours of mechanical work.**

### Stretch tasks
- Add BreadcrumbList schema to homepage (if navigation exists elsewhere on site)
- Deploy canonical tags to all pages beyond homepage (if multi-page site exists)

### Success signal
At end of month 1:
- Google Rich Results Test validates Organization and WebSite schema with zero errors
- LinkedIn share preview shows logo and title when drakerep.com is posted
- Homepage has one H1, at least 400 words of visible text, and all images have alt attributes

---

## MONTH 2 — CONTENT CITATION HOOKS (2026-06-08 – 2026-07-08)

### Theme
**Build the content surface area that lets AI cite you. Add FAQ page, Service schema, and testimonials with AggregateRating.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 2.1 | Create FAQ page answering 8-10 common investor questions ("What types of properties does Drake invest in?" "What markets do you focus on?" "What is your typical hold period?") | Schema Review (red flag: No FAQPage schema detected) | 6 hours |
| 2.2 | Deploy FAQPage schema on new FAQ page | Schema Review (FAQPage missing, needed for answer box eligibility) | 1 hour |
| 2.3 | Add Service or FinancialService schema to homepage or dedicated services page (describe investment advisory, asset management, etc.) | Schema Review §1 (table shows Service and FinancialService both missing) | 2 hours |
| 2.4 | Collect 3-5 client or partner testimonials and add them to homepage or dedicated testimonials section | Schema Review (red flag: No AggregateRating detected, AI has no social proof hook) | 4 hours |
| 2.5 | Deploy AggregateRating schema based on testimonials (if you have numeric ratings) or Review schema for individual testimonials | Schema Review (AggregateRating missing, needed for AI citation credibility) | 1.5 hours |

**Subtotal: ~14.5 hours.**

### Success signal
At end of month 2:
- FAQ page is live and validates cleanly in Google Rich Results Test
- At least one Service or FinancialService schema block is deployed and parseable
- Homepage or testimonials page includes at least three testimonials with names and companies

---

## MONTH 3 — AUTHORITY + MEASUREMENT (2026-07-09 – 2026-08-07)

### Theme
**Add external credibility signals, increase outbound link authority, and measure baseline performance for tracking.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 3.1 | Add 4-6 high-authority outbound links from homepage or FAQ page (link to NCREIF, Urban Land Institute, NAIOP, or other industry bodies your firm is affiliated with) | Technical Audit (red flag: average external links per page is 1.0, AEO authority signal is weak) | 1 hour |
| 3.2 | Set up Google Search Console (if not already live) and submit sitemap | Technical Audit (needed to measure canonical coverage and indexing status post-fixes) | 1 hour |
| 3.3 | Run baseline Perplexity and ChatGPT citation test: query "top real estate investment firms in New York" and "value-add real estate firms" and document whether Drake is mentioned | Premise (needed to measure AEO visibility improvement after schema deployment) | 0.5 hours |
| 3.4 | Add sameAs links to LinkedIn company page and any other social profiles in Organization schema | Schema Review §1 (sameAs array placeholder in code example, needed for entity confirmation) | 0.5 hours |
| 3.5 | Create one long-form content piece (1200+ words) on "How to evaluate value-add real estate opportunities" or similar investor-education topic, deploy on new blog or resources page with proper H1/H2 structure and at least 3 outbound links to authoritative sources | Technical Audit (thin content flag, AEO authority signal weak, need citation-worthy content) | 8 hours |

**Subtotal: ~11 hours.**

### Success signal
At end of month 3:
- Google Search Console shows at least 5 pages indexed with valid canonical tags
- Baseline AEO citation test is documented and repeatable for quarterly tracking
- One long-form content piece is live and includes at least 3 links to .edu, .gov, or industry association domains

---

## Long-horizon view (months 4–6, not scheduled here)

- **Month 4:** Deploy BreadcrumbList schema sitewide, add 2-3 case studies with structured data for specific properties or investment outcomes
- **Month 5:** Build dedicated "Our Team" page with Person schema for each partner, create second FAQ page focused on LP questions
- **Month 6:** Conduct second AEO citation audit, measure change in Google Knowledge Panel presence, add HowTo schema for investor onboarding process

---

## The single most important action

If the client only has time to do ONE thing in the next 7 days, it's this:

**Deploy Organization schema on the homepage using the JSON-LD code block from Schema Review §1. This is the root entity signal that makes every other fix count. Without it, you are invisible to AI engines. With it, you become a citable entity. Copy-paste into your <head> tag, replace the logo URL and LinkedIn URL with your actual values, and validate at search.google.com/test/rich-results. Total time: 30 minutes.**

---

## Expected outcomes by the end of the 90 days

**Realistic case:**
- Drake Real Estate Partners is recognized as a structured entity by Google (Knowledge Panel candidate)
- LinkedIn shares of drakerep.com render with logo and title
- At least one FAQ answer is eligible for Google answer box inclusion
- Baseline AEO citation presence is documented for quarterly tracking

**Optimistic case:**
- Google displays rich results (FAQ snippets or sitelinks search box) for branded queries
- ChatGPT or Perplexity cites Drake by name when asked about New York value-add real estate firms
- Homepage word count exceeds 800 words with clear service descriptions and investment thesis
- Search Console shows zero canonical errors and 10+ pages indexed

**Conservative case:**
- Organization and WebSite schema validate with zero errors in Rich Results Test
- Social preview cards render correctly on at least two platforms (LinkedIn, Slack)
- Homepage has proper H1, 400+ words, and all images have alt text
- One FAQ page is live and crawlable