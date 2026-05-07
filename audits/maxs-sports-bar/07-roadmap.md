# 90-Day Roadmap — Max's Sports Bar

**Auditor:** Never Ranked
**Delivered:** 2026-05-07
**Window:** Months 1–3 (by 2026-08-07)

---

## Premise

Everything in this roadmap is derived from the findings in the technical audit, schema review, keyword gap analysis, AI citation audit, and competitor teardown. Nothing here is invented. Every action traces back to a specific gap documented in the earlier sections.

**Starting position (as of 2026-05-07):**
- 0 of 10 pages have canonical tags (100% missing)
- 1 of 10 pages carry any schema (homepage only, LocalBusiness)
- 9 of 10 pages have title tags under 30 characters
- 8 of 10 pages fall under 300 words (thin content)
- 10 of 21 images missing alt text (48% accessibility gap)

**90-day target:**
- 10 of 10 pages with canonicals, Organization schema, and proper title tags
- Homepage includes WebSite and BreadcrumbList schema
- All 10 pages meet minimum 300-word threshold or justify brevity with structured data
- Zero images without alt text
- Contact and Events pages gain Menu and Event schema respectively

---

## MONTH 1 — FOUNDATION (2026-05-08 – 2026-06-07)

### Theme
**Fix the entity signals and technical blockers that prevent Google and AI engines from understanding who Max's Sports Bar is and which pages are authoritative.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 1.1 | Add self-referencing canonical tags to all 10 pages (template-level implementation if possible) | Technical Audit §1 | 2 hours |
| 1.2 | Deploy Organization schema site-wide (in header/footer template) with name, logo, address, phone, and sameAs social profiles | Schema Review §1 | 3 hours |
| 1.3 | Add WebSite schema with SearchAction to homepage (or site-wide) to enable sitelink search box | Schema Review §2 | 1 hour |
| 1.4 | Rewrite title tags for 9 pages (About Us, Contact, Drinks, Events, Cubs, Food Menu, Cornhole About, Crawfish Information, NFL Pick'em) to 40–60 characters with location and keyword modifiers | Technical Audit §3 | 4 hours |
| 1.5 | Add meta descriptions to 9 pages currently missing them (all except homepage), 120–150 characters each | Technical Audit (implied by meta_desc null) | 3 hours |
| 1.6 | Add alt text to 10 images missing it across About Us (3), Drinks (4), Cornhole About (1), Crawfish Information (1), Cubs (1) | Technical Audit (red flag: 10 of 21 images) | 2 hours |
| 1.7 | Add BreadcrumbList schema to all non-homepage pages to enable rich result breadcrumbs in SERPs | Schema Review §3 | 3 hours |
| 1.8 | Fix 2 pages missing H1 tags (Food Menu, NFL Pick'em Rules) by adding descriptive H1s | Technical Audit (H1 structure: 2 no_h1) | 1 hour |

**Subtotal: ~19 hours of mechanical work.**

### Stretch tasks
- Add FAQ schema to About Us page if there are common questions about history, hours, or location
- Embed Google Maps iframe on Contact page to improve local signal consistency

### Success signal
At end of month 1:
- Google Search Console shows 10 of 10 pages indexed with canonicals recognized
- Rich Results Test validates Organization and WebSite schema on homepage
- All 10 pages have title tags between 40 and 60 characters and meta descriptions present

---

## MONTH 2 — CONTENT CITATION HOOKS (2026-06-08 – 2026-07-07)

### Theme
**Expand thin pages into citation-worthy content and add structured data for menu, events, and reviews to give AI engines specific facts to cite.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 2.1 | Expand 8 thin pages (Contact, Crawfish Information, Cubs, Events, Food Menu, NFL Pick'em) from under 300 words to 400–600 words by adding context, FAQs, hours, parking, or event details | Technical Audit (8 pages thin content) | 8 hours |
| 2.2 | Add Menu schema to Food Menu page with at least 6–8 itemListElement entries (dish names, descriptions, prices) | Schema Review §3 (Menu schema absent) | 4 hours |
| 2.3 | Add Event schema to Events page for recurring events (Crawfish Saturdays, NFL Pick'em, Cornhole League) with startDate, location, and offers | Schema Review §3 (Event schema absent) | 3 hours |
| 2.4 | Add AggregateRating schema to homepage if Google reviews exist (pull rating count and average from Google Business Profile) | Technical Audit (red flag: no AggregateRating) | 2 hours |
| 2.5 | Increase average external links per page from 1.8 to 3+ by citing local Memphis sources, sports leagues, or event partners on About Us, Cubs, Cornhole, and Events pages | Technical Audit (red flag: avg external links 1.8) | 3 hours |

**Subtotal: ~20 hours.**

### Success signal
At end of month 2:
- Rich Results Test validates Menu schema on Food Menu and Event schema on Events page
- All 10 pages have at least 300 words or justify brevity with structured data (e.g., Contact page with LocalBusiness details)
- AggregateRating appears in SERP preview for homepage branded query

---

## MONTH 3 — AUTHORITY + MEASUREMENT (2026-07-08 – 2026-08-07)

### Theme
**Build topical authority in Memphis sports bar and event spaces, and instrument tracking to measure AI citation lift.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 3.1 | Publish 2 new long-form pages (800+ words each): "Best Sports Bars in Memphis for Cubs Fans" and "Memphis Cornhole Leagues: Complete Guide" | Technical Audit (thin content, authority signal gap) | 10 hours |
| 3.2 | Add 3–5 authoritative external links per new page to Memphis tourism, sports league sites, or local news sources | Technical Audit (external links weak AEO signal) | 2 hours |
| 3.3 | Add FAQPage schema to both new pages with 4–6 Q&A pairs each (e.g., "What sports bars in Memphis show Cubs games?") | Schema Review (FAQPage not detected) | 3 hours |
| 3.4 | Set up Google Search Console tracking for impressions, clicks, and average position for target queries (Memphis sports bar, Cubs bar Memphis, cornhole league Memphis) | Technical Audit (measurement baseline) | 1 hour |
| 3.5 | Test AI citation presence by querying ChatGPT, Perplexity, and Gemini with "best sports bars in Memphis" and "Memphis cornhole leagues" and log whether Max's appears | Schema Review (AEO optimization goal) | 1 hour |

**Subtotal: ~17 hours.**

### Success signal
At end of month 3:
- At least 1 of 2 new pages appears in Google Discover or "People also ask" boxes for target queries
- Max's Sports Bar cited by name in at least 1 AI engine response for Memphis sports bar or cornhole queries

---

## Long-horizon view (months 4–6, not scheduled here)

- **Month 4:** Build backlink pipeline by reaching out to Memphis food bloggers, event calendars, and tourism sites to feature Max's in roundups
- **Month 5:** Add video schema for any YouTube content (game day highlights, event recaps, bartender interviews) and embed on relevant pages
- **Month 6:** Launch monthly blog series on Memphis sports culture, Cubs history in Memphis, or cornhole tournament recaps to build topical depth

---

## The single most important action

If the client only has time to do ONE thing in the next 7 days, it's this:

**Deploy Organization schema site-wide with name, logo, address, phone, and social profiles. This is the entity anchor that every other schema improvement depends on, and it takes 3 hours to implement once at the template level.**

---

## Expected outcomes by the end of the 90 days

**Realistic case:**
- All 10 pages have canonical tags, proper title/meta, and Organization schema recognized in Google Search Console
- Menu and Event schema validated on Food Menu and Events pages
- Homepage AggregateRating appears in SERP snippet for "Max's Sports Bar Memphis"
- 2 new long-form pages indexed and ranking in top 50 for target Memphis queries

**Optimistic case:**
- Max's Sports Bar cited by ChatGPT or Perplexity in at least 2 queries related to Memphis sports bars or events
- 1 of 2 new pages ranks in top 20 for "cornhole league Memphis" or "Cubs bar Memphis"
- Rich results (breadcrumbs, FAQs, events) appear in SERPs for 4+ pages

**Conservative case:**
- All technical blockers (canonicals, schema, title tags) resolved and validated in Search Console
- Zero pages under 300 words without justification
- AI citation presence confirmed in at least 1 engine for branded query "Max's Sports Bar Memphis"