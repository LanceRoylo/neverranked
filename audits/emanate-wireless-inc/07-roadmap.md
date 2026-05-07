# 90-Day Roadmap — Emanate Wireless, Inc.

**Auditor:** Never Ranked
**Delivered:** 2026-05-07
**Window:** Months 1–3 (by 2026-08-07)

---

## Premise

Everything in this roadmap is derived from the findings in the technical audit, schema review, keyword gap analysis, AI citation audit, and competitor teardown. Nothing here is invented — every action traces back to a specific gap documented in the earlier sections.

**Starting position (as of 2026-05-07):**
- Zero schema markup deployed (0 of 1 sampled pages have any structured data)
- 100% of sampled pages missing canonical tags
- 100% of sampled pages missing social preview images (og:image)
- Homepage has 159 words (thin content, under 300-word threshold)
- 8 of 12 images missing alt text (67% of images invisible to screen readers and AI engines)

**90-day target:**
- Organization and WebSite schema live on every page (entity recognition enabled for AI engines)
- Canonical tags deployed sitewide (URL consolidation complete)
- Social preview cards functional on all core pages (LinkedIn, ChatGPT, and Perplexity will display proper previews)
- Homepage expanded to 800+ words with product differentiation, use cases, and buyer persona hooks
- Product or SoftwareApplication schema deployed for RTLS offering (rich result eligibility unlocked)

---

## MONTH 1 — FOUNDATION (2026-05-07 – 2026-06-07)

### Theme
**Establish entity identity and fix foundational indexing gaps.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 1.1 | Deploy Organization schema sitewide via NeverRanked snippet | Schema Review § 1 | 0 hours (NR ships) |
| 1.2 | Deploy WebSite schema with SearchAction property | Schema Review § 2 | 0 hours (NR ships) |
| 1.3 | Add canonical tag to homepage and all existing pages | Technical Audit § 2 | 2 hours |
| 1.4 | Add og:image, og:type, twitter:card, and twitter:image tags to homepage | Technical Audit (inferred from og_image: false, twitter_card: false) | 1 hour |
| 1.5 | Fix multiple H1 issue on homepage (reduce from 3 H1s to 1) | Technical Audit (inferred from h1_count: 3) | 0.5 hours |
| 1.6 | Expand title tag from 16 characters to 50-60 characters (include "RTLS" or "real-time location system" + "healthcare") | Technical Audit (inferred from title_len: 16, too_short_under_30: 1) | 0.5 hours |
| 1.7 | Add alt text to 8 images currently missing it | Technical Audit (inferred from img_no_alt: 8) | 1 hour |
| 1.8 | Create and upload square logo file (minimum 512x512px) for Organization schema logo property | Schema Review § 1 | 1 hour |

**Subtotal: ~6 hours of mechanical work.**

### Stretch tasks
- Add BreadcrumbList schema to homepage if site navigation structure is multi-level
- Upload default social share image (1200x630px) to use across all pages without custom images

### Success signal
At end of month 1:
- Google Rich Results Test shows valid Organization and WebSite schema on homepage
- Google Search Console shows canonical tags recognized on all submitted URLs
- When homepage URL is pasted into LinkedIn or ChatGPT share preview, image and title appear correctly

---

## MONTH 2 — CONTENT CITATION HOOKS (2026-06-08 – 2026-07-08)

### Theme
**Expand thin content, add product schema, and build AI-citeable product differentiation.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 2.1 | Expand homepage copy from 159 words to 800+ words (add use cases, buyer benefits, room-level accuracy claim detail, competitive differentiation) | Technical Audit (inferred from word_count: 159, thin_pages_under_300_words: 1) | 6 hours |
| 2.2 | Deploy SoftwareApplication or Product schema for RTLS offering (include name, description, applicationCategory, operatingSystem or compatibility, offers with price transparency if possible) | Schema Review (inferred from zero product/service schema, B2B context) | 3 hours |
| 2.3 | Create dedicated /products or /rtls-solution page with 1,200+ words covering product specs, accuracy claims, integrations, and healthcare-specific use cases | Schema Review, thin content finding | 8 hours |
| 2.4 | Add FAQPage schema to homepage or dedicated FAQ section (minimum 5 Q&A pairs addressing buyer objections: accuracy, installation, integration, compliance, ROI) | Schema Review (inferred from FAQPage: ❌, B2B buyer education need) | 4 hours |
| 2.5 | Write and publish one long-form resource (1,500+ words): "How to evaluate RTLS accuracy claims" or "Room-level vs. zone-level location tracking in hospitals" | AI citation need, thin content, domain authority | 10 hours |

**Subtotal: ~31 hours.**

### Success signal
At end of month 2:
- Homepage passes 800-word threshold and includes at least three distinct use cases (e.g., asset tracking, patient flow, equipment utilization)
- SoftwareApplication schema validates in Google Rich Results Test
- At least one long-form resource page is indexed and appears in site: search for brand + topic

---

## MONTH 3 — AUTHORITY + MEASUREMENT (2026-07-09 – 2026-08-07)

### Theme
**Add social proof schema, build citation-worthy comparison content, and instrument tracking.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 3.1 | Add AggregateRating schema to homepage or product page if customer ratings, case study metrics, or testimonials exist | Schema Review (inferred from no AggregateRating detected, has_rating_text: false) | 3 hours |
| 3.2 | Write and publish RTLS vendor comparison page (1,800+ words): feature matrix, accuracy specs, use-case fit, integration requirements. Cite 3-5 competitors by name. | AI citation gap, B2B buyer research behavior | 12 hours |
| 3.3 | Add HowTo schema to any implementation or setup guide content (if available), or create new "How to deploy RTLS in a hospital environment" guide with step-by-step HowTo markup | Schema Review (inferred from HowTo: ❌, technical product complexity) | 6 hours |
| 3.4 | Set up Google Search Console, submit XML sitemap, and confirm all core pages are indexed | Technical foundation, measurement | 2 hours |
| 3.5 | Set up monthly citation tracking: query "best RTLS for healthcare" and "room-level location tracking healthcare" in ChatGPT, Perplexity, and Google AI Overviews. Document whether Emanate Wireless is cited. | AI citation audit, ongoing measurement | 1 hour/month |

### Success signal
At end of month 3:
- AggregateRating schema deployed (even if based on internal case study data or early customer feedback)
- Comparison page indexed and ranking for at least one long-tail query (e.g., "RTLS accuracy comparison healthcare")
- Google Search Console shows at least 5 indexed pages and zero mobile usability errors

---

## Long-horizon view (months 4–6, not scheduled here)

- **Month 4:** Build out case study or customer story content with Review schema. Target one detailed healthcare deployment case study (anonymized if necessary) with measurable outcomes.
- **Month 5:** Launch resource hub or blog with monthly publication cadence. Focus on clinical engineering and hospital IT buyer personas. Target queries like "RTLS implementation checklist" and "healthcare asset tracking ROI."
- **Month 6:** Audit inbound link profile and execute targeted outreach to healthcare IT publication directories, industry association listings, and relevant roundup posts. Goal: 10 new referring domains.

---

## The single most important action

If the client only has time to do ONE thing in the next 7 days, it's this:

**Expand the homepage from 159 words to 800+ words with specific use cases (asset tracking, patient flow, equipment utilization), accuracy claims with context (99.9% room-level accuracy vs. competitors' zone-level tracking), and buyer benefits for hospital procurement and clinical engineering teams. This content feeds every other fix: it gives schema markup something to describe, gives AI engines facts to cite, and gives Google enough signal to understand what you actually do.**

---

## Expected outcomes by the end of the 90 days

**Realistic case:**
- Google recognizes Emanate Wireless as a known entity (Organization schema indexed, knowledge graph candidate)
- Homepage ranks in top 50 for one branded + category query (e.g., "Emanate Wireless RTLS")
- At least one non-branded query surfaces the site in position 20-50 (e.g., "room level location tracking healthcare")
- ChatGPT or Perplexity cites Emanate Wireless in at least one test query response about healthcare RTLS vendors

**Optimistic case:**
- Homepage or product page appears in Google's AI Overview for one buyer-intent query (e.g., "best RTLS for hospitals")
- Comparison page ranks in top 20 for a long-tail comparison query
- Two or more AI engines cite Emanate Wireless when asked about RTLS accuracy or healthcare asset tracking
- Google Search Console shows 15+ indexed pages and measurable impressions growth for non-branded category terms

**Conservative case:**
- All foundational schema deployed and validated (no rich result errors in Search Console)
- Canonical and social preview tags functional sitewide (no indexing ambiguity, proper social sharing)
- Homepage expanded to 800+ words and indexed with updated title and meta description
- Internal tracking system in place (Search Console active, monthly AI citation checks documented)