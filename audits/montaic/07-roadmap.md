# 90-Day Roadmap — Montaic.com

**Auditor:** Never Ranked
**Delivered:** April 9, 2026
**Window:** Months 1–3 (by July 9, 2026)

---

## Premise

Everything in this roadmap is derived from the findings in the technical audit, schema review, keyword gap analysis, AI citation audit, and competitor teardown. Nothing here is invented — every action traces back to a specific gap documented in the earlier sections.

**Starting position (as of April 9, 2026):**
- 222 URLs in sitemap
- 0% AI citation share across 8 tested primary queries
- Ranking for 1 branded query (Montaic vs ChatGPT, position 5)
- Missing Organization schema site-wide
- Missing canonicals on home + pricing + blog + free-grader
- Missing og:image on 95% of pages
- No AggregateRating, no Review schema, no HowTo schema anywhere
- Brand name being fuzzy-matched by Google as "Monti" / "Monte" / "Montana"

**90-day target:**
- 15%+ AI citation share across the same 8 queries
- Ranking for at least 3 of 8 `/compare/*` pages at their exact-match queries
- Knowledge panel eligibility (Wikidata + Crunchbase + LinkedIn Company + G2 present)
- Full schema coverage: Organization, WebSite, BreadcrumbList site-wide + HowTo on tool pages + AggregateRating on home/pricing
- Fair Housing positioning pillar content published
- Baseline citation tracking dashboard live so future progress is measurable

---

## How this is organized

The roadmap is broken into three monthly sprints. Each sprint has:
- **Theme** — the strategic focus for the month
- **Must-ship tasks** — the non-negotiables
- **Stretch tasks** — things to do if capacity allows
- **Dependencies** — what has to exist before the task can start
- **Success signal** — how you'll know it worked

Every task is tagged with the audit section it came from so you can trace it back.

---

## MONTH 1 — FOUNDATION (April 9 – May 9)

### Theme
**Fix the plumbing.** Nothing else matters until the entity signals and basic hygiene are in place. This month is all mechanical fixes to unlock the existing 222 pages.

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 1.1 | Add `<link rel="canonical">` to home, pricing, free-grader, and all blog posts | Tech §1 | 2h |
| 1.2 | Add Organization schema to site-wide layout with `sameAs` links | Schema §1, Competitor | 2h |
| 1.3 | Add WebSite schema with SearchAction | Schema §3 | 1h |
| 1.4 | Add BreadcrumbList schema to every non-home page type | Schema §2 | 4h |
| 1.5 | Rewrite pricing page title from "Pricing — Montaic" to keyword-dense variant | Tech §3 | 15min |
| 1.6 | Trim over-limit meta descriptions (pricing, blog posts) | Tech §4 | 30min |
| 1.7 | Add full schema stack to `/free-listing-generator` | Tech §5, Schema §7 | 2h |
| 1.8 | Auto-generate og:image for every page type (home, pricing, tools, markets, compare, blog) | Tech §2 | 6h |
| 1.9 | Add explicit `<meta name="robots" content="index, follow, max-image-preview:large">` site-wide | Tech §7 | 15min |
| 1.10 | Register Montaic on Wikidata, Crunchbase, LinkedIn Company, G2, Capterra, Product Hunt | Keyword §1, Citation Tier 1 #3 | 4h |

**Subtotal: ~22 hours of mechanical work. One focused week.**

### Stretch tasks
- Add `LocalBusiness` schema if applicable (if Montaic has a physical address or service area)
- Add `Person` author schema to blog posts with Lance as the byline
- Upgrade Article schema to BlogPosting with full metadata

### Dependencies
- Access to Montaic codebase to modify head template
- A logo file for the Organization schema
- Founder bio + photo for Person/Organization schema
- Actual social profiles (LinkedIn, X, Instagram) to link to via `sameAs`

### Success signal
At end of month 1:
- Schema Markup Validator (schema.org/validator) shows Organization + WebSite + BreadcrumbList + SoftwareApplication on every page type
- Google Search Console shows Organization entity registered
- Wikidata entry exists and is linked to montaic.com
- Google's "Rich Results Test" passes on homepage, pricing, a tool page, a market page, and a compare page

---

## MONTH 2 — CONTENT CITATION HOOKS (May 9 – June 9)

### Theme
**Make existing content AI-citable.** Month 1 fixed the plumbing. Month 2 turns the 200+ existing pages into content that AI engines can quote directly.

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 2.1 | Add HowTo schema to all 25+ tool pages (templated once, applied to all) | Schema §4 | 6h |
| 2.2 | Expand 8 comparison pages to 1,200+ words + add SoftwareApplication + AggregateRating | Keyword §3, Citation Tier 2 #5 | 16h |
| 2.3 | Collect 10+ real user reviews, add AggregateRating to SoftwareApplication schema on home + pricing | Schema §5, Competitor | 6h |
| 2.4 | Publish the Fair Housing pillar article: "The 2024 HUD AI Guidance and What It Means for Agents Using AI Writing Tools" | Keyword §5, Positioning | 8h |
| 2.5 | Build `/compliance` landing page with dedicated Fair Housing positioning, HowTo schema, and trust signals | Keyword §5 | 4h |
| 2.6 | Rewrite "voice" → "writing style" language site-wide | Keyword §3, Positioning | 4h |
| 2.7 | Add 3-5 external citations (NAR, HUD, MLS statistics) to every existing blog post | Tech §6, Citation Tier 3 #7 | 8h |
| 2.8 | Add "Trusted by [N] real estate agents" claim to homepage hero (requires real user count) | Competitor | 1h |

**Subtotal: ~53 hours. ~13h/week over the month.**

### Stretch tasks
- Publish a second Fair Housing pillar post (checklist / do-this-not-that format)
- Add Product schema variants to the 25+ listing-type tool pages
- Launch on Product Hunt with the "AI-native listing platform with compliance built in" positioning

### Dependencies
- Organization schema from Month 1 (for aggregateRating to reference properly)
- 10+ real users willing to leave reviews (ask today)
- Lance's editorial voice for the Fair Housing article
- Internal agreement on the "writing style" positioning pivot

### Success signal
At end of month 2:
- All 25+ tool pages pass Rich Results Test with HowTo schema
- All 8 comparison pages exceed 1,200 words and show AggregateRating in SERP previews
- Fair Housing pillar article is published, has 3+ external authoritative citations, and is internally linked from relevant blog posts
- The phrase "voice matching" no longer appears on any page except as "[writing style] / voice calibration" transitional language
- Google Search Console shows indexing of all updated pages
- At least 2 of 8 comparison pages appear in top 10 for their exact-match queries (e.g., "Montaic vs Jasper")

---

## MONTH 3 — AUTHORITY + MEASUREMENT (June 9 – July 9)

### Theme
**Start measuring + build external signal.** Months 1-2 made the site citable. Month 3 gets external sources to cite it, and sets up the measurement infrastructure so progress is visible.

### Must-ship tasks

| # | Task | Source | Effort |
|---|---|---|---|
| 3.1 | Set up AI citation tracking: LLM Pulse or Otterly.ai subscription, configure tracking for Montaic + top 5 competitors + 20 target queries | Citation Tier 4 #10 | 3h + subscription |
| 3.2 | Publish 3 informational pillar articles with HowTo schema ("How to write an MLS listing description," "How long should a listing description be," "Fair Housing Act listing description rules") | Keyword §4 | 16h |
| 3.3 | Fix the 50+ city pages: add unique local stats + proper schema + canonicals | Keyword §6, Tech §1 | 10h |
| 3.4 | Guest post on 3 real estate trade publications (Inman, HousingWire, The Close) linking to comparison pages or Fair Housing article | Keyword §5, Citation Tier 3 #8 | 12h |
| 3.5 | Reach out to 5 real estate podcasters for interview appearances covering AI + compliance angle | Citation Tier 3 #8 | 6h |
| 3.6 | Email every existing user asking for Capterra/G2 review | Schema §5 | 2h |
| 3.7 | Build the client-facing Montaic dashboard in Looker Studio or similar (tracks AI citation share, rankings, organic traffic) | Citation Tier 4 #10 | 8h |
| 3.8 | Monthly founder Loom recap explaining what changed, what worked, what's next | Never Ranked operating model | 30min |

**Subtotal: ~58 hours. ~14h/week.**

### Stretch tasks
- Launch the marine vertical audit + fixes (would be month 4+ normally, but if capacity allows, start it)
- Submit Montaic for PropTech / RETechnology award recognition (creates high-authority backlinks)
- Create a "State of AEO for Real Estate Agents" report as downloadable asset (linkable, citable, distinctive)

### Dependencies
- Content from months 1-2 in place
- Capacity for outbound / relationship work
- Budget for citation tracking subscription (~$99/month)
- Willingness to do guest posting outreach (this is slow and painful but compounds)

### Success signal
At end of month 3:
- AI citation share measured and tracked weekly via LLM Pulse or equivalent
- Baseline 0% citation share moved to 15%+ across the 8 test queries
- At least one of the comparison pages ranks in top 3 for its exact query
- At least one guest post published on a high-authority real estate publication with a link to Montaic
- At least 15 real reviews live on Capterra or G2
- The first monthly founder Loom is recorded and shared with Lance (as sample for client onboarding)

---

## Long-horizon view (months 4–6, not scheduled here)

Month 3 is not the end. These are the things that need to happen AFTER this roadmap to compound the work:

- **Month 4:** Marine vertical audit + schema fixes (mirror of month 1-2 on the marine side)
- **Month 4:** Continue pillar article publishing cadence (2 per month)
- **Month 5:** Begin direct head-term competition (ready now because authority is built)
- **Month 5:** Launch paid review acquisition program (incentivize existing users)
- **Month 6:** Publish the annual "State of AI in Real Estate Marketing" report as a bylined, data-heavy asset

---

## What this roadmap is NOT

- **Not a growth marketing plan.** This is AEO / SEO fix work. Paid acquisition, email lists, partnerships, and sales strategy are separate.
- **Not a product roadmap.** The findings assume the product stays as-is. Adding features, UI changes, pricing experiments are a different conversation.
- **Not a branding exercise.** The brand name, logo, visual identity, and tone of voice are not the subject of this audit. They could become a recommendation (the Montaic-vs-Monti fuzzy-match problem suggests a potential brand stress test) but that's out of scope for this audit.

---

## The single most important action

If Lance only has time to do ONE thing in the next 7 days, it's this:

**Add Organization schema to the site-wide layout with `sameAs` links to LinkedIn, Crunchbase, Wikidata, and G2, then register in Wikidata, Crunchbase, and G2 the same day.**

This is the action with the largest AEO impact-per-hour of any task in this entire roadmap. Two hours of work, immediate entity recognition, and the foundation that everything else depends on. Everything else in month 1 is secondary to this.

---

## Expected outcomes by the end of the 90 days

**Realistic case:**
- 15-25% AI citation share (up from 0%)
- 3-5 comparison pages ranking in top 10 for exact-match queries
- Knowledge panel eligibility (entity recognized)
- 30-50% increase in organic traffic to tool pages
- First real pipeline of inbound leads from organic AEO-driven traffic

**Optimistic case:**
- 30-40% AI citation share
- 5+ comparison pages ranking top 3
- 2-3 guest-posted articles live on high-authority publications
- Knowledge panel visible in Google for "Montaic"
- First citation in a ChatGPT or Perplexity answer for a non-branded query

**Conservative case:**
- 10% AI citation share (entity foundation laid, authority still building)
- Most of the schema fixes live but not yet reflected in rankings due to Google's crawl delay
- Technical foundation complete, authority building begins month 4

Any of these is a massive improvement from the current 0% citation share. The foundation work in months 1-2 is guaranteed to ship value. The authority-building in month 3 has more variance — it depends on outreach response rates and Google's crawl cadence.

---

## How Never Ranked would deliver this as a retainer

If Montaic became a Signal-tier client ($3,000/month), this roadmap IS the month 1-3 deliverable. Here's how it maps:

| Never Ranked service | How it appears in this roadmap |
|---|---|
| SEO & AEO Audit (one-time $500) | This document |
| Schema Markup (automated) | All schema fixes in month 1 |
| AEO Content Engine (6 pieces/month) | Fair Housing pillar, 3 informational pillars, 2 comparison page expansions |
| Keyword & Intent | Keyword gap analysis findings + retargeting |
| Citation Monitoring (LLM Pulse) | Month 3 task 3.1 — tracking setup |
| Live Reporting (dashboard) | Month 3 task 3.7 — dashboard build |
| Monthly founder Loom | Month 3 task 3.8 — sample recording |

This audit IS the pitch document. If Lance were a Never Ranked prospect, this document is what he'd get for his $500, and the execution of months 1-3 is what he'd get for $3,000/month.
