# Technical Audit — Hello Again Coffee

**Auditor:** Never Ranked
**Sample date:** 2026-05-07
**Pages sampled:** 1 representative page (homepage)

---

## Summary

Hello Again Coffee's homepage has clean Open Graph metadata and canonical tags, but the site is invisible to AI engines and lacks the structural markup Google needs for rich results. Zero schema markup across the board means no entity recognition, no sitelink search box eligibility, and no knowledge panel signal. The thin word count (224 words) and missing H1 compound the problem.

**Overall grade: D+** (solid foundation eroded by missing schema, thin content, and header structure gaps)

---

## Findings

### 1. Complete schema vacuum across all entity types ⚠ HIGH PRIORITY

The homepage carries zero JSON-LD blocks. No Organization schema to establish the business entity, no WebSite schema to enable sitelink search, no LocalBusiness schema despite being a physical coffee shop in Honolulu. Google has no structured data to build a knowledge panel, and AI engines like ChatGPT or Perplexity have no entity hooks to cite the brand in answers about Honolulu coffee shops.

**Impact:** Google cannot surface Hello Again Coffee in map packs, knowledge panels, or voice answers. The site is disqualified from sitelink search box eligibility. AI engines treat the brand as unstructured text instead of a citeable local business.

**Fix:** Add three schema blocks to the homepage:

```json
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "CoffeeShop",
  "name": "Hello Again Coffee",
  "url": "https://helloagaincoffee.com",
  "logo": "https://helloagaincoffee.com/logo.png",
  "image": "https://helloagaincoffee.com/shop-front.jpg",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Honolulu",
    "addressRegion": "HI"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "21.3099",
    "longitude": "-157.8581"
  },
  "telephone": "+1-808-XXX-XXXX",
  "priceRange": "$$"
}
</script>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Hello Again Coffee",
  "url": "https://helloagaincoffee.com",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://helloagaincoffee.com/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
</script>
```

Add AggregateRating if you have review data from Google or Yelp. This gives AI engines social proof to cite.

---

### 2. Missing H1 on homepage ⚠ HIGH PRIORITY

The homepage has 3 H2s and 5 H3s but no H1. The first header element is an H2. This breaks semantic page structure and removes the single most important on-page signal for what the page is about.

**Impact:** Google has to infer page topic from body copy instead of reading a clear H1 signal. Screen readers and accessibility tools lose the primary page heading. AI engines have no headline anchor when summarizing the page.

**Fix:** Wrap the primary hero statement ("Afternoon coffee is just as good as morning coffee" or your main value prop) in an `<h1>` tag. Demote current H2s to H3s if needed to preserve hierarchy. Example:

```html
<h1>Ridiculously Great Coffee in Honolulu</h1>
<h2>Afternoon coffee is just as good as morning coffee</h2>
```

---

### 3. Thin content at 224 words ⚠ MEDIUM PRIORITY

The homepage clocks 224 words, well under the 300-word threshold. This flags the page as thin content to Google and gives AI engines very little to work with when answering "what is Hello Again Coffee?" or "best coffee shops in Honolulu."

**Impact:** Low content volume reduces keyword coverage, limits internal linking anchor opportunities, and signals low page utility to ranking algorithms. AI engines have fewer paragraphs to pull quotes from.

**Fix:** Expand homepage copy to 400+ words. Add:
- A "Why Hello Again?" section explaining your roasting philosophy or origin story (100 words)
- A "Menu Highlights" or "Our Coffee" section describing signature drinks or beans (100 words)
- A "Visit Us" section with neighborhood context, parking, and hours detail (50 words)

This content enriches entity understanding and gives more topical hooks for ranking and citation.

---

### 4. Title tag too short at 25 characters ⚠ MEDIUM PRIORITY

The homepage title is "Home - Hello Again Coffee" (25 characters). Google's SERP title display range is 50-60 characters. You're leaving 30+ characters of prime keyword real estate unused.

**Impact:** The title undershoots ranking signal density and misses an opportunity to include geo ("Honolulu") or category ("specialty coffee", "local roaster") modifiers that help with local and category queries.

**Fix:** Rewrite to 50-60 characters with geo and category terms:

```html
<title>Hello Again Coffee | Specialty Coffee in Honolulu, HI</title>
```

This version hits 57 characters and includes "specialty coffee" and "Honolulu" for local search relevance.

---

### 5. Meta description truncates at 162 characters ⚠ LOW PRIORITY

The meta description is 162 characters and will truncate in most SERP displays (Google typically cuts at 155-160). The last few words ("Located in Honolulu, HI.") may not render.

**Impact:** Truncation is cosmetic but reduces click-through clarity. The geo modifier at the end is the most valuable part for local searchers, and it's the part that gets cut.

**Fix:** Trim to 155 characters and front-load the geo signal:

```html
<meta name="description" content="Honolulu's Hello Again Coffee creates ridiculously great moments with specialty afternoon and morning coffee. Visit us in HI today.">
```

This version is 154 characters and preserves the geo term early.

---

### 6. H1 structure — ⚠ ISSUES

The homepage has no H1. See Finding #2 for full detail and fix.

---

### 7. Image alt text — ✓ CLEAN

All 7 images on the homepage have alt attributes. No action needed.

---

### 8. Word counts — thin content detected

| Page | Word count | Status |
|---|---|---|
| https://helloagaincoffee.com | 224 | thin (under 300) |

See Finding #3 for expansion strategy.

---

## Priority list (technical)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Add Organization, WebSite, and LocalBusiness schema to homepage | HIGH | LOW |
| 2 | Add H1 to homepage and fix header hierarchy | HIGH | LOW |
| 3 | Expand homepage copy from 224 to 400+ words | MEDIUM | MEDIUM |
| 4 | Rewrite title tag to 50-60 characters with geo and category terms | MEDIUM | LOW |
| 5 | Trim meta description to 155 characters and front-load geo | LOW | LOW |

---

## Raw data captured

The following files are in `raw/` for auditor reference:

- `home.html` — homepage HTML
- `robots.txt` — robots directives
- `sitemap.xml` — URL inventory
- `intake-report.json` — full per-page signal extraction

Technical extraction ran via `scripts/run-audit.py` — see `raw/intake-report.json` for the full per-page signal data.