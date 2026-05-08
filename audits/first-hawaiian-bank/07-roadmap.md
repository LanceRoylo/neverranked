# 90-Day Roadmap — First Hawaiian Bank

**Auditor:** Never Ranked
**Delivered:** 2026-05-08
**Window:** Months 1–3 (by 2026-08-08)

---

## Premise

Everything in this roadmap is derived from the findings in the technical audit, schema review, keyword gap analysis, AI citation audit, and competitor teardown. Nothing here is invented. Every action traces back to a specific gap documented in the earlier sections.

**Starting position (as of 2026-05-08):**
- Zero structured data across all 10 sampled pages (0% schema coverage)
- Zero social preview cards configured (0 of 10 pages have og:image)
- 2 homepage variants missing H1 tags (20% of sampled pages have no heading structure)
- 39 of 224 images missing alt text (17% accessibility and AEO gap)
- 3 pages with title tags under 30 characters (30% below minimum recommended length)

**90-day target:**
- Organization, WebSite, BreadcrumbList, and FinancialProduct schema live on 100% of site
- Social preview cards configured site-wide with branded 1200×630 images
- All pages have single, keyword-rich H1 tags
- Alt text added to 100% of images
- Title tags optimized to 50–60 characters on all pages

---

## MONTH 1 — FOUNDATION (2026-05-08 – 2026-06-08)

### Theme
**Deploy entity markup and fix critical on-page gaps so Google and AI engines know who you are.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 1.1 | Add Organization schema (FinancialService type) to site-wide template | Section 03, Finding 1 | 2 hours |
| 1.2 | Add WebSite schema with sitelinks search box to homepage template | Section 03, Finding 2 | 1 hour |
| 1.3 | Add BreadcrumbList schema to all interior pages (product pages, routing numbers, private banking) | Section 03, Finding 3 | 3 hours |
| 1.4 | Configure Open Graph tags site-wide (og:title, og:description, og:image, og:type) | Section 02, Finding 1 | 4 hours |
| 1.5 | Create and upload 1200×630 branded social preview image for default og:image | Section 02, Finding 1 | 1 hour |
| 1.6 | Add H1 tags to both homepage variants (https://fhb.com and https://www.fhb.com/en) | Section 02, Finding 2 | 1 hour |
| 1.7 | Expand 3 short title tags (CDs page, routing numbers, invest page) to 50–60 characters | Section 02, Finding 3 | 1 hour |
| 1.8 | Trim 2 meta descriptions over 160 characters (Traditional IRA, Roth IRA) to 155 characters | Section 02, Finding 4 | 30 minutes |

**Subtotal: ~13.5 hours of mechanical work.**

### Stretch tasks
- Add Twitter Card markup (twitter:card, twitter:image) alongside Open Graph tags
- Audit and fix meta description under 80 characters on routing numbers page (currently 54 characters)

### Success signal
At end of month 1:
- Google Search Console shows Organization and WebSite schema validated with zero errors
- LinkedIn share preview tool shows branded card with image and title for any page shared
- All 10 sampled pages have exactly one H1 tag

---

## MONTH 2 — CONTENT CITATION HOOKS (2026-06-09 – 2026-07-09)

### Theme
**Add product-level schema and close image accessibility gaps so AI engines can cite your services and visual content.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 2.1 | Write and add alt text to 39 images missing alt attributes across sampled pages | Section 02, Finding 5 | 3 hours |
| 2.2 | Deploy FinancialProduct schema to Traditional IRA page (interestRate, feesAndCommissionsSpecification, name, description) | Section 03, Finding 4 | 2 hours |
| 2.3 | Deploy FinancialProduct schema to Roth IRA page | Section 03, Finding 4 | 2 hours |
| 2.4 | Deploy FinancialProduct schema to CDs page | Section 03, Finding 4 | 2 hours |
| 2.5 | Add FAQPage schema to routing numbers page (mark up "What is FHB routing number?" implicit questions in body copy) | Section 03, Finding 5 | 2 hours |

**Subtotal: ~11 hours.**

### Success signal
At end of month 2:
- Schema validator shows FinancialProduct markup on all three IRA and CD pages with zero errors
- Google Search Console rich results report shows FAQPage eligible for routing numbers page
- Lighthouse accessibility audit shows 0 images missing alt text on sampled pages

---

## MONTH 3 — AUTHORITY + MEASUREMENT (2026-07-10 – 2026-08-08)

### Theme
**Add social proof schema, validate all markup, and set up monitoring infrastructure.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 3.1 | Add AggregateRating schema to Traditional IRA page (scan detected "has_rating_text": true on this page) | Section 03, Finding 6 | 2 hours |
| 3.2 | Deploy site-wide schema to remaining unsampled pages (business checking, personal savings hub, wealth management hub) | Section 03, Summary | 4 hours |
| 3.3 | Validate all schema with Google Rich Results Test and Schema Markup Validator, fix any errors | Section 03, Finding 7 | 2 hours |
| 3.4 | Set up monthly schema coverage monitoring (crawl 50 pages, export schema type frequency to CSV) | Section 03, Summary | 1 hour |
| 3.5 | Configure Google Search Console enhanced reports for FinancialProduct and FAQPage (track impressions and clicks) | Section 03, Findings 4 and 5 | 1 hour |

### Success signal
At end of month 3:
- 100% of product pages have FinancialProduct schema validated with zero errors
- AggregateRating schema live on at least one product page
- Monthly schema audit dashboard running (tracks schema type coverage across top 50 pages)

---

## Long-horizon view (months 4–6, not scheduled here)

- **Month 4:** Deploy HowTo schema to onboarding and how-to-open-account content. Add LocalBusiness schema to branch location pages if they exist.
- **Month 5:** Build FAQPage schema for top 10 informational queries (detected in keyword gap analysis, section 04). Add Article schema to blog or resource center if present.
- **Month 6:** Audit competitor schema coverage. Deploy Review schema to testimonial content. Expand AggregateRating to all product pages with ratings or testimonials.

---

## The single most important action

If the client only has time to do ONE thing in the next 7 days, it's this:

**Add Organization schema (FinancialService type) to the site-wide template.** This unlocks entity recognition for Google and every AI engine. Without it, you are invisible in knowledge panels, local pack, and AI-cited answers. Paste the ready-to-ship JSON-LD block from Section 03, Finding 1 into your site header. Two-hour task, highest leverage of anything in this roadmap.

---

## Expected outcomes by the end of the 90 days

**Realistic case:**
- Google Search Console shows 8 to 10 pages with validated FinancialProduct, Organization, WebSite, and BreadcrumbList schema
- LinkedIn and Slack share previews show branded card with image and title for 100% of shared pages
- AI engines (ChatGPT, Perplexity) begin citing First Hawaiian Bank with structured entity data in answers to "best Hawaii bank for IRAs" queries
- Zero schema errors in Google Rich Results Test

**Optimistic case:**
- FinancialProduct rich results appear in Google search for "First Hawaiian Bank Traditional IRA" and related queries
- FAQPage rich results (dropdown accordions) appear for routing numbers page
- Knowledge panel for First Hawaiian Bank appears in Google search with logo, founding info, and service areas sourced from Organization schema
- 15 to 20 percent increase in click-through rate from search due to breadcrumb and product rich results

**Conservative case:**
- Schema deployed and validated with zero errors, but rich results take 45 to 60 days to appear in search
- Social preview cards live but share volume remains low (requires separate content distribution effort)
- AI citation frequency improves modestly (2 to 3 citations detected in next ChatGPT or Perplexity audit)