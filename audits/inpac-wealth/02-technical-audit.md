# Technical Audit — InPac Wealth

**Auditor:** Never Ranked
**Sample date:** 2026-05-07
**Pages sampled:** 1 representative page (homepage)

---

## Summary

InPac Wealth's homepage is live and loads, but the technical SEO foundation is absent. No canonical tags, no structured data of any kind, no Organization schema, and 9 H1s on a single page. The meta description is solid and word count is adequate, but search engines and AI answer engines have nothing to hook into for entity recognition or rich results.

**Overall grade: D** (content exists but zero schema, broken canonicals, and chaotic heading structure block visibility)

---

## Findings

### 1. Zero structured data deployed ⚠ HIGH PRIORITY

The homepage has no JSON-LD blocks and no schema markup of any type. No Organization schema (critical for entity recognition), no WebSite schema (blocks site search box rich results), no BreadcrumbList, no FAQPage, no AggregateRating. AI engines like ChatGPT Search, Perplexity, and Google's AI Overviews rely on structured data to cite and rank sources. Without it, InPac Wealth is invisible to AEO pipelines.

**Impact:** Search engines cannot build a knowledge graph entity for InPac Wealth. No rich results eligibility. AI answer engines have no structured signals to cite the firm in wealth management queries.

**Fix:** Add Organization schema to the homepage with name, logo, url, contactPoint, and sameAs (LinkedIn, social profiles). Add WebSite schema with potentialAction SearchAction pointing to a search results page if one exists. If the site has service pages, add Service schema to each. Example Organization block:

```json
{
  "@context": "https://schema.org",
  "@type": "FinancialService",
  "name": "InPac Wealth",
  "url": "https://inpacwealth.com",
  "logo": "https://inpacwealth.com/logo.png",
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+1-XXX-XXX-XXXX",
    "contactType": "Customer Service"
  },
  "sameAs": [
    "https://www.linkedin.com/company/inpac-wealth",
    "https://www.facebook.com/inpacwealth"
  ]
}
```

---

### 2. Missing canonical tag ⚠ HIGH PRIORITY

The homepage has no canonical tag. This is critical for the root domain. Without it, Google may index multiple versions (http vs https, www vs non-www, trailing slash variants) and split ranking signals.

**Impact:** Duplicate indexing risk. Link equity fragmentation. Canonical tags are a trust signal. Missing them on the homepage is a red flag to crawlers.

**Fix:** Add `<link rel="canonical" href="https://inpacwealth.com" />` to the `<head>` of the homepage. Ensure all pages have self-referencing canonicals unless explicitly canonicalizing to another URL.

---

### 3. Nine H1 tags on the homepage ⚠ MEDIUM PRIORITY

The homepage has 9 H1s. The first is "Dream with Inspiration. Plan with a Purpose. Live with Intention." The rest are scattered throughout the page. Multiple H1s confuse page topic signals and dilute heading hierarchy for screen readers and crawlers.

**Impact:** Search engines cannot determine primary topic. Accessibility suffers. Heading structure is a core relevance signal for both traditional search and LLM summarization.

**Fix:** Refactor the page to use a single H1 (likely the existing "Dream with Inspiration…" tagline). Convert all other H1s to H2 or H3 based on content hierarchy. Example:

```html
<h1>Dream with Inspiration. Plan with a Purpose. Live with Intention.</h1>
<h2>Our Approach to Wealth Management</h2>
<h3>Financial Planning</h3>
<h3>Investment Advisory</h3>
```

---

### 4. Missing og:image and twitter:image ⚠ MEDIUM PRIORITY

The homepage has og:title, og:description, and og:type, but no og:image. Twitter card is present but twitter:image is missing. When shared on LinkedIn, Slack, or social platforms, the link preview will render without an image.

**Impact:** Reduced click-through on social shares. No visual hook for link previews. Professional services firms rely heavily on LinkedIn referrals. A missing share image is a missed conversion opportunity.

**Fix:** Add a 1200x630 px og:image and twitter:image to the homepage. Use a branded graphic with the InPac Wealth logo and tagline. Example:

```html
<meta property="og:image" content="https://inpacwealth.com/images/og-image.jpg" />
<meta name="twitter:image" content="https://inpacwealth.com/images/og-image.jpg" />
```

---

### 5. Title tag too short ⚠ LOW PRIORITY

The homepage title is "INPAC WEALTH" (12 characters). Google recommends 30-65 characters. The current title wastes opportunity to include primary keywords like "financial planning," "wealth management," or a geographic modifier if the firm serves a specific region.

**Impact:** Lower relevance signal for keyword queries. Missed opportunity to differentiate in SERPs. Title tags are still a top-3 on-page ranking factor.

**Fix:** Expand the title to 50-60 characters with primary service keywords. Example:

```html
<title>InPac Wealth | Financial Planning & Wealth Management</title>
```

If the firm serves a specific city or region, append it:

```html
<title>InPac Wealth | Financial Planning & Wealth Management in [City]</title>
```

---

### 6. H1 structure — ⚠ ISSUES

As detailed in Finding #3, the homepage has 9 H1 tags. This breaks accessibility guidelines and confuses topic modeling. A single H1 per page is the standard.

---

### 7. Image alt text — ⚠ ISSUES

14 of 16 images on the homepage are missing alt text. This blocks accessibility for screen readers and removes a relevance signal for image search and page context.

**Impact:** Poor accessibility score. Missed image search traffic. Alt text contributes to overall page topic modeling.

**Fix:** Add descriptive alt text to all images. Avoid keyword stuffing. Describe the image content. Examples:

```html
<img src="team.jpg" alt="InPac Wealth financial advisors meeting with client" />
<img src="graph.jpg" alt="Investment portfolio growth chart" />
```

For decorative images (logos, dividers), use empty alt: `alt=""`.

---

### 8. Word counts — ✓ ADEQUATE

| Page | Word count | Status |
|---|---|---|
| https://inpacwealth.com | 796 | ✓ adequate |

The homepage has 796 words. This is sufficient for a service homepage. Not thin content.

---

## Priority list (technical)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Add Organization and WebSite schema to homepage | HIGH | LOW |
| 2 | Add canonical tag to homepage (and sitewide) | HIGH | LOW |
| 3 | Refactor to single H1 per page | MEDIUM | MEDIUM |
| 4 | Add og:image and twitter:image | MEDIUM | LOW |
| 5 | Add alt text to 14 images | MEDIUM | LOW |
| 6 | Expand title tag to 50-60 characters with keywords | LOW | LOW |

---

## Raw data captured

The following files are in `raw/` for auditor reference:

- `home.html` — homepage HTML
- `robots.txt` — robots directives
- `sitemap.xml` — URL inventory
- `intake-report.json` — full scan data

Technical extraction ran via `scripts/run-audit.py` — see `raw/intake-report.json` for the full per-page signal data.