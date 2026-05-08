# 90-Day Roadmap — Bank of Hawaii

**Auditor:** Never Ranked
**Delivered:** 2026-05-08
**Window:** Months 1–3 (by 2026-08-08)

---

## Premise

Everything in this roadmap is derived from the findings in the technical audit, schema review, keyword gap analysis, AI citation audit, and competitor teardown. Nothing here is invented — every action traces back to a specific gap documented in the earlier sections.

**Starting position (as of 2026-05-08):**
- 0 of 9 sampled pages have canonical tags (0%)
- 33% of pages have any schema markup (3 of 9)
- Zero AggregateRating schema despite testimonial and rating language on 3 pages
- 3 pages have no H1, 2 pages have multiple H1s (56% structural inconsistency)
- No sitewide Organization or WebSite schema (AI engines have no brand identity hook)

**90-day target:**
- 100% canonical coverage across all published pages
- Sitewide Organization and WebSite schemas deployed to every page
- AggregateRating schema live on homepage and service pages
- 100% H1 compliance (one per page, semantically aligned with title)
- Person schema deployed on all expert bio pages, Article schema on all blog posts

---

## MONTH 1 — FOUNDATION (2026-05-08 – 2026-06-08)

### Theme
**Fix the technical layer so crawlers and AI engines can index and attribute your content correctly.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 1.1 | Deploy canonical tags to all published pages (start with the 9 sampled pages, then sitewide rollout) | Technical Audit §1 | 4 hours |
| 1.2 | Add sitewide Organization schema to `<head>` template (includes name, address, phone, founding date, social links) | Schema Review §1 | 2 hours |
| 1.3 | Add sitewide WebSite schema with search action (potentialAction pointing to your site search) | Schema Review §1 | 1 hour |
| 1.4 | Fix H1 structure on 3 pages with missing H1 (annual report, bank-by-appointment, community/olelo) | Technical Audit (H1 findings) | 2 hours |
| 1.5 | Fix H1 structure on 2 pages with multiple H1s (homepage, careers/benefits) — consolidate to one semantic H1 | Technical Audit (H1 findings) | 2 hours |
| 1.6 | Add alt text to 10 images missing it (1 per page across homepage, timeline, annual report, etc.) | Technical Audit (image findings) | 1.5 hours |
| 1.7 | Trim 3 meta descriptions over 160 characters (timeline page is 181 chars, annual report expert page is 198 chars, community/olelo is 166 chars) | Technical Audit (meta desc length findings) | 1 hour |
| 1.8 | Shorten 1 title tag over 65 characters (Roger Khlopin expert page is 79 chars) | Technical Audit (title length findings) | 0.5 hours |

**Subtotal: ~14 hours of mechanical work.**

### Stretch tasks
- Audit and fix H1 structure on all pages beyond the 9 sampled (if headcount allows)
- Add BreadcrumbList schema to blog and expert bio pages (currently missing on 6 of 9 pages)

### Success signal
At end of month 1:
- Google Search Console shows canonical tags detected on 100% of indexed pages
- Schema validator (schema.org validator or Google Rich Results Test) shows Organization and WebSite schemas present on homepage and at least 5 other sampled pages
- All 9 sampled pages pass H1 audit (exactly one H1 per page, aligned with page topic)

---

## MONTH 2 — CONTENT CITATION HOOKS (2026-06-08 – 2026-07-08)

### Theme
**Give AI engines structured proof points and expert signals so they can cite your content in answer engines.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 2.1 | Deploy AggregateRating schema to homepage (use existing customer satisfaction data or third-party review aggregate) | Schema Review §2 | 3 hours |
| 2.2 | Deploy Article schema to blog post (financial windfall page) — include headline, datePublished, author, image | Schema Review (blog post has no schema) | 2 hours |
| 2.3 | Deploy Person schema to expert bio page (Roger Khlopin) — include name, jobTitle, worksFor, sameAs (LinkedIn if available) | Schema Review (expert bio has no schema) | 2 hours |
| 2.4 | Add FAQPage schema to bank-by-appointment service page (extract Q&A pairs from existing content in H3 sections) | Schema Review (service page missing FAQ markup) | 3 hours |
| 2.5 | Deploy Service schema to at least 2 additional service pages beyond bank-by-appointment (identify top 2 service landing pages from analytics) | Schema Review (only 1 page has Service schema) | 4 hours |

**Subtotal: ~14 hours.**

### Success signal
At end of month 2:
- AggregateRating schema validates on homepage and displays rating stars in Google Rich Results Test
- At least 3 blog posts have Article schema (starting with the sampled financial windfall post, then rolling out template)
- Expert bio pages show Person schema in validator with jobTitle and organization linkage

---

## MONTH 3 — AUTHORITY + MEASUREMENT (2026-07-08 – 2026-08-08)

### Theme
**Expand schema coverage to remaining high-value pages and instrument AI citation tracking.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 3.1 | Deploy Article schema to all remaining blog posts (estimate 10-15 posts based on site structure, use CMS template if available) | Schema Review (6 of 9 pages have no schema) | 6 hours |
| 3.2 | Deploy Person schema to all expert bio pages in Center for Family Business section (start with Roger Khlopin template, replicate) | Schema Review (expert pages missing Person markup) | 4 hours |
| 3.3 | Add FAQPage schema to top 5 service or informational pages (identify from GA4 landing page report, extract natural Q&A pairs from content) | Schema Review (zero FAQPage schemas detected) | 6 hours |
| 3.4 | Set up AI citation monitoring using ChatGPT search operator and Perplexity brand queries (document baseline citations for "best bank in Hawaii" and "Bank of Hawaii services") | Schema Review §2 (AI engines have no social proof hook) | 3 hours |
| 3.5 | Run post-deployment schema audit using Google Rich Results Test and schema.org validator on all updated pages, document errors | Quality assurance across all Month 1-3 work | 3 hours |

### Success signal
At end of month 3:
- 100% of blog posts and expert bios have appropriate schema (Article, Person)
- At least 5 pages have FAQPage schema validated and eligible for rich results
- Baseline AI citation report complete, showing before/after snapshot of brand mentions in ChatGPT, Perplexity, and Google AI Overviews for 10 target queries

---

## Long-horizon view (months 4–6, not scheduled here)

- **Month 4:** Deploy VideoObject schema to any video content, add HowTo schema to tutorial or guide pages
- **Month 5:** Build topical authority cluster around "Hawaii banking" and "small business banking Hawaii" with interlinked pillar + spoke content, each with Article and FAQPage schemas
- **Month 6:** Expand AggregateRating schema to individual service pages (mortgages, business banking, etc.) using segmented review data

---

## The single most important action

If the client only has time to do ONE thing in the next 7 days, it's this:

**Deploy canonical tags to every page on the site (Task 1.1). Without canonicals, every other optimization is compromised by indexing ambiguity and diluted authority. This is the foundation for all AI and search visibility.**

---

## Expected outcomes by the end of the 90 days

**Realistic case:**
- Google Search Console shows 100% canonical coverage and zero duplicate content warnings
- 80% of high-value pages (homepage, top 10 service pages, top 10 blog posts, all expert bios) have appropriate schema validated in Rich Results Test
- Structured AggregateRating on homepage eligible for star display in search results
- Baseline AI citation tracking in place, showing 2-3 new ChatGPT or Perplexity citations for brand queries

**Optimistic case:**
- 100% schema coverage across all content types (blog, service, expert, community pages)
- AggregateRating schema drives measurable CTR lift on homepage SERP listing (5-10% increase)
- AI citation report shows 5+ new mentions in answer engines for competitive queries like "best Hawaii bank for small business"
- Zero H1, canonical, or meta length errors across entire site

**Conservative case:**
- Canonical and H1 fixes complete across sampled pages, partial rollout to rest of site
- Organization and WebSite schemas live sitewide
- AggregateRating and at least 10 Article schemas deployed and validated
- Measurement framework in place, early signal data collected but not yet statistically significant