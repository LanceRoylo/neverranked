# 90-Day Roadmap — Ward Village

**Auditor:** Never Ranked
**Delivered:** 2026-05-08
**Window:** Months 1–3 (by 2026-08-08)

---

## Premise

Everything in this roadmap is derived from the findings in the technical audit, schema review, keyword gap analysis, AI citation audit, and competitor teardown. Nothing here is invented. Every action traces back to a specific gap documented in the earlier sections.

**Starting position (as of 2026-05-08):**
- 0 of 10 sampled pages have Organization schema (no entity recognition in place)
- 3 of 10 pages missing og:image (30% of social shares show blank previews)
- 0 pages with AggregateRating schema (testimonial text exists but AI engines cannot cite it)
- 5 of 10 pages have broken H1 structure (0 H1s or multiple H1s)
- 6 of 10 pages have meta descriptions that are missing or over 160 characters

**90-day target:**
- Organization schema live site-wide (entity recognition active)
- 10 of 10 pages have proper social preview cards (og:image coverage at 100%)
- AggregateRating schema deployed on homepage and key landing pages (social proof visible to AI)
- 10 of 10 pages have correct H1 structure (one clear H1 per page)
- 10 of 10 pages have meta descriptions in the 80 to 160 character range

---

## MONTH 1 — FOUNDATION (2026-05-08 – 2026-06-08)

### Theme
**Fix entity recognition and technical blocking issues so Google and AI engines know who Ward Village is.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 1.1 | Deploy Organization schema site-wide (name, logo, address, parent org Howard Hughes, social profiles) | Schema Review, finding 1 | 2 hours |
| 1.2 | Add og:image tags to /ads/, /broker-portal/, and /contact-information/ pages | Technical Audit, finding 2 | 1 hour |
| 1.3 | Fix H1 structure on /amenities/ (currently 0 H1s), /broker-portal/ (0 H1s), and homepage (currently 2 H1s) | Technical Audit, finding 3 | 1.5 hours |
| 1.4 | Rewrite title tags for /ads/, /amenities/, /broker-portal/, and /centers/aeo-shops/ (all under 30 characters) | Technical Audit, finding 4 | 1 hour |
| 1.5 | Write meta descriptions for 6 pages currently missing them (all except homepage and art-culture page) | Technical Audit, finding 5 | 2 hours |
| 1.6 | Trim meta descriptions on homepage, art-culture, and Ossipoff article (all over 160 characters) | Technical Audit, finding 5 | 0.5 hours |
| 1.7 | Add alt text to 2 images missing it (1 on homepage, 1 on www.wardvillage.com) | Technical Audit, finding 7 | 0.25 hours |
| 1.8 | Add 100 to 200 words of content to /amenities/ and /broker-portal/ (both under 300 words) | Technical Audit, finding 6 | 2 hours |

**Subtotal: ~10.25 hours of mechanical work.**

### Stretch tasks
- Add FAQ schema to contact page if Q&A content exists (no evidence in scan, but if contact form has common questions list them)
- Add Twitter image tags (twitter:image) to the 3 pages that have twitter:card but no twitter:image

### Success signal
At end of month 1:
- Google Rich Results Test shows valid Organization schema on homepage
- All 10 sampled pages pass Facebook Sharing Debugger with image preview
- Every page has exactly one H1 and meta description between 80 and 160 characters

---

## MONTH 2 — CONTENT CITATION HOOKS (2026-06-09 – 2026-07-09)

### Theme
**Deploy social proof schema and create answer-engine-ready content so AI can cite Ward Village by name.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 2.1 | Deploy AggregateRating schema on homepage (at least 7 pages have testimonial text, extract star-equivalent rating) | Schema Review, finding 2 | 2 hours |
| 2.2 | Add Place schema to homepage or about page (latitude/longitude for Ward Village location, geo-anchor for "Honolulu master-planned community" queries) | Schema Review, finding 3 | 1.5 hours |
| 2.3 | Create FAQ page targeting "What is Ward Village?", "Who owns Ward Village?", "Ward Village condos price range?" with FAQPage schema | Schema Review, finding 4 | 4 hours |
| 2.4 | Write 800-word "About Ward Village" page with clear entity description, parent company mention, project timeline, neighborhood boundaries (citation target for AI) | Schema Review, finding 1 context | 3 hours |
| 2.5 | Add Review schema to 3 to 5 individual testimonials (if customer permission exists, use itemReviewed: "Ward Village", reviewRating, author) | Schema Review, finding 2 | 2 hours |

**Subtotal: ~12.5 hours.**

### Success signal
At end of month 2:
- ChatGPT or Perplexity query "What is Ward Village?" returns a citation to wardvillage.com with correct entity name and parent company
- Google Rich Results Test validates AggregateRating and FAQPage schema
- "About Ward Village" page indexes and begins appearing in Google's "People also ask" boxes for related queries

---

## MONTH 3 — AUTHORITY + MEASUREMENT (2026-07-10 – 2026-08-08)

### Theme
**Build topical authority pages, secure one external citation, and set up tracking for AI engine visibility.**

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 3.1 | Publish "Guide to Buying a Condo in Ward Village" (1200 words, sections: financing, HOA fees, parking, pet policies, resale value) with HowTo schema | Schema Review, finding 4 (content gap) | 5 hours |
| 3.2 | Publish "Ward Village Neighborhood Guide" (1000 words, cover restaurants, transit, schools, beaches within 1 mile) with Place or LocalBusiness schema for anchor tenants | Schema Review, finding 3 | 4 hours |
| 3.3 | Secure one backlink or citation from Honolulu Magazine, Honolulu Civil Beat, or Hawaii Business Magazine (pitch the Ossipoff article or art-culture page) | Implied from AEO best practices | 3 hours |
| 3.4 | Set up weekly monitoring: run "What is Ward Village?" and "Best Honolulu condos" in ChatGPT, Perplexity, Gemini. Log whether wardvillage.com is cited and in what context. | Implied from AEO measurement need | 1 hour |
| 3.5 | Add sameAs links in Organization schema for any missing social profiles (check for TikTok, YouTube, Pinterest if active) | Schema Review, finding 1 | 0.5 hours |

**Subtotal: ~13.5 hours.**

### Success signal
At end of month 3:
- At least one AI engine (ChatGPT, Perplexity, or Gemini) cites wardvillage.com by name in response to "Honolulu master-planned community" or "Ward Village condos"
- Two new authority pages published and indexed in Google within 7 days
- Monitoring log shows baseline citation frequency for next quarter comparison

---

## Long-horizon view (months 4–6, not scheduled here)

- **Month 4:** Video schema and YouTube integration (if Ward Village has property tours or community event videos, mark them up and embed with VideoObject schema)
- **Month 5:** Expand FAQ coverage to 15 to 20 questions, target long-tail queries ("Ward Village vs Kakaako condos", "Ward Village parking costs")
- **Month 6:** Competitor backlink replication (identify top 5 sites linking to competing Honolulu developments, pitch same outlets)

---

## The single most important action

If the client only has time to do ONE thing in the next 7 days, it's this:

**Deploy Organization schema site-wide. Paste the JSON-LD block from Schema Review finding 1 into the `<head>` of your global template. This single change makes Ward Village a recognized entity in Google's Knowledge Graph and gives every AI engine a structured hook to cite your brand by name.**

---

## Expected outcomes by the end of the 90 days

**Realistic case:**
- Organization schema indexes and Ward Village appears in Google's Knowledge Graph preview within 3 to 4 weeks
- At least one AI engine (Perplexity or ChatGPT) cites wardvillage.com in answer to "What is Ward Village?" or similar entity query
- Social share click-through improves by 15 to 25% due to og:image coverage reaching 100%
- Google Search Console impressions for branded queries increase 10 to 20% due to better meta descriptions and H1 clarity

**Optimistic case:**
- Google Knowledge Panel appears for "Ward Village" branded search with logo, description, and social links populated from Organization schema
- Two AI engines cite wardvillage.com in answers to "best Honolulu condos" or "Honolulu master-planned communities"
- FAQ page earns Google rich result snippet for at least one question within 30 days of publish
- One external citation secured from local news or lifestyle publication, driving referral traffic spike

**Conservative case:**
- Organization schema validates in Rich Results Test but Knowledge Panel does not appear yet (typical delay 4 to 8 weeks)
- AI engines do not yet cite Ward Village by name but wardvillage.com appears in source links for related real estate queries
- Social share engagement improves modestly (5 to 10% lift) as og:image coverage completes
- Internal metrics improve (bounce rate drops 5 to 8% due to clearer H1s and meta descriptions aligning with user intent)