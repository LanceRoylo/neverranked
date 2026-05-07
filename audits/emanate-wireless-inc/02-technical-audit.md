```markdown
# Technical Audit — Emanate Wireless, Inc.

**Auditor:** Never Ranked
**Sample date:** 2026-05-07
**Pages sampled:** 1 representative page (homepage)

---

## Summary

Emanate Wireless has a clean, fast homepage with zero foundational SEO infrastructure. No canonical tags, no schema markup of any kind, no social preview cards. The site is indexable but completely invisible to AI engines and unable to claim rich results in Google. For a B2B healthcare technology vendor with a specialized product (real-time location monitoring), this is a total missed opportunity. The product has room-level accuracy claims, differentiated engineering, and a specific buyer persona (hospital procurement, clinical engineering teams), but none of that signal is structured for retrieval.

**Overall grade: D** (indexable and crawlable, but zero entity recognition, zero social proof hooks, zero rich result eligibility)

---

## Findings

### 1. No Organization schema means Google and ChatGPT can't build an entity profile for Emanate Wireless ⚠ HIGH PRIORITY

The homepage has zero schema markup. No Organization block, no Product block, no SoftwareApplication block. When a hospital procurement director searches "real-time location system healthcare" or asks ChatGPT "who makes RTLS for hospitals," there is no structured entity for AI engines to cite. Your competitors with Organization schema will be referenced. You will not.

**Impact:** AI engines (ChatGPT, Perplexity, Google SGE) cannot build a knowledge graph node for Emanate Wireless. You are invisible in answer-engine results. Google cannot display your logo, knowledge panel, or sitelinks. For a small B2B vendor, this is the difference between "known entity" and "unknown domain."

**Fix:** We will deploy Organization schema via the NeverRanked snippet. The markup will include your legal name, logo, founding date, address, contact points, and same-as links (LinkedIn, etc.). This goes live in the next 48 hours as part of your onboarding package. No dev work required on your end.

**Technical detail:** We will add a JSON-LD block with `@type: Organization`, `name`, `url`, `logo` (requires a square logo image URL, minimum 112x112px), `address` (PostalAddress), `contactPoint` (customer support phone/email), and `sameAs` array (LinkedIn, Twitter, etc.). Validated against schema.org/Organization and Google's structured data guidelines.

---

### 2. Missing canonical tags on 100% of sampled pages ⚠ HIGH PRIORITY

Your homepage has no canonical tag. This tells Google which URL is the authoritative version when there are duplicates (http vs https, www vs non-www, trailing slash vs no slash, query parameters). Without it, Google picks for you, and that choice can fragment your ranking signals across multiple URLs.

**Impact:** If someone links to `http://emanatewireless.com` and someone else links to `https://www.emanatewireless.com`, Google may treat those as separate pages and split your authority. For a small site with limited inbound links, every link counts. Canonical tags consolidate that signal.

**Fix (choose your platform):**

- **WordPress (Yoast or Rank Math):** Canonical is auto-inserted by default. Check SEO > General > Features and confirm "Canonical URLs" is enabled.
- **Squarespace:** Canonical tags are auto-generated. No action needed unless you have custom code overriding the `<head>`.
- **Webflow:** Canonical is auto-inserted. Check Page Settings > SEO Settings and confirm no custom code is blocking it.
- **Wix:** Canonical tags are auto-generated. No manual control available.
- **Custom-coded (your case):** Add this to the `<head>` of every page:

```html
<link rel="canonical" href="https://emanatewireless.com">
```

Replace the `href` value with the preferred URL for each page. For the homepage, use `https://emanatewireless.com` (no trailing slash, HTTPS, no www). Apply the same pattern to every other page on the site.

**Technical detail:** The canonical tag is a signal, not a directive. Google can ignore it if other signals (redirects, internal links, sitemaps) conflict. Make sure your internal links, sitemap URLs, and 301 redirects all point to the same URL version you declare in the canonical tag.

---

### 3. No social preview cards (Open Graph images) ⚠ HIGH PRIORITY

When someone shares your homepage on LinkedIn, Slack, or Twitter, or when ChatGPT references your site, the preview card is blank or shows a generic placeholder. You have `og:title` and `og:description` set, but no `og:image`. That means every share looks unfinished.

**Impact:** Social shares drive referral traffic. Blank preview cards get scrolled past. Proper cards with a branded image and title get clicked. For a B2B vendor, a LinkedIn share from a customer or industry contact is high-value traffic. A blank card wastes that opportunity.

**Fix (choose your platform):**

- **WordPress (Yoast):** SEO > Social > Facebook tab > upload a default image (1200x630px recommended).
- **Squarespace:** Settings > Marketing > Social Image Sharing > upload default image.
- **Webflow:** Page Settings > Open Graph Settings > upload OG image.
- **Wix:** Marketing Tools > Social Share > upload image.
- **Custom-coded (your case):** Add this to the `<head>`:

```html
<meta property="og:image" content="https://emanatewireless.com/images/social-share.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://emanatewireless.com/images/social-share.jpg">
```

Replace `/images/social-share.jpg` with the path to your branded image. Ideal dimensions: 1200x630px. Show your logo, product, or a clean branded graphic. Avoid text-heavy images (they render poorly at thumbnail size).

**Technical detail:** Test your Open Graph tags at https://www.opengraph.xyz/ and https://cards-dev.twitter.com/validator. Facebook and LinkedIn cache aggressively, so after you add the tags, use Facebook's Sharing Debugger (https://developers.facebook.com/tools/debug/) to force a re-scrape.

---

### 4. Title tag is 16 characters (too short) ⚠ MEDIUM PRIORITY

Your homepage title is "Emanate Wireless" (16 characters). Google displays up to 60 characters in search results. You are leaving 44 characters of prime keyword real estate blank. For a specialized B2B product, the title should signal what you do and who you serve.

**Impact:** When a hospital clinical engineering director searches "RTLS healthcare real-time location system," your homepage title does not contain any of those terms. You are ranking on body content alone. A title like "Emanate Wireless | Real-Time Location Systems (RTLS) for Healthcare" would match the query and improve click-through rate.

**Fix (choose your platform):**

- **WordPress (Yoast):** Edit the homepage, scroll to Yoast SEO box below the editor, enter new title in "SEO title" field.
- **Squarespace:** Pages > hover over homepage > gear icon > SEO > Page Title.
- **Webflow:** Pages panel > Home > Settings > SEO Settings > Title Tag.
- **Wix:** Pages menu > click homepage > SEO Basics > Page Title.
- **Custom-coded (your case):** Replace the existing `<title>` tag in the `<head>`:

```html
<title>Emanate Wireless | Real-Time Location Systems (RTLS) for Healthcare</title>
```

Aim for 50-60 characters. Include your brand name, primary product category, and buyer vertical. For other pages, follow the pattern: `[Page Topic] | [Product/Service] | Emanate Wireless`.

**Technical detail:** Google rewrites titles in ~60% of results, but the original title tag still matters for ranking. Include primary keyword near the front. Avoid keyword stuffing. Use pipes or dashes as separators, not commas.

---

### 5. Homepage is 159 words (thin content) ⚠ MEDIUM PRIORITY

Your homepage body content is 159 words. Google's quality guidelines do not specify a minimum, but pages under 300 words are typically considered thin unless they serve a specific utility function (login page, contact form, etc.). For a B2B vendor homepage, 159 words is not enough to establish topical authority or answer buyer questions.

**Impact:** AI engines need content to extract facts, claims, and differentiators. With 159 words, there is not enough signal for ChatGPT or Perplexity to cite you as a source. Google can rank thin pages if they have strong backlinks, but for a small vendor with limited domain authority, content depth matters. You are leaving rankings on the table.

**Fix:** Expand the homepage to 500-800 words. Add sections that answer buyer questions:

- **What is RTLS?** (2-sentence plain-English explanation for non-technical stakeholders)
- **What makes Emanate different?** (room-level accuracy, healthcare-specific engineering, integration with nurse call systems, etc.)
- **Who uses it?** (hospital types, use cases: patient tracking, equipment monitoring, staff safety)
- **How does it work?** (high-level technical overview, no jargon in the first paragraph)

Structure this as H2 sections below the hero. Keep the existing hero messaging ("99.9% Room Level Accuracy"), but add the depth below the fold.

**Technical detail:** Word count alone does not determine quality, but it correlates with ranking ability for informational and commercial queries. For transactional pages (product pages, service pages), 300-500 words is baseline. For informational pages (guides, FAQs), 800-1500 words. For pillar content (buyer's guides, comparisons), 2000+ words.

---

### 6. H1 structure ⚠ ISSUES

The homepage has 3 H1 tags. Best practice is one H1 per page (the main headline). Multiple H1s dilute the primary topic signal and confuse Google's understanding of page hierarchy.

**Current H1s detected:**
1. "99.9% ROOM LEVEL ACCURACY"
2. (two others not captured in scan output)

**Impact:** Minor. Google's John Mueller has said multiple H1s are not a penalty, but they make it harder for Google to identify the primary topic. For a small site with limited authority, clean heading structure helps.

**Fix:** Demote the secondary H1s to H2 or H3. Keep "99.9% ROOM LEVEL ACCURACY" as the sole H1 (it is a strong, differentiated claim). If the other H1s are section headers, make them H2s.

In your HTML, find:

```html
<h1>Secondary Headline</h1>
```

Change to:

```html
<h2>Secondary Headline</h2>
```

---

### 7. Image alt text ⚠ ISSUES

8 of 12 images on the homepage are missing alt text. Alt text is a text description of an image, used by screen readers (accessibility) and by Google to understand image content.

**Impact:** Accessibility compliance (WCAG 2.1 Level A requires alt text on all meaningful images). Image SEO (Google Images is a meaningful traffic source for B2B sites when buyers search "RTLS system diagram" or "hospital asset tracking device"). AI engines (ChatGPT and Perplexity can cite images with good alt text when answering visual queries).

**Fix (choose your platform):**

- **WordPress:** Edit the page, click the image block, enter alt text in the "Alt text" field in the right sidebar.
- **Squarespace:** Edit the page, click the image, click "Edit" > "Alt text" field.
- **Webflow:** Click the image, Settings panel > Alt text field.
- **Wix:** Click the image, Settings > Alt text.
- **Custom-coded (your case):** Find each `<img>` tag and add the `alt` attribute:

```html
<img src="/images/rtls-device.jpg" alt="Emanate Wireless RTLS badge with room-level accuracy sensor">
```

Write descriptive alt text (10-15 words). Describe what the image shows and why it is relevant to the page topic. Avoid "image of" or "picture of" (screen readers already announce "image"). Avoid keyword stuffing. Decorative images (dividers, spacers) should have empty alt (`alt=""`) so screen readers skip them.

**Technical detail:** Google uses alt text as a ranking factor for image search and as a fallback text signal when images fail to load. For product images, include the product name and key feature. For diagrams, describe the process shown. For team photos, name the people if relevant.

---

### 8. Word counts

| Page | Word count | Status |
|---|---|---|
| https://emanatewireless.com | 159 | ⚠ thin (under 300 words) |

---

## Priority list (technical)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Add Organization schema (NeverRanked deploys) | HIGH | LOW (NR ships it) |
| 2 | Add canonical tags to all pages | HIGH | LOW (1 line of code per page) |
| 3 | Add Open Graph image tags | HIGH | LOW (create 1200x630 image, paste 6 lines of code) |
| 4 | Expand homepage to 500-800 words | MEDIUM | MEDIUM (content writing) |
| 5 | Rewrite homepage title tag (50-60 characters) | MEDIUM | LOW (1 line of code) |
| 6 | Add alt text to 8 images | MEDIUM | LOW (15 minutes) |
| 7 | Fix multiple H1s (demote 2 to H2) | LOW | LOW (change 2 HTML tags) |

---

## Raw data captured

The following files are in `raw/` for auditor reference:

- `home.html` — homepage HTML
- `intake-report.json` — full per-page signal data

Technical extraction ran via `scripts/run-audit.py` — see `raw/intake-report.json` for the full per-page signal data.
```