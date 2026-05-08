# 90-Day Roadmap — MVNP

**Auditor:** Never Ranked
**Delivered:** 2026-05-08
**Window:** Months 1–3 (by 2026-08-08)

---

## Premise

Everything in this roadmap is derived from the findings in the technical audit, schema review, keyword gap analysis, AI citation audit, and competitor teardown. Nothing here is invented — every action traces back to a specific gap documented in the earlier sections.

**Starting position (as of 2026-05-08):**
- 8 of 9 pages missing H1 tags (no semantic anchor for AI engines to parse)
- 7 of 9 pages contain under 300 words (thin content that AI engines skip for citation)
- Zero Service schema published (competitors with Service markup get cited, you get skipped)
- Zero BreadcrumbList schema (no rich breadcrumbs in Google results)
- Testimonial text detected on every page but no Review or AggregateRating schema (social proof invisible to AI)

**90-day target:**
- All 9 pages have proper H1 structure (one per page, or corrected multi-H1 on homepage)
- Capabilities and two high-traffic pages expanded to 400+ words with citation-ready statements
- Service schema live on homepage and capabilities page
- BreadcrumbList schema deployed site-wide
- At least 3 client testimonials wrapped in Review schema with AggregateRating on homepage

---

## MONTH 1 — FOUNDATION (2026-05-08 – 2026-06-08)

### Theme
**Fix the semantic layer so AI engines can parse what each page is about.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 1.1 | Add one H1 tag to each of the 8 pages missing H1s (newsletter archives, about/1972, awards, capabilities, careers) | Technical Audit § 1 | 2 hours |
| 1.2 | Fix homepage H1 structure (choose primary hero H1, demote other 3 to H2 or H3) | Technical Audit § 1 | 30 min |
| 1.3 | Add Service schema to homepage (paste JSON-LD block covering advertising, PR, marketing services) | Schema Review § 1 | 1 hour |
| 1.4 | Add Service schema to capabilities page | Schema Review § 1 | 30 min |
| 1.5 | Deploy BreadcrumbList schema site-wide (either via WordPress plugin or manual JSON-LD in header) | Schema Review § 2 | 2 hours |
| 1.6 | Validate all new schema in Google Rich Results Test and Schema.org validator | Schema Review § 1, § 2 | 1 hour |
| 1.7 | Expand capabilities page from 510 words to 600+ words (add 2-3 client outcome statements that AI engines can cite) | Technical Audit § 2 | 2 hours |
| 1.8 | Expand careers page from 153 words to 400+ words (add culture details, what makes MVNP different, team benefits) | Technical Audit § 2 | 2 hours |

**Subtotal: ~11 hours of mechanical work.**

### Stretch tasks
- Add FAQ section to homepage or capabilities page (3-5 common client questions) and wrap in FAQPage schema
- Expand about/1972 page to 300+ words (add agency founding story, timeline milestones)

### Success signal
At end of month 1:
- Google Rich Results Test shows valid Service and BreadcrumbList schema with zero errors
- All 9 pages have exactly one H1 tag when inspected in browser dev tools
- Capabilities and careers pages pass 400-word threshold when checked in word counter

---

## MONTH 2 — CONTENT CITATION HOOKS (2026-06-08 – 2026-07-08)

### Theme
**Give AI engines quotable, semantic-rich content on your best pages.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 2.1 | Rewrite homepage to 500+ words (add 200 words of agency positioning, client outcomes, service differentiation) | Technical Audit § 2 | 3 hours |
| 2.2 | Add 3 case study summaries to capabilities page (client name, challenge, outcome, result in numbers) | Technical Audit § 2 | 4 hours |
| 2.3 | Wrap 3 client testimonials in Review schema with reviewRating properties | Schema Review § 3 | 2 hours |
| 2.4 | Add AggregateRating schema to homepage (derive from the 3 reviews, or use broader client satisfaction data if available) | Schema Review § 3 | 1 hour |
| 2.5 | Publish one long-form thought leadership piece (800+ words) on a topic your target clients search for ("how to choose a Hawaii advertising agency" or "PR strategy for Hawaii tourism brands") | Technical Audit § 2 | 6 hours |

**Subtotal: ~16 hours.**

### Success signal
At end of month 2:
- Homepage displays star rating snippet in Google search results (verify in Google Search Console or live search)
- At least one new page ranks in top 50 for a non-branded query when checked in Ahrefs or Semrush
- Perplexity or ChatGPT cites MVNP when prompted with "best Hawaii advertising agency" or "Hawaii PR firm services" (test manually)

---

## MONTH 3 — AUTHORITY + MEASUREMENT (2026-07-08 – 2026-08-08)

### Theme
**Establish measurement baselines and close the remaining high-value schema gaps.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 3.1 | Add FAQPage schema to capabilities page (write 5 common client questions, wrap in schema) | Schema Review § 4 | 3 hours |
| 3.2 | Publish 2 more long-form pieces (repeat the pattern from Month 2, targeting adjacent client search queries) | Technical Audit § 2 | 12 hours |
| 3.3 | Set up Google Search Console tracking for rich result impressions (monitor Service, Review, FAQ, Breadcrumb performance) | Schema Review (all sections) | 1 hour |
| 3.4 | Run monthly AI citation audit (prompt Perplexity, ChatGPT, Gemini with 5 target queries, document which engines cite MVNP) | Schema Review § 3 | 2 hours |
| 3.5 | Expand newsletter archive pages to 250+ words each (add context for why the newsletters matter, key themes, downloadable back-issue links) | Technical Audit § 2 | 4 hours |

**Subtotal: ~22 hours.**

### Success signal
At end of month 3:
- Google Search Console shows at least 50 impressions per month for rich results (Review, FAQ, or Breadcrumb)
- AI citation audit shows MVNP cited in at least 2 of 5 test queries (up from zero today)
- All sampled pages pass 300-word threshold

---

## Long-horizon view (months 4–6, not scheduled here)

- **Month 4:** Competitor content gap analysis (identify the 10 queries competitors rank for that MVNP does not, publish targeting content)
- **Month 5:** Build out a case studies section with full Article schema on each case study (target "Hawaii agency portfolio" and similar queries)
- **Month 6:** Launch quarterly thought leadership series (one deep-dive piece per quarter, optimized for AI citation and long-tail B2B queries)

---

## The single most important action

If the client only has time to do ONE thing in the next 7 days, it's this:

**Add Service schema to the homepage (paste the JSON-LD block from Schema Review § 1 into your site header). This is a 1-hour task that immediately makes your services machine-readable to every AI engine. Competitors who have this get cited. You currently do not.**

---

## Expected outcomes by the end of the 90 days

**Realistic case:**
- Google displays rich results (star ratings, breadcrumbs, or FAQ accordions) for at least 2 MVNP pages in search results
- At least 1 AI engine (Perplexity, ChatGPT, or Gemini) cites MVNP when answering "best Hawaii advertising agency" or related query
- Organic impressions increase 15-25% in Google Search Console due to improved semantic structure and expanded content

**Optimistic case:**
- 3+ pages show rich results in Google search
- 2+ AI engines cite MVNP in test queries
- One new long-form piece ranks in top 20 for a high-value non-branded query
- Organic impressions increase 30-40%

**Conservative case:**
- Rich results appear for homepage only (star rating from Review schema)
- AI citation happens in 1 of 5 test queries
- Organic impressions increase 10-15% (mainly from improved H1 structure and breadcrumb schema reducing bounce rate)