# The Montaic Audit

**Prepared for:** Montaic.com
**Prepared by:** Never Ranked
**Date:** April 9, 2026
**Deliverable type:** $500 Audit — full SEO & AEO
**Window:** 48 hours

---

## One-page executive summary

Montaic is a well-built real estate AI SaaS with 222 pages, a serious programmatic SEO structure, a clean comparison page strategy, and a thoughtful editorial blog. The product, the content taxonomy, and the positioning concept are all in good shape.

**The problem is visibility — specifically AI visibility.**

When real estate agents ask ChatGPT, Perplexity, Gemini, or Google AI Overviews "what's the best AI listing description generator" or "which AI tool should I use for MLS descriptions," **Montaic is not cited.** Not once, across eight tested category queries. ListingAI is cited in 100% of those queries. Write.Homes and Jasper AI each in 50%.

This isn't a product problem. It's a plumbing problem. Montaic is missing the entity signals and citation hooks that AI engines need to surface a brand. The fix is mechanical, templated, and achievable within 90 days.

**Headline findings:**

1. **0% AI citation share** across 8 primary category queries (vs 100% for ListingAI)
2. **No Organization schema site-wide** — every competitor that gets cited has this
3. **Canonicals missing on home, pricing, blog, and the free grader** — Google can't reliably consolidate authority
4. **Pricing page title is 17 characters** — the highest-intent commercial page is under-optimized
5. **No AggregateRating, no Review, no HowTo schema** anywhere — three of the biggest AEO citation hooks are unused
6. **Brand name is getting fuzzy-matched to "Monti" / "Monte" / "Montana"** in Google's SERPs — the entity doesn't exist in Google's knowledge graph yet
7. **95% of pages missing `og:image`** — social shares and AI crawler thumbnails are blank
8. **The word "voice" is lost to audio AI companies** — Montaic's core positioning phrase is competing for a keyword it cannot win

**What's already working:**
- 222-page programmatic SEO skeleton is a real asset (once activated)
- FAQPage schema already on home, tools, markets, compare
- SoftwareApplication schema on commercial pages
- Comparison page directory is a rare strategic advantage
- Marine vertical is a greenfield play nobody else is doing
- Editorial blog content is genuinely good (just under-optimized)

**The 90-day target:** move from 0% to 15%+ AI citation share, rank at least 3 comparison pages in top 10, establish the brand as a recognized entity in Google's knowledge graph, and publish the Fair Housing positioning content that nobody else in the competitor set is covering.

**The single most important action for this week:** Add Organization schema with `sameAs` links and register Montaic in Wikidata, Crunchbase, and G2 the same day. 2 hours of work. Immediate entity recognition. Foundation for everything else.

---

## The six deliverables in this audit

This package contains six documents, delivered per the Never Ranked $500 audit offer. Each is a standalone deliverable.

### 1. Technical Audit (`02-technical-audit.md`)
Crawlability, meta tags, headings, canonicals, og tags, robots, page weight, alt text, word counts. Identifies 10 fixable technical issues with priority and effort ratings.

**Top finding:** Canonicals missing on homepage, pricing, blog, and free-grader.

### 2. Schema Review (`03-schema-review.md`)
Full JSON-LD audit of every page type. Inventory of what exists, what's missing, and exactly what to add. Includes ready-to-use schema code blocks.

**Top finding:** No Organization schema site-wide. Every competitor that beats Montaic in AI citations has this.

### 3. Keyword Gap Analysis (`04-keyword-gap.md`)
Live SERP inspection of 4 commercial queries. Keyword cluster map across 7 intent categories (commercial head, long-tail, comparison, informational, geographic, vertical, problem-aware). Specific positioning recommendations.

**Top finding:** Montaic doesn't rank in top 10 for any primary commercial query, AND Google is fuzzy-matching the brand name as "Monti" / "Monte" / "Montana." Brand entity must be established before anything else will stick.

### 4. AI Citation Audit (`05-ai-citations.md`)
The defining document of the Never Ranked methodology. Tests 8 queries for AI citation share, maps which domains get cited vs ignored, diagnoses the structural reasons Montaic is invisible to AI engines.

**Top finding:** 0% citation share for Montaic vs 100% for ListingAI across the same query set.

### 5. Competitor Teardown (`06-competitor-teardown.md`)
Side-by-side technical + schema comparison of Montaic against ListingAI, Write.Homes, Nila June, and AgentListingAI. Identifies what each competitor does that Montaic doesn't — and, importantly, the areas where Montaic is actually ahead.

**Top finding:** ListingAI has 3 JSON-LD schemas including Organization + LocalBusiness; Montaic has 2 and is missing Organization. This single gap plausibly explains the majority of the citation delta.

### 6. 90-Day Roadmap (`07-roadmap.md`)
Month-by-month execution plan derived directly from the audit findings. Month 1 is foundation (plumbing). Month 2 is content citation hooks. Month 3 is authority + measurement. Every task traces back to a specific finding, with effort estimates and success signals.

**Top recommendation:** Organization schema + entity registration in week 1. Non-negotiable.

---

## How to read this audit

This is a dense package. Here's the recommended reading order depending on your available time:

**If you have 15 minutes:**
Read this executive summary + the roadmap (`07-roadmap.md`). That's the what and when. Skip the detailed findings.

**If you have 45 minutes:**
Add the AI Citation Audit (`05-ai-citations.md`) and the Competitor Teardown (`06-competitor-teardown.md`). Those are the "why" behind the roadmap.

**If you have 2 hours:**
Read everything. The Technical, Schema, and Keyword documents contain specific code blocks and ready-to-use recommendations.

**If you're a developer implementing the fixes:**
Start with the Schema Review (`03-schema-review.md`). The code blocks are pasteable. Then the Technical Audit (`02-technical-audit.md`) for the meta tag and canonical fixes.

---

## What this audit intentionally did NOT cover

- **Core Web Vitals / page speed.** Best measured in a real browser with Lighthouse or PageSpeed Insights; not reliably inferred from raw HTML. Worth running separately.
- **Link profile / backlink analysis.** Requires Ahrefs / Semrush access; flagged in findings but not scored.
- **Content quality audit** of the full 30+ blog post corpus. Sampled one; flagged patterns; full review is a separate engagement.
- **Brand strategy** or visual identity review. The Montaic-vs-Monti fuzzy-match suggests the brand name is operationally difficult to surface, but a full rebrand conversation is out of scope.
- **Product recommendations.** The product is taken as a given.
- **Paid media / growth marketing strategy.** AEO/SEO only.
- **Marine vertical deep dive.** The real estate side is the focus. Marine is a mirror opportunity — same audit methodology, applied to that vertical, would be a separate engagement.

---

## Notes on methodology

This audit was produced using the Never Ranked audit methodology. The specific steps taken:

1. **Intake:** Fetched `montaic.com`, `robots.txt`, and `sitemap.xml`. Parsed 222 URLs across 7 categories.
2. **Sample selection:** Pulled 7 representative pages across home, pricing, blog, tools, markets, compare, and free-grader page types.
3. **Technical parse:** Custom Python scripts extracted title, meta, canonical, OG tags, headings, schemas, alt text, word counts, and link density from every sampled page.
4. **Schema parse:** Full JSON-LD block inspection with type extraction.
5. **SERP testing:** 8 live Google searches across commercial, informational, and comparison query clusters. Captured both the top 10 results and the AI-synthesized summary content for each.
6. **Competitor fetch:** Pulled raw HTML of ListingAI, Write.Homes, Nila June, and AgentListingAI homepages. Parsed with the same scripts.
7. **Synthesis:** Findings cross-referenced across all phases to produce the roadmap.

**What this methodology cannot do (yet):**
- Direct API queries to ChatGPT, Perplexity, Gemini, or Claude (no public endpoint for running citation tests programmatically at scale)
- Automated backlink analysis (requires paid tools)
- Live Core Web Vitals measurement
- Comprehensive historical keyword ranking data

All of these would be automated in a full Never Ranked retainer engagement via LLM Pulse, Ahrefs, and Looker Studio integrations.

---

## A note from the auditor

This is the first audit Never Ranked has produced. It was run against Montaic specifically because Never Ranked doesn't pitch what it hasn't tried — and running the audit on our own in-house SaaS was the only honest way to prove the methodology before charging anyone for it.

The findings are real. The recommendations are real. The 90-day plan is real. If Lance implements even half of month 1, Montaic's AI citation share will move measurably within 60 days.

If you're reading this because you're a Montaic prospect: this is what Never Ranked sells. This is what the $500 audit gets you. No 90-page PDF nobody opens. Six deliverables, forty-eight hours, yours to keep whether you hire us after or not. We don't refund. We deliver.
