# 90-Day Roadmap — Central Pacific Bank

**Auditor:** Never Ranked
**Delivered:** 2026-05-07
**Window:** Months 1–3 (by 2026-08-07)

---

## Premise

Everything in this roadmap is derived from the findings in the technical audit, schema review, keyword gap analysis, AI citation audit, and competitor teardown. Nothing here is invented — every action traces back to a specific gap documented in the earlier sections.

**Starting position (as of 2026-05-07):**
- Zero schema markup on 100% of sampled pages (0 of 1)
- No canonical tags on any sampled pages (0 of 1)
- No meta descriptions on any sampled pages (0 of 1)
- 8 H1 tags on the homepage creating heading hierarchy confusion
- 34 of 56 images missing alt text (61% coverage gap)

**90-day target:**
- Organization and WebSite schema live on homepage and all major templates
- Canonical tags deployed site-wide via template inheritance
- Meta descriptions written and deployed for homepage and top 20 landing pages
- Single H1 per page across all templates
- Alt text coverage above 95% across all images

---

## MONTH 1 — FOUNDATION (2026-05-08 – 2026-06-07)

### Theme
**Fix the invisible technical gaps that prevent search engines and AI from understanding the site.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 1.1 | Add Organization schema (BankOrCreditUnion) to homepage with logo, address, social profiles, phone number | Schema Review § Missing Organization schema | 2 hours |
| 1.2 | Add WebSite schema with SearchAction to homepage, linking to internal search endpoint | Schema Review § Missing WebSite schema | 1.5 hours |
| 1.3 | Add self-referencing canonical tag to homepage template | Technical Audit § Missing canonical tags | 0.5 hours |
| 1.4 | Audit all page templates to identify H1 count and structure, then refactor homepage to use single H1 ("Want a bank for life? We got you.") and demote other headings to H2/H3 | Technical Audit § Multiple H1s | 3 hours |
| 1.5 | Write meta description for homepage (120-155 characters, include "Hawaii," "personal banking," "business banking") | Technical Audit § Missing meta description | 1 hour |
| 1.6 | Add og:image, og:title, og:description, and Twitter Card tags to homepage template | Technical Audit § Missing Open Graph tags | 1.5 hours |
| 1.7 | Audit all 56 homepage images, write alt text for the 34 missing (focus on decorative vs. informative, include location/service keywords where relevant) | Technical Audit § 34 images missing alt text | 4 hours |
| 1.8 | Extend canonical tag logic to all major page templates (product pages, branch locator, about, contact) via CMS or theme inheritance | Technical Audit § Missing canonical tags | 2 hours |

**Subtotal: ~15.5 hours of mechanical work.**

### Stretch tasks
- Add BreadcrumbList schema to product and service pages if site has hierarchical navigation
- Create a schema testing checklist and run homepage through Google Rich Results Test and Schema.org validator

### Success signal
At end of month 1:
- Homepage passes Google Rich Results Test with valid Organization and WebSite schema
- Homepage has exactly 1 H1, a canonical tag, a meta description, and full Open Graph coverage
- Image alt text coverage jumps from 39% to 95%+

---

## MONTH 2 — CONTENT CITATION HOOKS (2026-06-08 – 2026-07-07)

### Theme
**Build structured data and content patterns that AI engines can cite.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 2.1 | Identify top 10 product/service pages (checking loans, savings accounts, business banking) and add Service schema to each with name, description, provider reference, areaServed | Schema Review § Missing service-level schema | 6 hours |
| 2.2 | Write meta descriptions for the top 20 landing pages (products, services, branch locator, about) using the 80-160 character range | Technical Audit § Missing meta descriptions | 5 hours |
| 2.3 | Add LocalBusiness schema to branch locator pages or main branches, including geo coordinates, opening hours, and telephone | Schema Review § Missing LocalBusiness for branches | 4 hours |
| 2.4 | Create an FAQ page answering common banking questions ("How do I open a checking account?", "What are your business loan rates?") and mark up with FAQPage schema | Schema Review § No FAQPage detected | 6 hours |
| 2.5 | Add AggregateRating schema to homepage or testimonials page if customer reviews or ratings exist (Google, Trustpilot, internal survey) | Schema Review § No AggregateRating detected | 3 hours |

**Subtotal: ~24 hours.**

### Success signal
At end of month 2:
- At least 10 service pages have valid Service schema visible in Rich Results Test
- Branch locator has LocalBusiness schema with maps and hours
- FAQPage schema live and eligible for rich results in search

---

## MONTH 3 — AUTHORITY + MEASUREMENT (2026-07-08 – 2026-08-07)

### Theme
**Extend schema coverage, fix remaining technical debt, and set up tracking.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 3.1 | Audit all remaining page templates (blog, news, careers, legal) and deploy canonical tags site-wide | Technical Audit § Missing canonical tags | 3 hours |
| 3.2 | Add Article schema to any blog posts or news releases, including author, datePublished, publisher reference | Schema Review § No Article schema detected | 4 hours |
| 3.3 | Set up Google Search Console schema monitoring and create a dashboard tracking Organization, WebSite, FAQPage, and Service impressions | Schema Review § Need for ongoing validation | 2 hours |
| 3.4 | Run a full crawl (Screaming Frog or Sitebulb) to validate H1 counts, canonical coverage, meta description coverage, and image alt text across the entire site | Technical Audit § Need for site-wide validation | 3 hours |
| 3.5 | Document schema patterns in a living style guide so future pages inherit correct JSON-LD templates (Organization, Service, LocalBusiness, FAQPage) | Schema Review § Long-term consistency | 3 hours |

### Success signal
At end of month 3:
- 100% of major templates have canonical tags and single H1s
- Google Search Console shows valid schema impressions for at least 4 types (Organization, WebSite, Service, FAQPage)
- Full-site crawl confirms meta description coverage above 90% and alt text coverage above 95%

---

## Long-horizon view (months 4–6, not scheduled here)

- **Month 4:** Internal linking audit to strengthen topical clusters around personal banking, business banking, and branch locations
- **Month 5:** Competitive content gap analysis and creation of long-form guides on high-intent queries (mortgage rates, business loan qualifications, branch services)
- **Month 6:** AI citation tracking via SearchGPT, Perplexity, and Google SGE to measure schema and content impact on LLM answer inclusion

---

## The single most important action

If the client only has time to do ONE thing in the next 7 days, it's this:

**Add Organization schema (BankOrCreditUnion) to the homepage using the ready-to-paste code in Schema Review § Missing Organization schema. This single block unlocks entity recognition across Google, Bing, and every AI engine scraping the site.**

---

## Expected outcomes by the end of the 90 days

**Realistic case:**
- Homepage and top 20 pages have complete technical SEO coverage (canonical, meta description, Open Graph, schema)
- 4 schema types live and validated in Google Search Console (Organization, WebSite, Service, FAQPage)
- Image alt text and H1 structure issues resolved site-wide

**Optimistic case:**
- All major page templates inherit schema and canonical logic automatically
- Google starts showing rich results (sitelinks search box, FAQ snippets) within 60 days
- AI engines begin citing Central Pacific Bank by name in answers to "best banks in Hawaii" and "business banking Hawaii" queries

**Conservative case:**
- Homepage has Organization and WebSite schema, canonical, and meta description
- Top 10 service pages have Service schema
- H1 and image alt issues resolved on homepage and top landing pages