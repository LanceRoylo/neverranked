# Technical Audit — Montaic.com

**Auditor:** Never Ranked
**Sample date:** April 9, 2026
**Pages sampled:** 7 representative pages across home, pricing, blog, tools, markets, compare, and free-grader

---

## Summary

Montaic is a well-built site with **222 URLs** and a serious programmatic SEO play (cities × listing types × tools × comparison pages, plus a marine vertical). The foundation is strong. The problems are in the details — and the details are what AI engines grade hardest on.

**Overall grade: B-** (strong structure, inconsistent implementation)

---

## Findings

### 1. Canonical tags — INCONSISTENT ⚠ HIGH PRIORITY
Canonicals are present on `/tools/*`, `/markets/*`, and `/compare/*` pages but MISSING on:

- `/` (homepage)
- `/pricing`
- `/free-listing-generator`
- `/blog/*` (sampled post had no canonical)

**Impact:** Without canonical tags, Google and AI engines may index URL variants (trailing slash, query params, etc.) as separate pages and split authority. On the homepage and pricing page specifically, this is a credibility and authority leak.

**Fix:** Add `<link rel="canonical" href="https://montaic.com{path}" />` to every page type. The existing template for `/tools/*` shows the correct pattern — replicate it across all page types.

---

### 2. OpenGraph images — MISSING on 6 of 7 sampled pages ⚠ HIGH PRIORITY

| Page | og:image |
|---|---|
| `/` (home) | ✓ present |
| `/pricing` | ✗ missing |
| `/free-listing-generator` | ✗ missing |
| `/blog/best-ai-listing-description-generator` | ✗ missing |
| `/tools/mls-description-generator` | ✗ missing |
| `/markets/austin-tx` | ✗ missing |
| `/compare/montaic-vs-chatgpt` | ✗ missing |

**Impact:** Every social share (LinkedIn, X, Facebook, iMessage, Slack) and every AI crawler that pulls OG metadata for thumbnails gets a blank preview on 95% of the site. ChatGPT, Perplexity, and Google AI Overviews increasingly display hero images alongside citations. Missing OG images = no image beside your citation.

**Fix:** Auto-generate OG images per page type. Options:
- Build a static `/og/{slug}.png` endpoint that renders a branded template with the page title and a visual motif
- Use Vercel's `@vercel/og` library (if on Vercel) to generate them on demand
- For city pages: image should show the city name + "Montaic for {City}"
- For comparison pages: "Montaic vs {Competitor}"
- For tools: "{Tool name} · Montaic"

This is one fix that unlocks hundreds of pages at once.

---

### 3. Pricing page title — CRITICALLY UNDER-OPTIMIZED ⚠ HIGH PRIORITY

Current: `Pricing — Montaic` (17 characters)

This is the highest-intent page on the entire site. The title tag gets 60 characters and you're using 17. No keywords, no value proposition, no context.

**Recommended replacement:**
- `Montaic Pricing — Free to Start, $149/mo Pro Plan for Real Estate Agents`
- Or more editorial: `Montaic Pricing — Write Listings in Your Voice, Starting Free`

---

### 4. Meta descriptions — OVER THE TRUNCATION LIMIT on 2 pages ⚠ MEDIUM

| Page | Length | Status |
|---|---|---|
| `/blog/best-ai-listing-description-generator` | 180 chars | Over limit (155-160 is Google's cut-off) |
| `/pricing` | 181 chars | Over limit |
| Home, tools, markets, compare | 135-165 chars | Within range |

**Impact:** Google truncates to ~155-160 chars on desktop and ~120 on mobile. ChatGPT and Perplexity pull the full meta description as a snippet — so longer isn't necessarily worse for AEO, but it IS worse for classic search. Trim both to 150 chars for safety.

---

### 5. Free Listing Generator — ZERO SCHEMA ⚠ HIGH PRIORITY

`/free-listing-generator` is the lowest-friction funnel entry point on the site. It has:

- No canonical
- No schema markup (zero JSON-LD blocks)
- Only 78 words of copy

**Impact:** This is the page most likely to be linked to externally and discovered via inbound search ("free listing description generator"). It has nothing for AI engines to understand.

**Fix:**
- Add `SoftwareApplication` schema (same as homepage)
- Add `HowTo` schema with the 3 steps (paste description → see grade → get rewrite)
- Add `WebApplication` schema with `applicationCategory: "BusinessApplication"` and `offers: {price: 0, priceCurrency: "USD"}`
- Add canonical
- Expand copy to at least 400 words explaining what the tool does, who it's for, and what makes it different

---

### 6. External citations — TOO LOW FOR AEO ⚠ MEDIUM

Every sampled page has **only 1 external link**. This is a structural AEO weakness.

**Why it matters:** Perplexity, ChatGPT, and Google AI Overviews all favor sources that cite primary sources. A page that only links internally reads as a marketing island. A page that cites NAR data, MLS statistics, Fair Housing Act text, or academic research reads as an authoritative hub.

**Fix:**
- Blog posts should cite at least 3-5 external authoritative sources (NAR, Realtor.com research, HUD, Zillow research reports, academic journals)
- Tool pages should link to the regulation or standard they relate to (e.g., Fair Housing Act, MLS compliance guidelines)
- Use `rel="nofollow"` if you want to be conservative about passing link equity, but the link itself is the signal

---

### 7. Robots meta — UNSET ⚠ LOW

No pages have an explicit `<meta name="robots">` tag. The default is `index, follow` which is fine, but it's a hygiene issue.

**Fix:** Add explicit `<meta name="robots" content="index, follow, max-image-preview:large" />` to indexable pages. The `max-image-preview:large` part specifically helps AI engines and Google display hero images at full size in citations.

---

### 8. H1 structure — ✓ CLEAN

Every sampled page has exactly 1 `<h1>`. This is correct. No action needed.

---

### 9. Image alt text — ✓ CLEAN on sample

All 37 images across sampled pages have alt attributes. No action needed unless a deeper crawl reveals gaps.

---

### 10. Word count on pricing — THIN

Pricing page has 447 words. For the most commercially critical page on the site, it should be 700-1,200 words including FAQ, comparison table, and use-case breakdowns. Current pricing page is largely a feature list — it needs narrative to give AI engines something to cite.

**Fix:** Expand pricing page with:
- A comparison table of the three plans
- 6-8 FAQ items (with FAQPage schema)
- A "Who is each plan for" section with persona descriptions
- Link to a case study or testimonial (when available)

---

## Priority list (technical)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Add canonical tags to home, pricing, free-grader, blog | HIGH | LOW |
| 2 | Auto-generate og:image for every page type | HIGH | MEDIUM |
| 3 | Rewrite pricing page title | HIGH | LOW |
| 4 | Add schema to free-listing-generator | HIGH | LOW |
| 5 | Trim over-limit meta descriptions | MEDIUM | LOW |
| 6 | Add 3-5 external citations per blog post | MEDIUM | MEDIUM |
| 7 | Expand pricing page to 700+ words | MEDIUM | MEDIUM |
| 8 | Add explicit robots meta site-wide | LOW | LOW |
