# Technical Audit — Drake Real Estate Partners

**Auditor:** Never Ranked
**Sample date:** 2026-05-07
**Pages sampled:** 1 representative page (homepage)

---

## Summary

Drake Real Estate Partners' homepage is live but structurally incomplete. No schema markup, no H1, no canonical tag, and only 4 words of body content. The page appears to be a placeholder or a splash screen rather than a functional landing page. Every foundational technical element needs implementation.

**Overall grade: F** (Critical gaps across every measured dimension. This is effectively a skeleton page.)

---

## Findings

### 1. Zero schema markup on the homepage ⚠ HIGH PRIORITY

The homepage at https://drakerep.com has no JSON-LD schema blocks. No Organization, no WebSite, no BreadcrumbList. Google and other engines have no structured data to build an entity profile, no SearchAction hook for sitelinks search box, and no breadcrumb eligibility in SERPs.

**Impact:** Without Organization schema, Drake Real Estate Partners cannot be recognized as a named entity. AI engines like Perplexity and ChatGPT have no authoritative profile to cite. No rich results are possible. This is a total blackout for structured data.

**Fix:** Add Organization schema to the homepage with name, logo, url, sameAs (social profiles), address (if applicable), and contactPoint. Add WebSite schema with potentialAction SearchAction to enable sitelinks search box. Example:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://drakerep.com/#organization",
      "name": "Drake Real Estate Partners",
      "url": "https://drakerep.com",
      "logo": "https://drakerep.com/logo.png",
      "sameAs": [
        "https://www.linkedin.com/company/drakerep"
      ]
    },
    {
      "@type": "WebSite",
      "@id": "https://drakerep.com/#website",
      "url": "https://drakerep.com",
      "name": "Drake Real Estate Partners",
      "publisher": {
        "@id": "https://drakerep.com/#organization"
      },
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://drakerep.com/?s={search_term_string}",
        "query-input": "required name=search_term_string"
      }
    }
  ]
}
```

---

### 2. Missing canonical tag on homepage ⚠ HIGH PRIORITY

The homepage has no `<link rel="canonical">` tag. This leaves Google to guess the preferred URL variant (www vs. non-www, trailing slash, query parameters).

**Impact:** Without a canonical, duplicate URL variants can split signals. If the site later adds UTM parameters or subdomain variants, Google may index multiple versions and dilute authority.

**Fix:** Add self-referencing canonical to the `<head>`:

```html
<link rel="canonical" href="https://drakerep.com" />
```

Ensure consistency: if you redirect www to non-www, the canonical should match the final resolved URL.

---

### 3. No H1 on homepage ⚠ HIGH PRIORITY

The homepage has zero H1 tags. No heading hierarchy exists (0 H1, 0 H2, 0 H3).

**Impact:** The H1 is the primary on-page relevance signal. Without it, search engines have no clear topic declaration. This is especially damaging for a homepage that should declare "Drake Real Estate Partners is a real estate investment firm focused on value-add and opportunistic investments."

**Fix:** Add a single H1 to the homepage that clearly states the business name and core offer:

```html
<h1>Drake Real Estate Partners — Value-Add Real Estate Investments</h1>
```

Follow with H2 subheadings for each major section (Investment Focus, Markets, Team, etc.).

---

### 4. Title tag under 30 characters ⚠ MEDIUM PRIORITY

The homepage title is "Drake Real Estate Partners" (26 characters). This wastes 39 characters of available space (Google typically displays 50-60 characters).

**Impact:** The title tag is the single most important on-page SEO element. A 26-character title misses the opportunity to include differentiators, location, or investment focus. It's also a weak AEO signal because it provides no context for AI summarization.

**Fix:** Expand the title to 50-60 characters with core keywords:

```html
<title>Drake Real Estate Partners | Value-Add Real Estate Investing</title>
```

Or, if New York focus is key:

```html
<title>Drake Real Estate Partners | NYC Real Estate Investment Firm</title>
```

---

### 5. No Open Graph image ⚠ MEDIUM PRIORITY

The homepage has `og:title`, `og:description`, and `og:type` but no `og:image` or `twitter:image`. When the URL is shared on LinkedIn, Slack, or Twitter, no visual appears.

**Impact:** Social shares with no image get 80% less engagement. For a financial services firm, a professional share card with logo and brand colors is table stakes for credibility.

**Fix:** Add `og:image` and `twitter:image` tags pointing to a 1200x630 PNG or JPG:

```html
<meta property="og:image" content="https://drakerep.com/og-image.png" />
<meta name="twitter:image" content="https://drakerep.com/og-image.png" />
<meta name="twitter:card" content="summary_large_image" />
```

Ensure the image is hosted at an absolute URL and is at least 1200x630 pixels.

---

### 6. H1 structure — ⚠ ISSUES

1 of 1 pages sampled have no H1. This is a complete failure of heading structure.

---

### 7. Image alt text — ⚠ ISSUES

1 of 1 images on the homepage are missing alt text. This is a 100% failure rate for accessibility and image SEO.

**Fix:** Add descriptive alt text to every image. For logos:

```html
<img src="logo.png" alt="Drake Real Estate Partners logo" />
```

For photos of buildings or team members, describe the content concisely.

---

### 8. Word counts — ⚠ CRITICAL

| Page | Word count | Status |
|---|---|---|
| https://drakerep.com | 4 | Thin (under 300) |

The homepage contains only 4 words of body content. This is not a functional page. It reads as a placeholder or splash screen.

**Impact:** Google's quality rater guidelines explicitly penalize thin content. A homepage with 4 words cannot satisfy any informational query. AI engines have nothing to summarize or cite.

**Fix:** Expand the homepage to at least 300 words. Include sections on investment strategy, target markets, deal types, track record, and team credentials. Each section should be a paragraph of 50-100 words with clear H2 subheadings.

---

## Priority list (technical)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Add Organization and WebSite schema to homepage | HIGH | LOW |
| 2 | Add H1 and heading hierarchy to homepage | HIGH | LOW |
| 3 | Add canonical tag to homepage | HIGH | LOW |
| 4 | Expand homepage body content to 300+ words | HIGH | MEDIUM |
| 5 | Add alt text to all images | MEDIUM | LOW |
| 6 | Expand title tag to 50-60 characters | MEDIUM | LOW |
| 7 | Add Open Graph image | MEDIUM | LOW |

---

## Raw data captured

The following files are in `raw/` for auditor reference:

- `home.html` — homepage HTML
- `robots.txt` — robots directives
- `sitemap.xml` — URL inventory

Technical extraction ran via `scripts/run-audit.py` — see `raw/intake-report.json` for the full per-page signal data.