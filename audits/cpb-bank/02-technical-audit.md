# Technical Audit — Central Pacific Bank

**Auditor:** Never Ranked
**Sample date:** 2026-05-07
**Pages sampled:** 1 representative page (homepage)

---

## Summary

Central Pacific Bank's homepage has strong content depth (1,614 words) and a title tag in the correct range, but the technical SEO foundation is nearly absent. Zero schema markup means search engines and LLMs have no structured data to parse for entity recognition, rich results, or citation chains. No canonical tag, no meta description, no Open Graph images, and 8 H1 tags on a single page create ambiguity about page purpose and hierarchy.

**Overall grade: D** (Good content volume undermined by missing core technical signals that limit visibility in both traditional search and AI answer engines.)

---

## Findings

### 1. Zero schema markup across the entire sample ⚠ HIGH PRIORITY

The homepage at https://cpb.bank has no JSON-LD structured data. No Organization schema, no WebSite schema with SearchAction, no BreadcrumbList, no AggregateRating. For a financial institution, Organization schema is the foundation of entity recognition. Without it, Google and AI engines cannot reliably attribute brand mentions, locations, contact info, or social profiles to the correct entity graph node. WebSite schema enables sitelink search box rich results. BreadcrumbList enables breadcrumb rich snippets in SERPs.

**Impact:** AI engines like ChatGPT, Perplexity, and Google SGE parse schema first when constructing answers. Without Organization schema, the bank is invisible to entity-based queries. No SearchAction means no sitelink search box. No breadcrumbs in search results reduce click-through. Zero social proof schema means LLMs have no structured signal to cite when users ask "is Central Pacific Bank reputable?"

**Fix:** Add three schema blocks to the homepage `<head>` or footer:

```json
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FinancialService",
  "@id": "https://cpb.bank/#organization",
  "name": "Central Pacific Bank",
  "url": "https://cpb.bank",
  "logo": "https://cpb.bank/logo.png",
  "sameAs": [
    "https://www.facebook.com/CentralPacificBank",
    "https://www.linkedin.com/company/central-pacific-bank"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+1-808-544-0500",
    "contactType": "customer service"
  }
}
</script>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://cpb.bank/#website",
  "url": "https://cpb.bank",
  "name": "Central Pacific Bank",
  "publisher": {
    "@id": "https://cpb.bank/#organization"
  },
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://cpb.bank/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
</script>
```

Extend Organization schema to product and location pages with LocalBusiness for branch locations and Service schema for individual banking products.

---

### 2. Missing canonical tags on all sampled pages ⚠ HIGH PRIORITY

The homepage has no `<link rel="canonical">` tag. Canonical tags are non-negotiable for any site with query parameters, session IDs, tracking params, or multiple URLs pointing to the same content. Banks often have UTM-tagged campaign URLs, mobile subdomains, or A/B test variants. Without canonicals, Google may index duplicate versions or split ranking signals across multiple URLs.

**Impact:** Diluted authority across duplicate URLs. Risk of parameter-based duplicates appearing in the index. LLMs scraping multiple versions of the same page will see inconsistent signals. Canonical is also a trust signal that the site owner understands URL hygiene.

**Fix:** Add self-referencing canonical to every page template:

```html
<link rel="canonical" href="https://cpb.bank">
```

For paginated or filtered pages, point canonical to the primary version. For product pages, use the clean URL without session or tracking params.

---

### 3. Missing meta description ⚠ HIGH PRIORITY

The homepage has no meta description tag. While not a direct ranking factor, the meta description is the single most important click-through signal in traditional SERPs. It also serves as a fallback snippet source for AI engines when they cannot extract a clean sentence from body copy. A bank homepage without a meta description leaves snippet generation to chance.

**Impact:** Google will auto-generate snippets from body text, often pulling disjointed sentences or navigation text. AI engines may skip the page entirely if they cannot quickly parse intent. Missing meta descriptions correlate with lower CTR in SERPs, especially for branded queries where the description is the only differentiation between the bank and aggregator sites.

**Fix:** Add a 120-character meta description to the homepage:

```html
<meta name="description" content="Central Pacific Bank offers personal and business banking, mortgages, and loans across Hawaii. Trusted since 1954. Open an account online today.">
```

Write unique descriptions for every template type (product pages, branch pages, resource pages). Front-load the value prop in the first 80 characters for mobile snippet truncation.

---

### 4. Missing Open Graph image and social meta tags ⚠ MEDIUM PRIORITY

The homepage has no `og:image`, `og:title`, `og:description`, `og:type`, `twitter:card`, or `twitter:image` tags. When the site is shared on LinkedIn, Slack, Facebook, or Twitter, the preview card will be blank or pull random images from the page. For a bank, this is a trust and brand signal failure. Social shares are also increasingly indexed by AI engines as social proof signals.

**Impact:** Broken or ugly social share previews reduce click-through and brand perception. LLMs scraping social platforms for entity validation see no structured brand signals. Open Graph is also used by some LLMs as a fallback when JSON-LD schema is missing.

**Fix:** Add Open Graph and Twitter Card tags to the `<head>`:

```html
<meta property="og:title" content="Central Pacific Bank - We Got You!">
<meta property="og:description" content="Personal and business banking, mortgages, and loans across Hawaii. Trusted since 1954.">
<meta property="og:image" content="https://cpb.bank/og-image.jpg">
<meta property="og:type" content="website">
<meta property="og:url" content="https://cpb.bank">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://cpb.bank/og-image.jpg">
```

Use a 1200x630px branded image with logo and tagline. Avoid text-heavy images (illegible at thumbnail size).

---

### 5. 65 external links on the homepage ⚠ MEDIUM PRIORITY

The homepage has 65 outbound external links alongside 306 internal links. While not inherently harmful, this is an unusually high external link count for a bank homepage. High external link counts can signal low editorial control, link scheme participation, or compromised footer/sidebar modules. It also dilutes internal PageRank flow.

**Impact:** Each external link is a vote of authority flowing out. 65 votes is excessive for a homepage. If any of these links are to low-quality domains (aggregators, directories, irrelevant partners), it signals poor link hygiene to Google. LLMs parsing link graphs may also downweight the site's authority if it appears to be a link farm participant.

**Fix:** Audit the 65 external links. Remove or nofollow any that are not editorially justified (required regulatory disclosures, FDIC, NCUA, industry associations). Move partner links to a dedicated partner page. Use `rel="nofollow sponsored"` for any paid partnerships. Goal: reduce homepage external links to under 10.

---

### 6. H1 structure — ⚠ ISSUES

The homepage has 8 H1 tags. Multiple H1s create ambiguity about page topic and hierarchy. While not a penalty, it dilutes the semantic weight of each heading and makes it harder for crawlers and LLMs to identify the primary page theme. Google's John Mueller has said multiple H1s are "fine" but also "confusing" for accessibility and parsing.

**Impact:** Search engines and screen readers expect one primary heading per page. Eight H1s suggest either a CMS misconfiguration or a design pattern that prioritizes visual hierarchy over semantic HTML. LLMs parsing the page for topic extraction will see eight competing signals. The first H1 is "Want a bank for life? We got you." which is strong, but the other seven dilute it.

**Fix:** Refactor the template so only the primary headline uses `<h1>`. Convert the other seven headings to `<h2>` or `<h3>` based on content hierarchy. If the design requires identical styling, use CSS to match H2 visual weight to the original H1 style.

```html
<h1>Want a bank for life? We got you.</h1>
<h2>Personal Banking</h2>
<h2>Business Banking</h2>
<!-- etc. -->
```

---

### 7. Image alt text — ⚠ ISSUES

34 of 56 images on the homepage are missing alt attributes (60.7% missing). Alt text is required for accessibility, helps Google Images ranking, and provides fallback context for LLMs when images fail to load or cannot be parsed visually. For a bank, many images are likely product icons, branch photos, or lifestyle imagery that reinforce trust and local presence.

**Impact:** Missing alt text is an ADA compliance risk and excludes screen reader users. Google Images is a meaningful traffic source for competitive product queries ("best Hawaii mortgage rates"). LLMs cannot describe or cite images without alt text, so any visual trust signals are invisible to AI answer engines.

**Fix:** Add descriptive alt text to every image. Prioritize images that convey product, location, or trust signals.

```html
<img src="branch-waikiki.jpg" alt="Central Pacific Bank Waikiki branch exterior">
<img src="mortgage-icon.jpg" alt="Home mortgage icon">
<img src="team-photo.jpg" alt="Central Pacific Bank customer service team in Honolulu">
```

Avoid keyword stuffing. If the image is purely decorative (background patterns, spacers), use `alt=""` to hide it from screen readers but do not omit the attribute.

---

### 8. Word counts — ✓ STRONG

| Page | Word count | Status |
|---|---|---|
| https://cpb.bank | 1,614 | ✓ Strong depth |

The homepage has 1,614 words, well above the 300-word minimum and sufficient to cover product range, trust signals, and local relevance. No thin content detected in this sample.

---

## Priority list (technical)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Add Organization, WebSite, and FinancialService schema to homepage | HIGH | LOW |
| 2 | Add canonical tags to all page templates | HIGH | LOW |
| 3 | Write and deploy unique meta descriptions for all pages | HIGH | MEDIUM |
| 4 | Refactor H1 structure to one H1 per page | MEDIUM | LOW |
| 5 | Add alt text to all 34 images missing it | MEDIUM | MEDIUM |
| 6 | Audit and reduce 65 external links on homepage | MEDIUM | MEDIUM |
| 7 | Add Open Graph and Twitter Card tags | MEDIUM | LOW |

---

## Raw data captured

The following files are in `raw/` for auditor reference:

- `home.html` — homepage HTML
- `robots.txt` — robots directives
- `sitemap.xml` — URL inventory
- `intake-report.json` — full per-page scan data

Technical extraction ran via `scripts/run-audit.py`. See `raw/intake-report.json` for the full per-page signal data.