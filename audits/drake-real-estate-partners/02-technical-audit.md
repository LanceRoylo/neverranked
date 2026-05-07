# Technical Audit — Drake Real Estate Partners

**Auditor:** Never Ranked
**Sample date:** 2026-05-07
**Pages sampled:** 1 page (homepage)

---

## Summary

Drake Real Estate Partners' homepage is missing every core technical SEO signal. No structured data exists to tell Google (or ChatGPT) what the company is or what it does. No canonical tags exist to prevent duplicate-content dilution. No social preview cards exist, so every LinkedIn share and AI citation arrives blank. The page has 4 words of body text, no H1, and no image descriptions. This is not a weak foundation. This is no foundation.

**Overall grade: F** (Zero structured data, zero heading structure, four words of content, and missing every machine-readable signal that powers entity recognition and AEO visibility.)

---

## Findings

### 1. Add Organization schema so Google and AI engines know who you are ⚠ HIGH PRIORITY

Drake Real Estate Partners has no Organization schema on the homepage. This is the single most important piece of structured data (machine-readable metadata that helps search engines and AI understand what a page is about) for any company. Without it, Google cannot build a Knowledge Panel. ChatGPT cannot cite your firm with confidence when a prospect asks "who are the top real estate investment firms in New York?" Perplexity has no entity to reference. You are invisible to the systems that answer buyer questions before they ever click a link.

**Impact:** Organization schema is the root of your entity graph. It connects your name, logo, location, and social profiles into a single machine-readable object. Every other schema type (Service, FAQPage, BreadcrumbList) builds on top of this. Without it, your firm is just text on a page. With it, you are a recognized entity that AI can cite by name.

**Fix:**

We will deploy Organization schema for you via the NeverRanked snippet. No action required on your end. This will include your firm name, logo, founding date, address, contact info, and social profiles. Once live, you can validate it at [Google's Rich Results Test](https://search.google.com/test/rich-results).

**Technical detail:** We will inject a JSON-LD block with `@type: Organization`, `name`, `logo`, `url`, `address` (PostalAddress), `contactPoint`, `sameAs` (LinkedIn, if available), and `foundingDate`. This appears in the `<head>` and is invisible to users but immediately parseable by crawlers.

---

### 2. Add social preview cards so shares on LinkedIn and AI citations show your brand ⚠ HIGH PRIORITY

Your homepage is missing `og:image` and `twitter:image` tags. Right now when someone shares drakerep.com on LinkedIn, Slack, or Twitter, the preview is blank. No logo, no hero image, just a text link. When ChatGPT or Perplexity references your site, they have no thumbnail to pull. This makes every share look unfinished and every citation less credible.

**Impact:** Open Graph tags control how your pages render when shared on social platforms or cited by AI engines. A missing `og:image` means lost click-through on every share. For a B2B firm where LinkedIn is the primary discovery channel, this is leaving credibility on the table with every post.

**Fix:**

You need to add two meta tags to the `<head>` of every page. The image should be 1200×630 pixels, hosted on your domain, and show your logo or a branded hero graphic.

**How to add it:**

- **WordPress (Yoast or Rank Math):** Settings → Social → Upload default Open Graph image. Set it once, applies to all pages unless overridden.
- **Squarespace:** Settings → Marketing → SEO → Social Sharing → Upload default image.
- **Webflow:** Page Settings → Open Graph Image → Upload image (set per page or use dynamic CMS field).
- **Wix:** SEO Tools → Social Share → Upload default image.
- **Custom-coded site:** Add this to your `<head>` section:

```html
<meta property="og:image" content="https://drakerep.com/images/social-preview.jpg">
<meta name="twitter:image" content="https://drakerep.com/images/social-preview.jpg">
```

**Technical detail:** The `og:image` property must be an absolute URL (not relative). Minimum size 200×200, recommended 1200×630. Twitter will fall back to `og:image` if `twitter:image` is missing, but best practice is to set both. Validate with [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) and [Twitter Card Validator](https://cards-dev.twitter.com/validator).

---

### 3. Set canonical tags to tell Google which version of each page to index ⚠ HIGH PRIORITY

Your homepage has no canonical tag. A canonical tag is a single line of code that tells Google "this is the authoritative URL for this content." Without it, Google may index both `https://drakerep.com` and `https://drakerep.com/` (with trailing slash), or HTTP and HTTPS variants, splitting your ranking signals across multiple URLs. This is called duplicate-content dilution, and it weakens every page.

**Impact:** Every page should declare itself as the canonical version, even if you only have one URL. This prevents future dilution if you launch alternate versions (print views, tracking parameters, regional variants). It is also a trust signal. Sites without canonicals look unfinished to crawlers.

**Fix:**

Add a self-referencing canonical tag to every page. For the homepage, it should point to `https://drakerep.com`.

**How to add it:**

- **WordPress (Yoast or Rank Math):** Enabled by default. Check Settings → Advanced → Enable canonical tags. If already on, no action needed.
- **Squarespace:** Automatically added to all pages. If missing, you may be on an older template. Upgrade or contact support.
- **Webflow:** Automatically added to all published pages. No action needed unless you are using custom code embeds that override the `<head>`.
- **Wix:** Automatically added. If missing, contact Wix support (this indicates a platform bug).
- **Custom-coded site:** Add this to the `<head>` of every page:

```html
<link rel="canonical" href="https://drakerep.com">
```

Change the `href` to match the current page's URL. Do not use relative paths. Always use the full `https://` URL.

**Technical detail:** The canonical tag appears once per page, in the `<head>`. It should always be absolute (include protocol and domain). If a page has multiple URLs (due to parameters, session IDs, or tracking codes), all variants should point to the same canonical. Validate with "View Page Source" and search for `rel="canonical"`.

---

### 4. Write a real homepage with at least 300 words of body content ⚠ HIGH PRIORITY

Your homepage has 4 words of body text. Google's algorithms and every major LLM use word count as a proxy for substance. A page with 4 words cannot rank for competitive queries. It cannot be cited by ChatGPT. It tells the crawler "this page has nothing to say."

**Impact:** Thin content (under 300 words) is filtered out of AEO consideration. When a prospect asks an AI engine "what does Drake Real Estate Partners do?" the model has no text to pull from. You are invisible by default. A homepage for a financial services firm should have 500 to 800 words describing your investment thesis, your markets, your track record, and your differentiation. Right now you have none of that.

**Fix:**

Rewrite the homepage to include:

- A 2-sentence value proposition above the fold (what you do, who you serve, what makes you different)
- A 200-word "About" section (founding story, investment strategy, markets you target)
- A 150-word "Approach" or "Services" section (value-add vs. opportunistic, asset classes, hold periods)
- A 100-word "Team" or "Track Record" section (years in business, notable deals, AUM if you disclose it)
- Internal links to portfolio pages, team bios, and contact (this boosts crawl depth and distributes authority)

**Technical detail:** Word count is measured by visible body text, excluding navigation, footer, and hidden elements. Google's Quality Rater Guidelines explicitly flag thin content as low-quality. For B2B service pages, 500 to 1,500 words is standard. For SaaS or technical products, 800 to 2,000 words is common. For homepage, 500 to 800 words is the floor. Use `<p>` tags for body text, not `<div>` or image-based text (which is invisible to crawlers).

---

### 5. Add an H1 to every page to define the topic ⚠ MEDIUM PRIORITY

Your homepage has no H1 tag. The H1 is the single most important on-page signal for topic modeling. It tells Google (and every LLM crawler) what the page is about. Without it, the crawler has to guess. Guessing is bad for rankings.

**Impact:** Pages without H1s rank lower for competitive queries. AI engines have no headline to cite when summarizing your page. Google's algorithm uses the H1 as the primary semantic anchor for the rest of the content. A missing H1 is a missing topic declaration.

**Fix:**

Add one H1 to the homepage. It should be the first heading on the page, above the fold, and it should contain your primary keyword. For Drake Real Estate Partners, a strong H1 would be:

- "Value-Add Real Estate Investment Across U.S. Markets"
- "Opportunistic Real Estate Investment Firm | New York"
- "Drake Real Estate Partners: Multifamily and Commercial Investment"

**How to add it:**

- **WordPress:** Edit the page, select the title block, and change the format dropdown from "Paragraph" to "Heading 1."
- **Squarespace:** Edit the page, click the text block, and use the formatting dropdown to select "Heading 1."
- **Webflow:** Select the text element, open the style panel, and change the tag to `<h1>`.
- **Wix:** Highlight the text, click the formatting icon, and choose "Heading 1."
- **Custom-coded site:** Wrap your main headline in `<h1>` tags:

```html
<h1>Value-Add Real Estate Investment Across U.S. Markets</h1>
```

**Technical detail:** Use exactly one H1 per page. It should appear before the first H2. Do not use H1 for design purposes (navigation, footers, sidebars). Reserve it for the page's main topic. Validate by inspecting the page source and searching for `<h1>`. If you see zero or multiple H1s, fix it.

---

### 6. Image alt text — ⚠ ISSUES

Your homepage has 1 image, and it has no alt text. Alt text is the fallback description that appears when an image fails to load, and it is the only way screen readers and crawlers understand what an image depicts. Without it, Google Image Search cannot index the image. AI engines cannot describe it. Accessibility tools cannot parse it.

**Impact:** Missing alt text is both an SEO gap and an accessibility violation. For a B2B firm where trust and professionalism matter, this signals sloppiness. It also means your images will never appear in Google Image Search results, which is a lost discovery channel.

**Fix:**

Add descriptive alt text to every image. For logos, use `alt="Drake Real Estate Partners logo"`. For photos of properties, use `alt="Renovated multifamily building in Brooklyn, portfolio of Drake Real Estate Partners"`. Be specific. Do not keyword-stuff.

**How to add it:**

- **WordPress:** Click the image, open the "Block" settings panel on the right, and fill in the "Alt text" field.
- **Squarespace:** Click the image, click "Edit," and fill in the "Alt text" field under "Image options."
- **Webflow:** Select the image, open the settings panel, and fill in the "Alt text" field.
- **Wix:** Click the image, click "Settings," and fill in the "Alt text" field.
- **Custom-coded site:** Add the `alt` attribute to every `<img>` tag:

```html
<img src="logo.png" alt="Drake Real Estate Partners logo">
```

**Technical detail:** Alt text should be descriptive but concise (under 125 characters). Do not use "image of" or "picture of" (screen readers already announce "image"). Do not leave it blank unless the image is purely decorative (in which case use `alt=""`). Validate by right-clicking any image and selecting "Inspect" to see if the `alt` attribute is present.

---

### 7. Word counts — ⚠ THIN CONTENT

| Page | Word count | Status |
|---|---|---|
| https://drakerep.com | 4 | ⚠ Thin (under 300 words) |

The homepage has 4 words of body content. This is not a page. This is a placeholder. Google and AI engines will not rank or cite content this thin. See Finding #4 for the fix.

---

## Priority list (technical)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Deploy Organization schema (NR ships this) | HIGH | LOW |
| 2 | Add og:image and twitter:image tags | HIGH | LOW |
| 3 | Add canonical tag to homepage | HIGH | LOW |
| 4 | Rewrite homepage to 500+ words with real content | HIGH | MED |
| 5 | Add H1 to homepage | MED | LOW |
| 6 | Add alt text to homepage image | MED | LOW |

---

## Raw data captured

The following files are in `raw/` for auditor reference:

- `home.html` — homepage HTML
- `robots.txt` — robots directives (if present)
- `sitemap.xml` — URL inventory (if present)
- `intake-report.json` — full per-page technical signal data

Technical extraction ran via `scripts/run-audit.py`. See `raw/intake-report.json` for the complete machine-readable scan output.