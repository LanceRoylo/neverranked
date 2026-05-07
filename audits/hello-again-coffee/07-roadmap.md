# 90-Day Roadmap — Hello Again Coffee

**Auditor:** Never Ranked
**Delivered:** 2026-05-07
**Window:** Months 1–3 (by 2026-08-07)

---

## Premise

Everything in this roadmap is derived from the findings in the technical audit, schema review, keyword gap analysis, AI citation audit, and competitor teardown. Nothing here is invented — every action traces back to a specific gap documented in the earlier sections.

**Starting position (as of 2026-05-07):**
- Zero schema markup across all pages (0% coverage)
- Homepage missing H1 and carrying only 224 words (thin content flag)
- No entity recognition by Google or AI engines (no Organization or LocalBusiness schema)
- No local pack eligibility (no structured address, hours, or geo coordinates)
- Title tag at 25 characters (under Google's 30-character minimum threshold)

**90-day target:**
- LocalBusiness and Organization schema live on homepage and all core pages (100% entity coverage)
- Homepage H1 implemented, word count expanded to 500+ words
- Google Search Console and Google Business Profile connected and monitored
- Local pack eligibility restored with full address, hours, and review schema
- Homepage title expanded to 50-60 characters with keyword coverage

---

## MONTH 1 — FOUNDATION (2026-05-07 – 2026-06-07)

### Theme
**Fix the entity vacuum and restore local pack eligibility.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 1.1 | Add CoffeeShop (LocalBusiness) schema to homepage with address, geo, hours, phone, priceRange | Schema Review § 1 | 2 hours |
| 1.2 | Add Organization schema to homepage with name, logo, URL, @id for entity linking | Schema Review § 2 | 1 hour |
| 1.3 | Add WebSite schema with SearchAction for sitelink search box eligibility | Technical Audit § 1 | 1 hour |
| 1.4 | Insert H1 on homepage ("Ridiculously Great Coffee in Honolulu" or equivalent) and adjust header hierarchy | Technical Audit § 2 | 0.5 hours |
| 1.5 | Expand homepage copy from 224 to 500+ words (add "Why Hello Again?" origin story, menu highlights, neighborhood section) | Technical Audit § 3 | 3 hours |
| 1.6 | Rewrite homepage title tag from 25 to 55 characters ("Hello Again Coffee | Specialty Coffee Shop in Honolulu, HI") | Technical Audit (red flags) | 0.5 hours |
| 1.7 | Trim meta description from 162 to 155 characters to avoid truncation in mobile SERPs | Technical Audit (red flags) | 0.5 hours |
| 1.8 | Connect Google Search Console and submit homepage URL for re-crawl after schema deployment | Technical Audit § 1 | 1 hour |

**Subtotal: ~9.5 hours of mechanical work.**

### Stretch tasks
- Add AggregateRating schema if Google Business Profile or Yelp reviews exist (pulls star rating into knowledge panel)
- Add Menu schema with coffee offerings (enables Google to surface menu items in local pack and AI answers)

### Success signal
At end of month 1:
- Google Rich Results Test shows valid CoffeeShop and Organization schema on homepage
- Google Search Console logs successful indexing of updated homepage with structured data
- Homepage H1 visible in browser and passes accessibility audit

---

## MONTH 2 — CONTENT CITATION HOOKS (2026-06-08 – 2026-07-08)

### Theme
**Build citeable content pages and expand schema coverage sitewide.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 2.1 | Create "About" page (600+ words) covering origin story, founders, roasting philosophy with Organization schema | Technical Audit § 3 | 4 hours |
| 2.2 | Create "Our Coffee" or "Menu" page with individual Product schema per coffee offering (name, description, price, image) | Schema Review § 1 | 5 hours |
| 2.3 | Create "Visit Us" page with map embed, hours, parking details, and duplicate LocalBusiness schema for reinforcement | Schema Review § 1 | 3 hours |
| 2.4 | Add BreadcrumbList schema to all new pages to enable breadcrumb rich results in SERPs | Technical Audit § 1 | 2 hours |
| 2.5 | Add internal links from homepage to new pages (About, Menu, Visit) using keyword-rich anchor text ("our story", "coffee menu", "Honolulu location") | Technical Audit § 3 | 1 hour |

**Subtotal: ~15 hours.**

### Success signal
At end of month 2:
- Four core pages live with full schema coverage (Home, About, Menu, Visit)
- Google Search Console shows 4+ indexed pages with valid structured data
- Internal link graph established with homepage as hub

---

## MONTH 3 — AUTHORITY + MEASUREMENT (2026-07-09 – 2026-08-07)

### Theme
**Capture social proof, monitor entity recognition, and prepare for ongoing citation capture.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 3.1 | Claim and optimize Google Business Profile (verify address, upload 10+ photos, post weekly updates) | Schema Review § 1 | 3 hours |
| 3.2 | Add AggregateRating schema to homepage once GBP reviews exceed 5 (pulls star rating into knowledge panel and local pack) | Schema Review § 1 | 1 hour |
| 3.3 | Set up monthly Google Search Console report tracking impressions for "coffee honolulu", "best coffee honolulu", brand queries | Technical Audit § 1 | 2 hours |
| 3.4 | Create FAQ page (500+ words, 6–8 Q&A pairs) with FAQPage schema covering "best time to visit", "do you have oat milk", "parking" | Schema Review (implicit need) | 4 hours |
| 3.5 | Test homepage in ChatGPT, Perplexity, and Google AI Overviews with queries "best coffee shops in Honolulu" and "Hello Again Coffee hours" to verify entity recognition | Technical Audit § 1 | 1 hour |

### Success signal
At end of month 3:
- Google Business Profile live with 10+ reviews and weekly posts
- Hello Again Coffee appears as structured entity in at least one AI engine response to "Honolulu coffee shops"
- Google Search Console shows non-zero impressions for local queries

---

## Long-horizon view (months 4–6, not scheduled here)

- **Month 4:** Launch blog with 2–4 posts per month targeting "best coffee for [use case]" and neighborhood guides (Waikiki, Downtown Honolulu). Add Article schema.
- **Month 5:** Build backlink campaign targeting Honolulu city guides, food bloggers, and Hawaii travel sites. Pitch "afternoon coffee culture" angle.
- **Month 6:** Create location-specific landing pages if expanding to second location. Add Event schema for coffee tastings or pop-ups.

---

## The single most important action

If the client only has time to do ONE thing in the next 7 days, it's this:

**Add CoffeeShop (LocalBusiness) schema to the homepage with full address, geo coordinates, phone, and opening hours. This single block restores local pack eligibility and entity recognition in Google and AI engines. Copy-paste the code from Schema Review § 1, replace placeholder values, deploy.**

---

## Expected outcomes by the end of the 90 days

**Realistic case:**
- Homepage ranks in Google local pack for "coffee near me" searches within 2-mile radius
- Google knowledge panel live with hours, address, reviews, and photos
- Google Search Console shows 200+ monthly impressions for Honolulu coffee queries

**Optimistic case:**
- Homepage ranks in top 3 local pack results for "best coffee Honolulu"
- At least one AI engine (Perplexity or ChatGPT) cites Hello Again Coffee by name in response to "Honolulu coffee shops"
- Google Business Profile accumulates 20+ reviews with 4.5+ star average

**Conservative case:**
- Google successfully indexes all schema markup (validated in Rich Results Test)
- Homepage appears in local pack for brand queries ("Hello Again Coffee")
- Google Search Console shows 100+ monthly impressions for brand + local queries