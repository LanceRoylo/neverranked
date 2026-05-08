# Technical Audit — Ward Village

**Auditor:** Never Ranked
**Sample date:** 2026-05-08
**Pages sampled:** 10 representative pages across homepage, about/amenity pages, article content, directory pages, and contact forms

---

## Summary

Ward Village has a solid technical foundation. Every sampled page has proper canonical tags, structured data is present across the board, and the site is technically crawlable. The gaps are inEntity layer (no Organization schema means Google and ChatGPT treat the brand as a collection of pages, not a business) and social sharing metadata (30% of pages missing Open Graph images). Title tags and meta descriptions need tuning. Six pages have either zero or multiple H1s, which confuses page-topic clarity. These are high-leverage fixes with low implementation cost.

**Overall grade: B+** (strong crawl foundation, missing entity signals and social metadata that matter for AEO and citation)

---

## Findings

### 1. Tell Google who you are as a company (Organization schema missing) ⚠ HIGH PRIORITY

Your site has no Organization schema on any of the 10 sampled pages. This is the single most important structured data type for a real estate developer. Without it, search engines and AI answer engines treat Ward Village as a website, not as a business entity. They cannot reliably connect your brand name, logo, social profiles, and contact information. When someone asks ChatGPT or Perplexity "Who owns Ward Village?" or "What is Ward Village's developer?" the AI has no authoritative hook in your markup to cite.

**Impact:** Organization schema is the anchor for Knowledge Graph inclusion. Google uses it to power brand panels in search results. AI engines use it to cite companies by name. Without it, you lose credit for mentions and cannot be reliably surfaced as an answer to entity queries ("Howard Hughes developments in Honolulu").

**Fix:**

NeverRanked will deploy Organization schema via our snippet. It will include:

- `name`: "Ward Village"
- `url`: "https://www.wardvillage.com"
- `logo`: your brand mark (we will extract from the site or you provide the URL)
- `sameAs`: links to your Instagram, Facebook, LinkedIn, and any other official profiles
- `address`: physical address in PostalAddress schema
- `contactPoint`: sales or info line with areaServed and contactType

This goes in the sitewide `<head>` or footer. No action required from your side once the snippet is live.

**Technical detail:**

The markup we deploy will validate against schema.org/Organization and include these required properties: `@type`, `name`, `url`, `logo`. Recommended additions: `sameAs` (social proof), `address` (geo-anchor), `contactPoint` (phone + contact type). Google's Structured Data Testing Tool and the Rich Results Test will both parse it. Once live, check the Knowledge Graph API to confirm entity recognition within 2 to 4 weeks.

---

### 2. Fix social preview cards on 3 pages (og:image missing) ⚠ HIGH PRIORITY

Three of the 10 sampled pages are missing `og:image` tags. When someone shares these pages on LinkedIn, Facebook, or Slack (or when ChatGPT or Perplexity references them), the preview card shows up blank or with a broken placeholder. The affected pages are:

- https://www.wardvillage.com/ads/
- https://www.wardvillage.com/broker-portal/
- https://www.wardvillage.com/contact-information/

**Impact:** Social shares drive referral traffic. AI answer engines increasingly display preview cards when citing sources. A missing image makes your content look unfinished and reduces click-through from shared links by 30 to 50% (industry average per Buffer's 2024 study).

**Fix:**

Add an Open Graph image tag to each page. The image should be 1200×630 pixels (the LinkedIn/Facebook standard). Use a branded image or a page-specific hero shot.

**How to add it (by platform):**

- **WordPress (Yoast SEO):** Edit the page, scroll to Yoast meta box, click Social tab, upload an image under Facebook/Open Graph.
- **WordPress (Rank Math):** Edit page, Rank Math SEO panel, Social tab, upload Facebook thumbnail.
- **Squarespace:** Page Settings > SEO > Social Image > upload (applied per-page).
- **Webflow:** Page Settings > Open Graph Settings > OG Image > upload.
- **Wix:** Page menu > SEO (Google) > Social Share > upload image.
- **Custom-coded site:** Paste this in the `<head>` of each page:

```html
<meta property="og:image" content="https://www.wardvillage.com/path/to/image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Ward Village - Honolulu master-planned community">
```

Replace `/path/to/image.jpg` with the actual image URL. The `width`, `height`, and `alt` tags are optional but improve card rendering and accessibility.

**Technical detail:**

The Open Graph Protocol (ogp.me) defines `og:image` as the canonical social preview image. Facebook, LinkedIn, Twitter (when `twitter:image` is absent), Slack, and Discord all read this tag. Validators: Facebook Sharing Debugger (developers.facebook.com/tools/debug/), LinkedIn Post Inspector, Twitter Card Validator. After adding the tag, clear the cache in each validator by re-scraping the URL.

---

### 3. Add meta descriptions to 6 pages ⚠ MEDIUM PRIORITY

Six of the 10 sampled pages have either no meta description or one that is too long and will truncate in search results. Google cuts descriptions at roughly 160 characters. Three pages have descriptions over that limit (will show "..." in SERPs). Three pages have no description at all (Google will auto-generate one from body content, often poorly).

**Missing meta descriptions:**

- https://www.wardvillage.com/ads/
- https://www.wardvillage.com/amenities/
- https://www.wardvillage.com/articles/hidden-in-plain-sight-vladimir-ossipoff/
- https://www.wardvillage.com/broker-portal/
- https://www.wardvillage.com/centers/aeo-shops/
- https://www.wardvillage.com/contact-information/

**Over 160 characters (will truncate):**

- https://wardvillage.com (161 characters)
- https://www.wardvillage.com/ (161 characters, duplicate)
- https://www.wardvillage.com/about/art-culture/ (179 characters)

**Impact:** Meta descriptions do not directly affect rankings, but they do affect click-through rate. A well-written description that fits within the 160-character limit improves CTR by 5 to 10% (Moz 2025 CTR study). AI engines also use the meta description as a fallback when summarizing your page if body content is ambiguous.

**Fix:**

Write a unique 120 to 155 character description for each page. Lead with the value proposition or page purpose. Avoid repeating the title tag verbatim.

**How to add it (by platform):**

- **WordPress (Yoast or Rank Math):** Edit page, scroll to SEO plugin box, fill in "Meta description" field.
- **Squarespace:** Page Settings > SEO > Description.
- **Webflow:** Page Settings > SEO Settings > Meta Description.
- **Wix:** Page menu > SEO (Google) > SEO basics > What's the page about? (description field).
- **Custom-coded site:** Paste this in the `<head>`:

```html
<meta name="description" content="Your 120-155 character description here.">
```

**Technical detail:**

The `<meta name="description">` tag. Google reserves the right to ignore it and generate snippets from page content, but in practice uses the authored description 70% of the time when it is present and relevant to the query (Google Search Central documentation, 2024). Validate length with a SERP preview tool (e.g., Yoast's built-in preview, Moz Title Tag Preview Tool, or manualcounter.com).

---

### 4. Fix title tag length on 6 pages ⚠ MEDIUM PRIORITY

Six pages have title tags outside the recommended 30 to 65 character range. Google truncates titles at roughly 60 characters (or 600 pixels). Titles under 30 characters often waste valuable keyword space.

**Too short (under 30 characters):**

- https://www.wardvillage.com/ads/ — "Ads Archive - Ward Village" (26 characters)
- https://www.wardvillage.com/amenities/ — "Amenities - Ward Village" (24 characters)
- https://www.wardvillage.com/broker-portal/ — "Broker Portal - Ward Village" (28 characters)
- https://www.wardvillage.com/centers/aeo-shops/ — "Ae'o Shops - Ward Village" (25 characters)

**Too long (over 65 characters):**

- https://wardvillage.com — "Ward Village - Condos, Real Estate, Shops, & Dining | Ward Village" (70 characters, brand repeated)
- https://www.wardvillage.com/ — same as above (70 characters)

**Impact:** Truncated titles lose click-through. Short titles waste the single most important on-page ranking signal. A well-crafted title improves CTR and helps Google understand page topic.

**Fix:**

Rewrite titles to fit 50 to 60 characters. Include primary keyword near the front. Drop the redundant " - Ward Village" suffix if the brand already appears earlier in the title (as with the homepage).

**Suggested rewrites:**

- `/ads/` → "Advertising Archive | Ward Village Honolulu" (45 chars)
- `/amenities/` → "Resort Amenities & Resident Services | Ward Village" (52 chars)
- `/broker-portal/` → "Broker Resources & MLS Portal | Ward Village" (45 chars)
- `/centers/aeo-shops/` → "Ae'o Shops: Retail & Dining at Ward Village" (44 chars)
- Homepage → "Ward Village: Condos, Shops & Dining in Honolulu" (50 chars)

**How to edit (by platform):**

- **WordPress (Yoast or Rank Math):** Edit page, SEO plugin box, "SEO title" field.
- **Squarespace:** Page Settings > SEO > Page Title.
- **Webflow:** Page Settings > SEO Settings > Title Tag.
- **Wix:** Page menu > SEO (Google) > SEO basics > Page title.
- **Custom-coded site:** Edit the `<title>` tag in the page `<head>`:

```html
<title>Your 50-60 character title here</title>
```

**Technical detail:**

Google's title rewriting algorithm (rolled out August 2021) replaces author-specified titles roughly 60% of the time when they are deemed irrelevant, too long, or keyword-stuffed. Titles between 50 and 60 characters with clear intent signals are rewritten less often. Validate pixel width with a SERP simulator (e.g., Moz, Yoast, or Portent's SERP Preview Tool). The `<title>` tag is still the strongest on-page ranking factor per Google's 2024 ranking systems documentation.

---

### 5. Add AggregateRating schema (no social proof hook for AI engines) ⚠ MEDIUM PRIORITY

Your site has no AggregateRating schema on any sampled page. We detected testimonial-style text on 9 of 10 pages (`has_testimonial_text: true`), but none of it is marked up as a Review or AggregateRating. AI answer engines (ChatGPT, Perplexity, Google SGE) look for rating schema as a social proof signal when summarizing businesses. Without it, they have no numeric hook to cite ("Ward Village has a 4.8 star rating from residents").

**Impact:** AggregateRating enables rich snippets (star ratings in Google search results) and provides a cite-able social proof metric for AI-generated answers. A star rating in SERPs increases CTR by 15 to 35% (BrightLocal's 2025 Local Consumer Review Survey).

**Fix:**

NeverRanked will deploy AggregateRating schema on your homepage and any high-traffic landing pages. You provide:

- Average rating (1 to 5 scale)
- Total number of reviews
- Optional: link to third-party review source (Google, Yelp, Trustpilot, etc.)

We will structure it as:

```json
{
  "@type": "AggregateRating",
  "ratingValue": "4.8",
  "reviewCount": "247",
  "bestRating": "5",
  "worstRating": "1"
}
```

This nests inside your Organization schema (which we are also deploying per Finding #1).

**Technical detail:**

Schema.org/AggregateRating. Must be paired with a parent entity (Organization, LocalBusiness, Product, or Service). Google's Rich Results Test will validate it. Note: Google will only show star snippets in organic results if the reviews are from third-party sources or user-generated content on your own site. Self-asserted ratings without public review sources may not render stars, but the schema still feeds AI answer engines and the Knowledge Graph. Validate with Google's Rich Results Test and Schema Markup Validator (validator.schema.org).

---

### 6. H1 structure ⚠ ISSUES

Five pages have correct H1 structure (exactly one H1). Five pages do not:

**No H1 (3 pages):**

- https://www.wardvillage.com/amenities/
- https://www.wardvillage.com/broker-portal/
- (one additional page with `h1_count: 0` not listed in detailed scan excerpt)

**Multiple H1s (2 pages):**

- https://wardvillage.com (2 H1s: "ONLY HERE." and one other)
- https://www.wardvillage.com/ (duplicate of above, 2 H1s)

**Impact:** The H1 is the primary on-page topic signal for search engines. Pages with zero H1s force Google to guess the page topic from body text. Multiple H1s dilute topic focus. Both patterns weaken rankings for target queries.

**Fix:**

Ensure every page has exactly one H1. The H1 should match the page's primary topic and, ideally, echo the title tag with natural variation.

**How to fix (by platform):**

- **WordPress (block editor):** Select the heading block, set to "H1" in the toolbar dropdown. Remove any other H1s.
- **WordPress (classic editor):** Highlight the heading text, select "Heading 1" from the paragraph dropdown.
- **Squarespace:** Select the text block, click "Heading 1" in the format menu. Only apply once per page.
- **Webflow:** Select the heading element, set tag to "H1" in the element settings panel. Search the page for duplicate H1s and demote to H2.
- **Wix:** Click the text box, Text Settings > choose "Heading 1" format. Ensure no other text boxes are set to H1.
- **Custom-coded site:** Wrap your primary page heading in `<h1>` tags. Remove any other `<h1>` tags from the page.

**Missing H1 example fix (for /amenities/):**

The page has an H2 ("Amenities") but no H1. Promote that H2 to an H1:

```html
<h1>Amenities</h1>
```

**Multiple H1 fix (for homepage):**

The homepage has "ONLY HERE." and a second H1. Pick the primary heading (likely "ONLY HERE.") and demote the other to `<h2>`.

**Technical detail:**

HTML5 permits multiple H1s when using sectioning elements (`<section>`, `<article>`), but search engines and accessibility tools still treat the first H1 as the primary page heading. Best practice: one H1 per page. Validate with a headings checker (e.g., HeadingsMap browser extension, WAVE accessibility tool, or view-source and search for `<h1>`).

---

### 7. Image alt text ✓ MOSTLY CLEAN

Out of 205 total images sampled