```markdown
# Technical Audit — Central Pacific Bank

**Auditor:** Never Ranked
**Sample date:** 2026-05-08
**Pages sampled:** 1 representative page (homepage)

---

## Summary

Central Pacific Bank's homepage has strong content depth (1,614 words) and a good title tag, but the technical SEO foundation is completely missing. No structured data of any kind, no social preview tags, no canonical tag, no meta description, and 8 competing H1 tags. This is a clean-slate scenario. The site is invisible to AI engines and presenting broken previews when shared on social platforms or cited by LLMs.

**Overall grade: D** (Strong content undermined by absent foundational markup across every category we sampled.)

---

## Findings

### 1. Add Organization schema so AI engines know who you are ⚠ HIGH PRIORITY

The homepage (and we assume the entire site) has zero structured data. No Organization schema means Google, ChatGPT, Perplexity, and Gemini have no machine-readable way to understand that Central Pacific Bank is a financial institution, where you're located, what services you offer, or how to contact you. When someone asks an AI "what banks serve Hawaii" or "tell me about Central Pacific Bank," the engine has nothing to cite.

**Impact:** Without Organization schema, you don't exist as a known entity in Google's Knowledge Graph or in AI training corpora. You're invisible in zero-click answer boxes, AI citations, and local pack results. Competitors with this markup will be cited instead.

**Fix:** We will deploy Organization schema via the NeverRanked snippet. This is handled on our side. The schema will include your legal name, logo, contact info, founding date, service area, and same-as links (LinkedIn, Wikipedia, etc.). Once live, validate at https://search.google.com/test/rich-results.

**Technical detail:** We'll emit a JSON-LD block with `@type: Organization` (and likely `@type: BankOrFinancialInstitution` from the Financial Services extension). Properties: `name`, `url`, `logo`, `contactPoint`, `address`, `sameAs`, `foundingDate`. This is the single highest-leverage schema type for entity recognition.

---

### 2. Add social preview cards (Open Graph and Twitter Card tags) ⚠ HIGH PRIORITY

Right now when your homepage is shared on LinkedIn, Slack, or X, or when ChatGPT references your site in a response, the preview is blank. No image, no description. Just a bare URL. With Open Graph and Twitter Card tags in place, every share shows a branded image, your tagline, and a proper title.

**Impact:** Broken social previews cost you click-through on every share. AI engines that cite URLs (Perplexity, SearchGPT) also pull og:image and og:description to build their answer cards. Missing these tags means you show up as a ghost citation.

**Fix (by platform):**

- **WordPress (Yoast or Rank Math):** Settings → Social → enable Open Graph → upload a default image (1200×630 px recommended) → paste your meta description into the default description field.
- **Squarespace:** Settings → Marketing → SEO → Social Sharing → upload an image and add a description.
- **Webflow:** Page Settings → Open Graph → upload image, add title and description.
- **Wix:** SEO Tools → Social Share → upload image and add description.
- **Custom-coded:** Paste this block in your `<head>` section on every page:

```html
<meta property="og:title" content="Central Pacific Bank - We Got You!" />
<meta property="og:description" content="Hawaii's bank for life. Personal banking, business banking, loans, and mortgages." />
<meta property="og:image" content="https://www.cpb.bank/images/og-image.jpg" />
<meta property="og:url" content="https://www.cpb.bank" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://www.cpb.bank/images/og-image.jpg" />
```

Replace the `og:description` content with a 120-character summary of the page. Upload a 1200×630 px image to your server and use that URL for `og:image` and `twitter:image`.

**Technical detail:** `og:title`, `og:description`, `og:image`, `og:url`, `og:type` are the core Open Graph properties. `twitter:card` and `twitter:image` handle X (formerly Twitter). Validate at https://www.opengraph.xyz/ and https://cards-dev.twitter.com/validator.

---

### 3. Add canonical tags so Google knows which version of each page is the real one ⚠ HIGH PRIORITY

The homepage has no canonical tag. That means if your site is accessible at both `https://www.cpb.bank` and `https://cpb.bank` (with and without `www`), or if internal links sometimes append a trailing slash and sometimes don't, Google sees multiple URLs with identical content and has to guess which one to index. This splits your ranking signal across duplicates.

**Impact:** Missing canonicals fragment your authority. If Google indexes the wrong version, internal links pointing to the canonical version pass no PageRank. You also risk duplicate-content filtering in competitive SERPs.

**Fix (by platform):**

- **WordPress (Yoast or Rank Math):** Canonical tags are auto-generated by default. Check Settings → Permalinks and confirm one consistent structure (e.g., trailing slashes on or off). Yoast adds the canonical automatically.
- **Squarespace:** Canonical tags are auto-generated. No action needed unless you have duplicate parameter URLs.
- **Webflow:** Canonical tags are auto-generated. Check your site settings to confirm the primary domain (www vs non-www).
- **Wix:** Canonical tags are auto-generated. Confirm your primary domain in Site Settings.
- **Custom-coded:** Add this line in the `<head>` of every page, replacing the `href` with the true canonical URL for that page:

```html
<link rel="canonical" href="https://www.cpb.bank" />
```

If you use `www`, use it everywhere. If you don't, strip it everywhere. Pick one and be consistent.

**Technical detail:** The `rel="canonical"` tag is a machine-readable hint that tells Google "if you see other URLs with this content, treat this one as the original." It's the single most important duplicate-content safeguard.

---

### 4. Write a meta description for the homepage (and every page) ⚠ MEDIUM PRIORITY

The homepage has no meta description. Google will auto-generate one from your body content, and it will be incoherent. Right now your search snippet is out of your control. A well-written meta description doesn't directly affect rankings, but it controls what shows up in search results and AI answer citations. It's your 120-character pitch to the searcher.

**Impact:** Missing meta descriptions cost you click-through rate. When Google generates a snippet from body text, it often pulls mid-sentence fragments or navigation boilerplate ("Click here to learn more about our services"). You're leaving your first impression to chance.

**Fix (by platform):**

- **WordPress (Yoast or Rank Math):** Scroll to the Yoast box below the post editor. Paste your description in the "Meta description" field (120–155 characters recommended).
- **Squarespace:** Page Settings → SEO → Description.
- **Webflow:** Page Settings → SEO Settings → Meta Description.
- **Wix:** Page menu → SEO (Google) → Meta description.
- **Custom-coded:** Add this in your `<head>`:

```html
<meta name="description" content="Hawaii's bank for life. Personal banking, business banking, home loans, and commercial lending. Locally owned since 1954." />
```

Write one unique description per page. Lead with the outcome (what the visitor gets), not the feature ("our banking services include...").

**Technical detail:** The `name="description"` meta tag. Google uses it as the default snippet unless query-specific body text is more relevant. 120–155 characters is the display cutoff. Avoid duplicate descriptions across pages.

---

### 5. Deploy WebSite schema with SearchAction so your site gets a search box in Google results ⚠ MEDIUM PRIORITY

No WebSite schema detected. This means your site is ineligible for the sitelinks search box (the inline search field that sometimes appears under your brand name in Google results). It's a small but high-authority visual signal, and it feeds site-search data to AI engines.

**Impact:** Without WebSite schema, Google won't show the sitelinks search box even if you rank #1 for your brand name. You also miss the chance to tell AI engines "this site has internal search, here's the query template."

**Fix:** We will deploy WebSite schema via the NeverRanked snippet. This is handled on our side. Once live, validate at https://search.google.com/test/rich-results.

**Technical detail:** We'll emit a JSON-LD block with `@type: WebSite` and a nested `potentialAction` of `@type: SearchAction`. The `target` property will point to your search results page with a `{search_term_string}` placeholder. Example:

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "url": "https://www.cpb.bank",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://www.cpb.bank/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

We'll confirm your search URL pattern before deploying.

---

### 6. H1 structure — ⚠ ISSUES

The homepage has 8 H1 tags. Best practice is one H1 per page (the main headline). Multiple H1s dilute the topical signal and confuse screen readers. The first H1 is "Want a bank for life? We got you." The other 7 are likely nav elements, footer headings, or widget titles that should be H2 or H3.

**Impact:** Multiple H1s are a minor ranking issue (Google has said it can handle it), but a significant accessibility and semantic clarity issue. AI engines parsing your page have to guess which headline is the main topic.

**Fix:** Audit your HTML or page builder. Change all secondary headings to H2. Reserve H1 for the single main headline. If you're on WordPress with a block theme, check your header and footer blocks. Navigation links and site titles are often mistakenly set to H1.

**How to check:** View source on your homepage (right-click → View Page Source) and search for `<h1`. Each instance should be a legitimate page headline, not a widget or nav item.

---

### 7. Image alt text — ⚠ ISSUES

34 of 56 images on the homepage are missing alt attributes. Alt text is required for accessibility (screen readers) and is a secondary ranking signal for image search. More importantly, AI engines that can't see images rely on alt text to understand visual content. If your homepage has a photo of a family buying their first home, and there's no alt text, that signal is invisible.

**Impact:** Missing alt text is an ADA compliance risk, an image SEO loss, and a missed opportunity to reinforce topical relevance. Google Images won't rank images without alt text. AI engines summarizing your page can't describe or cite your visuals.

**Fix (by platform):**

- **WordPress:** Click the image in the editor → sidebar → Alt Text field. Write a descriptive phrase (8–12 words). Not "image123.jpg" but "family signing mortgage paperwork with Central Pacific Bank loan officer."
- **Squarespace:** Click image → Edit → Advanced → Alt Text.
- **Webflow:** Select image → Settings panel → Alt Text field.
- **Wix:** Click image → Settings → Alt text.
- **Custom-coded:** Add `alt="..."` to every `<img>` tag:

```html
<img src="/images/family-home.jpg" alt="Family signing mortgage paperwork with Central Pacific Bank loan officer" />
```

Write alt text that describes the content and function. Decorative images (pure design elements) can use `alt=""` (empty, not missing).

**Coverage:**
- **Total images:** 56
- **Missing alt:** 34 (61%)
- **With alt:** 22 (39%)

Prioritize images in hero sections, product callouts, and testimonials.

---

### 8. Word counts — ✓ CLEAN

| Page | Word count | Status |
|---|---|---|
| https://www.cpb.bank | 1,614 | ✓ Strong depth |

The homepage has excellent content depth. No thin-content concerns in this sample.

---

## Priority list (technical)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Deploy Organization schema (handled by NeverRanked) | HIGH | LOW |
| 2 | Add Open Graph and Twitter Card tags | HIGH | LOW |
| 3 | Add canonical tag to homepage (and template to all pages) | HIGH | LOW |
| 4 | Write meta description for homepage (and all pages) | MEDIUM | LOW |
| 5 | Fix H1 structure (reduce from 8 to 1 per page) | MEDIUM | MEDIUM |
| 6 | Add alt text to 34 images missing it | MEDIUM | MEDIUM |
| 7 | Deploy WebSite schema with SearchAction (handled by NeverRanked) | MEDIUM | LOW |

---

## Raw data captured

The following files are in `raw/` for auditor reference:

- `home.html` — homepage HTML
- `robots.txt` — robots directives (if fetched)
- `sitemap.xml` — URL inventory (if fetched)
- `intake-report.json` — full per-page signal extraction

Technical extraction ran via `scripts/run-audit.py`. All findings above are derived from the structured output in `intake-report.json`.
```