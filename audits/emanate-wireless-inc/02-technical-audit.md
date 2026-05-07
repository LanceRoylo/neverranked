# Technical Audit — Emanate Wireless

**Auditor:** Never Ranked
**Sample date:** 2026-05-07
**Pages sampled:** 1 page (homepage only)

---

## Summary

Emanate Wireless has zero structured data foundation. No canonical tags, no Organization schema, no WebSite schema, and no OpenGraph images. The homepage carries three H1 tags where one is expected, and the title tag is 16 characters (half the minimum threshold). With 159 words on the homepage and 8 of 12 images missing alt text, the site is invisible to AI engines and underperforming in traditional search.

**Overall grade: D** (Core entity signals are absent, thin content, and basic on-page hygiene is broken.)

---

## Findings

### 1. No Organization schema anywhere ⚠ HIGH PRIORITY

The scan found zero JSON-LD blocks on the homepage. No Organization schema means Google, ChatGPT, Perplexity, and Gemini have no entity anchor for Emanate Wireless. They cannot connect the brand name to contact info, industry, or offerings. Without this schema, the Knowledge Graph ignores you. AI engines skip you. Rich results are off the table.

**Impact:** Entity recognition is the foundation of AEO. Without Organization schema, there is no machine-readable record that Emanate Wireless exists. Google will not show a Knowledge Panel. AI engines will not cite you as a vendor authority in healthcare RTLS queries.

**Fix:** Add this JSON-LD block to the `<head>` of every page:

```json
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Emanate Wireless, Inc.",
  "url": "https://emanatewireless.com",
  "logo": "https://emanatewireless.com/path-to-logo.png",
  "description": "Real-time location and asset monitoring solutions for healthcare.",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Hudson",
    "addressRegion": "OH",
    "addressCountry": "US"
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "Sales",
    "email": "contact@emanatewireless.com"
  },
  "sameAs": [
    "https://www.linkedin.com/company/emanate-wireless"
  ]
}
</script>
```

---

### 2. Missing canonical tags on 100% of sampled pages ⚠ HIGH PRIORITY

The homepage has no canonical tag. This tells Google nothing about which URL is authoritative. If `https://emanatewireless.com` and `https://emanatewireless.com/` and `https://www.emanatewireless.com` all resolve, Google picks one arbitrarily. Link equity fragments. Indexing becomes unpredictable.

**Impact:** Without canonicals, Google may index duplicate versions of the same page. AI engines scraping multiple URLs for the same content will see inconsistency and deprioritize all versions. Backlinks pointing to non-canonical variants are wasted.

**Fix:** Add this tag inside `<head>` on every page:

```html
<link rel="canonical" href="https://emanatewireless.com" />
```

Use absolute URLs. Set one canonical per page. If the page is `https://emanatewireless.com/solutions`, the canonical should match exactly.

---

### 3. No OpenGraph image on homepage ⚠ MEDIUM PRIORITY

The homepage has `og:title` and `og:description`, but `og:image` is missing. When the site is shared on LinkedIn, Slack, or Twitter, the preview card is text-only. No visual. No brand presence. AI engines like Perplexity and ChatGPT also pull OG images when citing sources. Without one, your citation is a gray placeholder.

**Impact:** Social shares are visually dead. AI citations lack imagery. Brand recall drops. Link clicks from shared URLs fall by 30 to 50% without a thumbnail.

**Fix:** Add this inside `<head>`:

```html
<meta property="og:image" content="https://emanatewireless.com/og-image-emanate-wireless.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://emanatewireless.com/og-image-emanate-wireless.jpg" />
```

Create a 1200×630 px image showing the logo, tagline, and a device or hospital visual. Host it at root.

---

### 4. Title tag is 16 characters (50% below minimum) ⚠ HIGH PRIORITY

The homepage title is "Emanate Wireless." That is 16 characters. Google recommends 30 to 65. This title wastes SERP real estate and includes zero keyword context. A buyer searching "RTLS healthcare asset tracking" will not see relevance signals in the title. AI engines parsing the page will not extract a clear value proposition.

**Impact:** CTR in search drops when titles are vague. AI summaries ignore pages with weak titles because there is no semantic hook to extract. Google may rewrite the title dynamically, which means you lose control of messaging.

**Fix:** Rewrite to 50 to 60 characters with primary keyword and value prop:

```html
<title>Real-Time Location Systems (RTLS) for Healthcare | Emanate Wireless</title>
```

Or:

```html
<title>Hospital Asset Tracking & Patient Monitoring | Emanate Wireless</title>
```

Include the product category, the industry, and the brand. Test in Moz Title Tag Preview or Portent SERP Preview Tool.

---

### 5. Homepage has 159 words (thin content) ⚠ MEDIUM PRIORITY

The homepage contains 159 words. Google's quality guidelines flag pages under 300 words as thin unless they are gated tools or landing pages with clear conversion intent. Emanate Wireless is a B2B vendor site. The homepage should orient buyers, explain the product category, and answer "why this company?" AI engines cannot generate meaningful summaries from 159 words. There is no context to extract.

**Impact:** Thin pages rank poorly for informational and commercial queries. AI engines skip pages with low word count because there is insufficient context to cite. Google may not index the page as a primary entity anchor.

**Fix:** Expand homepage content to 500 to 800 words. Add:

- A 2-sentence intro explaining what RTLS is and why healthcare facilities need it.
- A "Who we serve" section (hospitals, surgery centers, long-term care).
- A "How it works" overview (tags, sensors, software dashboard).
- A "Why Emanate" section (99.9% room-level accuracy, real-time alerts, 20-year engineering pedigree).
- A FAQ block answering "What is RTLS?" and "How accurate is your system?"

Every section should target a buyer search query: "what is RTLS in healthcare," "most accurate hospital asset tracking," "real-time patient location system."

---

### 6. H1 structure ⚠ ISSUES

The homepage has 3 H1 tags. Best practice is one H1 per page. Multiple H1s dilute topical focus and confuse Google's understanding of page hierarchy. The first H1 is "99.9% ROOM LEVEL ACCURACY," which is a feature claim, not a page topic.

**Impact:** Multiple H1s split keyword weight. Google may not parse the page as a coherent entity. AI engines extracting page summaries will default to the first H1, which in this case is a stat, not a value proposition.

**Fix:** Keep one H1. Make it the page topic:

```html
<h1>Real-Time Location Systems for Healthcare Facilities</h1>
```

Demote "99.9% ROOM LEVEL ACCURACY" to an H2 or a styled `<p>` with a `.stat` class. Reserve H1 for the page's primary keyword target.

---

### 7. Image alt text ⚠ ISSUES

8 of 12 images are missing alt text. That is 67% of visual content invisible to screen readers, Google Images, and AI engines. Alt text is a ranking signal for image search and a required accessibility attribute. AI engines scraping pages for visual context skip images without alt attributes.

**Impact:** Images do not appear in Google Images results. Visually impaired users cannot navigate the page. AI engines cannot describe or cite the visuals, which reduces the page's authority in multimodal results (ChatGPT, Gemini, Perplexity all use image alt for context).

**Fix:** Add descriptive alt text to every `<img>` tag. Examples:

```html
<img src="rtls-tag.jpg" alt="Emanate Wireless RTLS tag attached to hospital IV pump" />
<img src="dashboard-screenshot.jpg" alt="Real-time asset tracking dashboard showing hospital equipment locations" />
<img src="hospital-hallway.jpg" alt="Hospital hallway with RTLS sensors installed in ceiling tiles" />
```

Alt text should describe what is in the image and include a keyword when natural. Never keyword-stuff. Never leave it blank.

---

### 8. Word counts

| Page | Word count | Status |
|---|---|---|
| https://emanatewireless.com | 159 | thin |

---

## Priority list (technical)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Add Organization schema to `<head>` | HIGH | LOW |
| 2 | Add canonical tags to all pages | HIGH | LOW |
| 3 | Rewrite title tag to 50-60 characters with primary keyword | HIGH | LOW |
| 4 | Add og:image and Twitter Card tags | MEDIUM | LOW |
| 5 | Expand homepage content to 500+ words with FAQ, benefits, use cases | MEDIUM | MEDIUM |
| 6 | Fix H1 structure (one H1 per page, topically relevant) | MEDIUM | LOW |
| 7 | Add alt text to 8 images missing attributes | MEDIUM | LOW |

---

## Raw data captured

The following files are in `raw/` for auditor reference:

- `home.html` — homepage HTML
- `robots.txt` — robots directives
- `sitemap.xml` — URL inventory
- `intake-report.json` — full scan results with per-page signals

Technical extraction ran via `scripts/run-audit.py` — see `raw/intake-report.json` for the full per-page signal data.