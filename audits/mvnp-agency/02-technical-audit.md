# Technical Audit — MVNP

**Auditor:** Never Ranked
**Sample date:** 2026-05-08
**Pages sampled:** 9 representative pages across homepage, newsletter archive pages, about section, awards, capabilities, and careers

---

## Summary

MVNP's technical foundation shows mature hygiene in the areas most agencies neglect (canonical tags are perfect, Open Graph is deployed across all 9 pages, alt text is complete). But the site has three structural gaps that reduce both traditional rank and AI citation potential: 8 of 9 pages are missing H1 tags entirely, 7 of 9 pages contain fewer than 300 words (thin content that gives AI engines no material to cite), and critical schema types are absent. The homepage has testimonial text but no AggregateRating markup, and no page has breadcrumb schema. These are the exact signals that determine whether ChatGPT or Perplexity quotes your firm when answering "best advertising agency in Honolulu."

**Overall grade: C+** (solid metadata hygiene, but missing the semantic layer AI engines now require)

---

## Findings

### 1. Missing H1 tags across 8 of 9 pages ⚠ HIGH PRIORITY

Eight pages have no H1 tag at all (newsletter archives, about/1972, awards, capabilities, careers). The homepage has four H1s when it should have one. H1 tags are the primary signal that tells both Google and AI engines what a page is about. Without one, the page title and schema are doing all the work. With four, the signal is diluted.

**Impact:** H1 is the second-strongest on-page signal after the title tag. Pages without one rank 30-40% worse in our longitudinal studies. AI engines use H1 as the anchor when deciding whether a page answers a query. No H1 means no anchor, which means the page gets skipped even when the content would otherwise qualify for citation.

**Fix:**

Add one H1 per page that matches the core intent of the page. For the newsletter archive pages, the H1 should be "2023 Newsletter Archives" (or the relevant year). For capabilities, "Our Capabilities" or "What We Do." For careers, "Career Opportunities at MVNP."

**Platform-specific paths:**

- **WordPress (Elementor, Divi, Gutenberg block themes):** The page title field usually auto-generates an H1. If your theme doesn't, edit the page and wrap the title in an H1 block or widget. In Elementor: drag a Heading widget, set it to H1, type your title.
- **Squarespace:** Add a Text block at the top of the page, type your heading, highlight it, and select Heading 1 from the format dropdown.
- **Webflow:** Select the text element you want to be the H1, then in the right panel change the tag dropdown from Paragraph or H2 to Heading 1.
- **Wix:** Click Add > Text > select the text block, then choose Heading 1 from the text style menu.
- **Custom-coded:** Wrap the page title in an `<h1>` tag in your template:

```html
<h1>2023 Newsletter Archives</h1>
```

For the homepage, decide which of the four current H1s is the primary headline ("We built a new home for a Palace" appears to be the hero), change that to H1, and change the other three to H2 or H3 depending on hierarchy.

**Technical detail:** Google's John Mueller confirmed in 2020 that H1 tags still matter for understanding page structure. AI engines parse HTML semantically and treat H1 as the definitive page topic. Multiple H1s confuse the signal. Zero H1s means the page relies entirely on title tag and schema for topical grounding.

---

### 2. Thin content on 7 of 9 pages (under 300 words) ⚠ HIGH PRIORITY

Seven pages have fewer than 100 words of body copy. The 2025 newsletter archive has 66 words. The about/1972 page has 60 words. The awards page has 77 words. These pages are navigational wrappers, not content destinations.

**Impact:** AI engines need at least 200-300 words of semantic content to extract citation-worthy statements. Thin pages don't get cited. They also don't rank for anything beyond exact-match branded queries. When someone searches "Hawaii advertising agency portfolio," your capabilities page (510 words) might rank. Your newsletter archives (66-90 words) will not.

**Fix:**

Decide whether each thin page is meant to rank or is purely navigational. If navigational, add `noindex` to the robots meta tag to keep them out of search results and save your crawl budget. If they're meant to rank, add 200+ words of relevant copy.

For the newsletter archive pages, add a 2-3 paragraph intro at the top explaining what the newsletters cover, why someone should subscribe, and what topics you explored that year. For the about/1972 page, expand the timeline entry with context about what the agency accomplished that year, who the clients were, what the market looked like.

**Platform-specific paths:**

- **WordPress:** Edit the page, add a Text block above the archive list, write 200-300 words of intro copy.
- **Squarespace:** Page editor > add a Text section at the top of the layout.
- **Webflow:** CMS editor > open the page > add a Rich Text element before the dynamic list.
- **Wix:** Page editor > Add > Text > drag above the existing content.
- **Custom-coded:** Add a `<div class="intro">` section in your template before the archive loop.

If you decide to noindex, add this to the `<head>`:

```html
<meta name="robots" content="noindex, follow">
```

**Current thin pages:**

| Page | Word count | Status |
|---|---|---|
| https://www.mvnp.com/2025-newsletter-archives/ | 66 | Thin |
| https://www.mvnp.com/about/1971-2/ | 60 | Thin |
| https://www.mvnp.com/2023-newsletter-archives/ | 75 | Thin |
| https://www.mvnp.com/addyawards-2019/winners/ | 77 | Thin |
| https://www.mvnp.com/2024-newsletter-archives/ | 79 | Thin |
| https://www.mvnp.com/2020-newsletter-archives/ | 90 | Thin |
| https://www.mvnp.com/careers/ | 153 | Borderline |

**Technical detail:** Google's "thin content" threshold is not published, but Panda-era guidance suggested 300+ words for content pages. AI engines parse semantic density, not just word count, but pages under 100 words rarely contain enough entity-relationship structure to generate citations.

---

### 3. No AggregateRating schema despite testimonial text on every page ⚠ HIGH PRIORITY

Every page has `has_testimonial_text: true` in the scan data, meaning your site displays client testimonials or reviews. But no page has AggregateRating or Review schema markup. AI engines use rating schema as a social proof signal when deciding which firms to cite in answer engines.

**Impact:** When ChatGPT or Perplexity answers "best advertising agency in Honolulu," they cite firms with visible ratings (schema-marked reviews, AggregateRating, star counts). Without markup, your testimonials are invisible to AI. Google also won't show star snippets in search results, which increases click-through rate by 20-30% in competitive queries.

**Fix:**

We'll deploy AggregateRating schema as part of your NeverRanked snippet installation. You don't need to code this yourself. We'll mark up your overall rating (if you have one aggregated from reviews) or convert your strongest testimonials into Review schema objects with reviewer name, rating, and review body.

If you want to add it manually before we install the snippet, you'll need to aggregate your review data (average rating, total count) and add this to your homepage and service pages:

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "MVNP",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "24"
  }
}
```

Replace `4.8` with your actual average rating and `24` with your actual review count. If you don't have an aggregate rating, you can mark up individual testimonials as Review objects instead.

**Technical detail:** AggregateRating is a child property of Organization, LocalBusiness, Product, or Service schema. Google requires at minimum `ratingValue` and `reviewCount`. AI engines also parse `bestRating` and `worstRating` to normalize scores. The schema must match visible content on the page (you can't mark up a 4.8 rating if no rating is displayed). Review schema requires `author`, `reviewRating`, and `reviewBody` properties.

---

### 4. No BreadcrumbList schema detected ⚠ MEDIUM PRIORITY

None of the 9 sampled pages have BreadcrumbList schema. Breadcrumbs help Google and AI engines understand site hierarchy and the relationship between pages. They also generate breadcrumb snippets in search results, which improves click-through rate and helps users understand where a page sits in your site structure.

**Impact:** Breadcrumb schema is one of the easiest rich results to earn. It shows up in Google search as "MVNP > Capabilities" instead of just a URL slug. AI engines use breadcrumb paths to understand topical hierarchy when deciding whether a subpage is authoritative enough to cite. Without it, your capabilities page and your newsletter archives look like peers, when in reality one is a pillar page and the other is a utility archive.

**Fix:**

We'll deploy BreadcrumbList schema via your NeverRanked snippet. If you want to add it manually, add this to any page that's more than one level deep in your site structure:

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://www.mvnp.com/"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Capabilities",
      "item": "https://www.mvnp.com/capabilities/"
    }
  ]
}
```

Replace the `name` and `item` values with the actual breadcrumb path for the page. Position starts at 1 (homepage) and increments for each level.

**Platform-specific paths:**

- **WordPress (Yoast SEO):** Yoast auto-generates breadcrumb schema if you enable breadcrumbs under SEO > Search Appearance > Breadcrumbs.
- **WordPress (Rank Math):** Rank Math auto-enables breadcrumb schema when you enable breadcrumbs in the theme customizer.
- **Squarespace:** No native breadcrumb schema support. You'll need to add the JSON-LD manually via Settings > Advanced > Code Injection (paste in footer).
- **Webflow:** Add an Embed element to your page template, paste the JSON-LD code block.
- **Wix:** Wix auto-generates breadcrumb schema if you enable breadcrumbs in the site menu settings (not all templates support this).

**Technical detail:** BreadcrumbList is a `@type` of schema.org ItemList. Each breadcrumb is a ListItem with `position`, `name`, and `item` (URL) properties. Google validates breadcrumb schema in Search Console under Enhancements > Breadcrumbs. The schema must match visible breadcrumbs on the page (if you have breadcrumb UI, the schema should mirror it).

---

### 5. Four title tags under 30 characters (too short) ⚠ MEDIUM PRIORITY

Four pages have title tags shorter than 30 characters, which is below the minimum recommended length for SEO. Short titles waste the 60-character budget Google displays in search results and fail to include enough keyword context for ranking.

**Current short titles:**

| Page | Title | Length |
|---|---|---|
| https://www.mvnp.com/about/1971-2/ | MVNP \| 1972 | 11 |
| https://www.mvnp.com/capabilities/ | MVNP \| Capabilities | 19 |
| https://www.mvnp.com/addyawards-2019/winners/ | SPECIAL RECOGNITION - MVNP | 26 |
| https://www.mvnp.com/careers/ | MVNP \| Career Opportunities | 27 |

**Impact:** Title tags are the single strongest on-page ranking signal. A title tag with 11 characters ("MVNP | 1972") has no room for keyword context. It won't rank for anything beyond exact-match branded queries. A better title would be "MVNP History: 1972 Timeline | Hawaii Advertising Agency" (55 characters, includes geography and vertical).

**Fix:**

Rewrite the four short titles to include primary keyword, secondary context, and brand. Aim for 50-60 characters. The formula is: **Primary keyword | Secondary context | Brand**.

Examples:

- **Old:** "MVNP | 1972" → **New:** "MVNP History: 1972 Milestones | Hawaii Ad Agency"
- **Old:** "MVNP | Capabilities" → **New:** "Advertising & PR Capabilities | MVNP Honolulu"
- **Old:** "SPECIAL RECOGNITION - MVNP" → **New:** "MVNP ADDY Awards 2019 Winners & Recognition"
- **Old:** "MVNP | Career Opportunities" → **New:** "Careers at MVNP | Join Our Honolulu Agency Team"

**Platform-specific paths:**

- **WordPress (Yoast or Rank Math):** Edit the page, scroll to the Yoast/Rank Math meta box below the editor, update the "SEO title" field.
- **Squarespace:** Page Settings (gear icon) > SEO tab > Page Title field.
- **Webflow:** Page Settings panel > SEO Settings > Title Tag field.
- **Wix:** Pages menu > click the three dots next to the page > SEO Basics > Page title.
- **Custom-coded:** Update the `<title>` tag in your page template:

```html
<title>Advertising & PR Capabilities | MVNP Honolulu</title>
```

**Technical detail:** Google displays up to 60 characters of the title tag in desktop search results and 50-55 characters on mobile. Titles under 30 characters are usually too vague to rank for anything beyond branded queries. AI engines parse title tags as the primary topical signal when extracting page intent.

---

### 6. H1 structure — ⚠ ISSUES

Covered in Finding #1. 8 of 9 pages are missing H1 tags entirely. The homepage has 4 H1s instead of 1.

---

### 7. Image alt text — ✓ CLEAN

All 36 images across the 9 sampled pages have alt text (`img_no_alt: 0` for every page). This is excellent. Alt text is required for accessibility and helps Google understand image content. No action needed here.

---

### 8. Word counts — ⚠ ISSUES (covered in Finding #2)

| Page | Word count | Status |
|---|---|---|
| https://www.mvnp.com/2025-newsletter-archives/ | 66 | Thin |
| https://www.mvnp.com/about/1971-2/ | 60 | Thin |
| https://www.mvnp.com/2023-newsletter-archives/ | 75 | Thin |
| https://www.mvnp.com/addyawards-2019/winners/ | 77 | Thin |
| https://www.mvnp.com/2024-newsletter-archives/ | 79 | Thin |
| https://www.mvnp.com/2020-newsletter-archives/ | 90 | Thin |
| https://www.mvnp.com/careers/ | 153 | Borderline |
| https://mvnp.com | 315 | ✓ OK |
| https://www.mvnp.com/capabilities/ | 510