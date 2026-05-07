# 90-Day Roadmap — Emanate Wireless

**Auditor:** Never Ranked
**Delivered:** 2026-05-07
**Window:** Months 1–3 (by 2026-08-07)

---

## Premise

Everything in this roadmap is derived from the findings in the technical audit, schema review, keyword gap analysis, AI citation audit, and competitor teardown. Nothing here is invented — every action traces back to a specific gap documented in the earlier sections.

**Starting position (as of 2026-05-07):**
- 0 of 1 pages have canonical tags (100% missing)
- 0 of 1 pages have any structured data (Organization, WebSite, BreadcrumbList all absent)
- 0 of 1 pages have OpenGraph images (social shares are invisible)
- Homepage has 159 words (thin content, under 300-word threshold)
- 8 of 12 images missing alt text (67% failure rate)

**90-day target:**
- Canonical tags deployed on 100% of pages
- Organization and WebSite schema live on every page
- Homepage word count above 800 words with entity-rich copy
- All images carry descriptive alt text
- First AI engine citation captured and logged

---

## MONTH 1 — FOUNDATION (2026-05-07 – 2026-06-07)

### Theme
**Make Emanate Wireless a recognized entity and fix broken on-page hygiene.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 1.1 | Add Organization schema to homepage and sitewide template | Schema Review, Finding 1 | 2 hours |
| 1.2 | Add WebSite schema with SearchAction to homepage | Schema Review, Finding 2 | 1 hour |
| 1.3 | Deploy canonical tag on homepage (and sitewide template if CMS allows) | Technical Audit, Finding 2 | 1 hour |
| 1.4 | Add OpenGraph image, og:type, twitter:card, and twitter:image tags to homepage | Technical Audit, Finding 3 | 2 hours |
| 1.5 | Consolidate three H1 tags into one semantic H1 on homepage | Technical Audit (h1_count: 3) | 1 hour |
| 1.6 | Rewrite homepage title tag from 16 characters to 50-60 characters including "RTLS" or "real-time location system" | Technical Audit (title_len: 16, too_short_under_30) | 1 hour |
| 1.7 | Add descriptive alt text to all 8 images missing it on homepage | Technical Audit (img_no_alt: 8) | 2 hours |
| 1.8 | Expand homepage copy from 159 words to 800+ words, adding entity mentions (Hudson, healthcare, RTLS, asset tracking, Gary Sugar) | Technical Audit (word_count: 159, thin_pages_under_300_words: 1) | 6 hours |

**Subtotal: ~16 hours of mechanical work.**

### Stretch tasks
- Add FAQPage schema to homepage with 3-5 common RTLS buyer questions (e.g., "What is room-level accuracy?", "How does RTLS integrate with EHR systems?")
- Create a /solutions or /products page with SoftwareApplication schema for the RTLS product

### Success signal
At end of month 1:
- Google Search Console shows Organization schema validated with zero errors
- OpenGraph validator (opengraph.xyz or LinkedIn post inspector) renders homepage card with image
- Homepage word count above 800 and includes at least 5 entity anchor terms (Emanate Wireless, Hudson Ohio, Gary Sugar, healthcare RTLS, real-time location system)

---

## MONTH 2 — CONTENT CITATION HOOKS (2026-06-07 – 2026-07-07)

### Theme
**Build content depth and schema hooks that AI engines can cite as authoritative sources.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 2.1 | Publish "/how-rtls-works" page (1,200+ words) with HowTo schema, explaining room-level accuracy, beacon architecture, and integration workflows | Schema Review (no HowTo schema detected) | 8 hours |
| 2.2 | Publish "/rtls-for-hospitals" page (1,000+ words) with FAQPage schema covering buyer objections and deployment timelines | Schema Review (no FAQPage detected) | 6 hours |
| 2.3 | Add BreadcrumbList schema to all pages (homepage, /how-rtls-works, /rtls-for-hospitals) | Schema Review (no BreadcrumbList detected) | 2 hours |
| 2.4 | Add SoftwareApplication schema to any product or solution page, including "applicationCategory": "HealthApplication" and "operatingSystem": "Any" | Schema Review (no SoftwareApplication detected) | 3 hours |
| 2.5 | Manually query ChatGPT, Perplexity, and Gemini with "best RTLS for hospitals" and log whether Emanate Wireless appears. Record baseline citation rate. | AI Citation Audit (no prior citation data) | 2 hours |

**Subtotal: ~21 hours.**

### Success signal
At end of month 2:
- At least two new content pages live with structured data validated in Google Rich Results Test
- BreadcrumbList schema rendering correctly in search console coverage report

---

## MONTH 3 — AUTHORITY + MEASUREMENT (2026-07-07 – 2026-08-07)

### Theme
**Layer in social proof schema, external signals, and set up tracking for AI engine visibility.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 3.1 | Add AggregateRating or Review schema to homepage or product page if any customer testimonials, case studies, or G2/Capterra reviews exist | Technical Audit red flag: "No AggregateRating detected" | 3 hours |
| 3.2 | Publish one case study or customer story (600+ words) with Article schema, mentioning hospital name (if permissible), deployment outcome, and accuracy metric | Schema Review (no Article schema detected) | 6 hours |
| 3.3 | Build a /resources or /faq page with 8-10 questions, deploy FAQPage schema, and interlink from homepage | Schema Review (no FAQPage detected) | 5 hours |
| 3.4 | Set up a weekly AI citation check: query 5 buyer-intent prompts in ChatGPT, Perplexity, Gemini. Log whether Emanate appears, and if so, which page is cited. | AI Citation Audit (manual tracking cadence) | 1 hour/week x 4 = 4 hours |
| 3.5 | Add "sameAs" links in Organization schema for any new profiles created (Twitter/X, Crunchbase, Apollo, industry directory) | Schema Review, Finding 1 (sameAs array currently has 1 link) | 2 hours |

### Success signal
At end of month 3:
- At least one AI engine cites Emanate Wireless in response to "real-time location system for hospitals" or similar query

---

## Long-horizon view (months 4–6, not scheduled here)

- **Month 4:** Publish comparison content ("RTLS vs. RFID for hospital asset tracking") with structured comparison tables and FAQ schema to capture high-intent queries
- **Month 5:** Add video schema and embed product demo or walkthrough on /how-rtls-works. Begin outreach to healthcare trade publications for backlinks and citations.
- **Month 6:** Build a public ROI calculator or interactive tool. Add SoftwareApplication schema for the tool itself. Monitor AI engine citations weekly and optimize pages that are getting traction.

---

## The single most important action

If the client only has time to do ONE thing in the next 7 days, it's this:

**Add Organization schema to the homepage using the exact JSON-LD block in Schema Review, Finding 1. This is the entity anchor that every other optimization depends on. Without it, Google and AI engines will not recognize Emanate Wireless as a structured entity, and no other schema or content work will deliver full ROI.**

---

## Expected outcomes by the end of the 90 days

**Realistic case:**
- Organization and WebSite schema validated and live across all pages
- Homepage word count above 800, thin content flag resolved
- 2-3 new content pages published with structured data (HowTo, FAQPage, BreadcrumbList)
- First AI engine citation logged in manual tracking spreadsheet

**Optimistic case:**
- All realistic case milestones achieved
- 3-5 AI engine citations across ChatGPT, Perplexity, Gemini for RTLS and healthcare asset tracking queries
- Google Knowledge Panel request submitted and entity recognized in Knowledge Graph
- 10-15% increase in organic impressions for brand and product category queries in Search Console

**Conservative case:**
- Organization and WebSite schema live, canonical tags deployed, OpenGraph images added
- Homepage copy expanded and alt text added to all images
- 1-2 new content pages published, schema validated but not yet indexed or cited
- No AI citations yet, but foundation is in place for month 4 traction