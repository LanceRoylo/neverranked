# Technical Audit — Max's Sports Bar

**Auditor:** Never Ranked
**Sample date:** 2026-05-07
**Pages sampled:** 10 representative pages across homepage, about, contact, menu, events, league pages

---

## Summary

Max's Sports Bar has strong social media markup and a clean Open Graph implementation across all 10 pages. But the technical SEO foundation has critical gaps that prevent Google and AI engines from understanding the business entity, its authority signals, and page relationships. Zero pages have canonical tags, and 9 of 10 have title tags under 30 characters (too short to capture keyword intent). Only the homepage carries any schema (LocalBusiness), and critical types like Organization, WebSite, and BreadcrumbList are missing entirely.

**Overall grade: D+** (social signals are solid, but search engines are flying blind without canonicals, schema, or proper meta infrastructure)

---

## Findings

### 1. Canonical tags missing on 100% of sampled pages ⚠ HIGH PRIORITY

All 10 pages lack canonical tags. This tells Google nothing about which URL is authoritative if query parameters, trailing slashes, or http/https variants exist. Without canonicals, link equity fragments across duplicate URLs, and AI engines can't confidently cite a single source of truth.

**Impact:** Duplicate content risk, diluted authority signals, and unreliable indexing. Google may choose the wrong version of a page or split ranking power across variants.

**Fix:** Add a self-referencing canonical to every page in the `<head>`:

```html
<link rel="canonical" href="https://maxssportsbar.com/about-us" />
```

Use absolute URLs. Implement at the template level so every page inherits it automatically.

---

### 2. No Organization schema detected (entity recognition gap) ⚠ HIGH PRIORITY

The homepage has LocalBusiness schema, but no Organization schema appears anywhere. Google's Knowledge Graph needs Organization markup to link the business name, logo, social profiles, and contact info into a single entity. Without it, Max's Sports Bar is less likely to appear in branded answer boxes or local pack rich results.

**Impact:** Weak entity signal. AI engines like ChatGPT and Perplexity prefer named entities with structured org data. Missing this means fewer citations and no brand panel in search.

**Fix:** Add Organization schema to the homepage (and ideally site-wide in the header):

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Max's Sports Bar",
  "url": "https://maxssportsbar.com",
  "logo": "https://maxssportsbar.com/logo.png",
  "sameAs": [
    "https://www.facebook.com/maxssportsbar",
    "https://www.instagram.com/maxssportsbar"
  ],
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Your Street Address",
    "addressLocality": "Memphis",
    "addressRegion": "TN",
    "postalCode": "38103",
    "addressCountry": "US"
  },
  "telephone": "+1-901-XXX-XXXX"
}
```

---

### 3. Title tags under 30 characters on 9 of 10 pages ⚠ HIGH PRIORITY

9 pages have title tags shorter than 30 characters. "About Us" (8 characters), "Contact" (7 characters), "Drinks" (6 characters), "Events" (6 characters), "Cubs" (4 characters), and "Food Menu" (9 characters) all waste the single most important on-page ranking signal. These titles provide no keyword context, no location modifier, and no click incentive.

| Page | Title | Length | Issue |
|---|---|---|---|
| /about-us | About Us | 8 | Generic, no location or differentiator |
| /contact | Contact | 7 | No CTA or location |
| /drinks | Drinks | 6 | No keyword or location |
| /events | Events | 6 | No description of what events |
| /cubs | Cubs | 4 | No context (Cubs bar? Cubs fans?) |
| /food-menu | Food Menu | 9 | No keyword or cuisine type |
| /cornhole-about | Cornhole About | 14 | Awkward phrasing |
| /crawfish-information | Crawfish Information | 20 | Generic |
| /nfl-pickem-rules-1 | NFL Pick'em Rules | 22 | Good length, but could add location |

**Impact:** Lost ranking opportunities for long-tail queries like "sports bar with cornhole Memphis" or "crawfish boil downtown Memphis." Titles are the strongest on-page signal. These read like default placeholders.

**Fix:** Rewrite every title to 40-60 characters, including primary keyword and location. Examples:

- `/about-us` → "About Max's Sports Bar | Memphis Downtown Sports Pub Since 2007"
- `/drinks` → "Draft Beer & Cocktails | Max's Sports Bar Memphis"
- `/events` → "Weekly Events & Crawfish Saturdays | Max's Sports Bar"
- `/food-menu` → "Bar Food Menu | Wings, Burgers & Apps at Max's Memphis"
- `/cubs` → "Chicago Cubs Bar in Memphis | Max's Sports Bar"

---

### 4. Missing WebSite, BreadcrumbList, and AggregateRating schema ⚠ MEDIUM PRIORITY

No WebSite schema means the site search box rich result is disabled. No BreadcrumbList schema means Google won't show breadcrumb trails in SERPs. No AggregateRating schema means AI engines have no social proof hook to cite when recommending Max's.

**Impact:** Lost SERP real estate (breadcrumbs, site search box) and no structured review signal. Competitors with star ratings and breadcrumbs will occupy more visual space and earn higher CTR.

**Fix:** Add WebSite schema to the homepage for site search:

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "url": "https://maxssportsbar.com",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://maxssportsbar.com/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

Add BreadcrumbList to every non-homepage page:

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://maxssportsbar.com" },
    { "@type": "ListItem", "position": 2, "name": "Events", "item": "https://maxssportsbar.com/events" }
  ]
}
```

If Max's has Google or Yelp reviews, add AggregateRating inside the LocalBusiness schema on the homepage.

---

### 5. Weak external link profile (1.8 links per page average) ⚠ MEDIUM PRIORITY

Pages average 1.8 external links. Most link only to social profiles. Google's Quality Rater Guidelines reward pages that cite authoritative external sources. AI engines (Perplexity, ChatGPT, SearchGPT) treat outbound links as trust signals and are more likely to cite pages that themselves cite credible sources.

**Impact:** Weak AEO authority signal. Pages with 3-5 contextual outbound links to trusted domains rank better and get cited more often by AI.

**Fix:** Add 2-3 contextual external links per page to relevant authorities. Examples:

- On `/cornhole-about`, link to the American Cornhole League rulebook.
- On `/crawfish-information`, link to Louisiana crawfish season or a seafood sourcing guide.
- On `/cubs`, link to Cubs.com or the Cubs' playoff history on MLB.com.

Use natural anchor text. Open in new tabs (`target="_blank" rel="noopener"`).

---

### 6. H1 structure — ⚠ ISSUES

8 pages have one H1 (correct). 2 pages have no H1 at all: `/food-menu` and `/nfl-pickem-rules-1`. One page (`/crawfish-information`) has an empty H1 (`<h1></h1>`).

**Impact:** Missing or empty H1s confuse crawlers about page topic. H1 is the second-strongest on-page signal after title tag.

**Fix:** 

- `/food-menu`: Add `<h1>Food Menu | Bar Bites & Comfort Food</h1>`
- `/nfl-pickem-rules-1`: Add `<h1>NFL Pick'em League Rules</h1>`
- `/crawfish-information`: Populate the empty H1 with `<h1>Crawfish Saturdays at Max's</h1>`

Every page needs exactly one H1, placed above the fold.

---

### 7. Image alt text — ⚠ ISSUES

10 of 21 images are missing alt text (48% coverage). Pages most affected:

| Page | Images | Missing alt |
|---|---|---|
| /about-us | 4 | 3 |
| /drinks | 5 | 4 |
| /cornhole-about | 2 | 1 |
| /crawfish-information | 2 | 1 |
| /cubs | 2 | 1 |

**Impact:** Lost image search traffic and accessibility violations. Google Images is a meaningful discovery channel for local businesses. Missing alt text also weakens topical relevance signals.

**Fix:** Add descriptive alt text to every image. Avoid "image of" or "photo of." Examples:

- `alt="Max's Sports Bar exterior with outdoor patio seating in downtown Memphis"`
- `alt="Draft beer taps featuring local and craft brews"`
- `alt="Cornhole boards on outdoor patio at Max's Sports Bar"`

---

### 8. Word counts — MOSTLY THIN

8 of 10 pages have under 300 words (thin content). The homepage has 232 words. Several key pages fall below 200.

| Page | Word count | Status |
|---|---|---|
| https://maxssportsbar.com | 232 | Thin |
| https://maxssportsbar.com/about-us | 355 | ✓ |
| https://maxssportsbar.com/contact | 210 | Thin |
| https://maxssportsbar.com/cornhole-about | 1458 | ✓ |
| https://maxssportsbar.com/crawfish-information | 165 | Thin |
| https://maxssportsbar.com/cubs | 143 | Thin |
| https://maxssportsbar.com/drinks | 247 | Thin |
| https://maxssportsbar.com/events | 118 | Thin |
| https://maxssportsbar.com/food-menu | 108 | Thin |
| https://maxssportsbar.com/nfl-pickem-rules-1 | 128 | Thin |

**Impact:** Thin pages rank poorly for informational queries and provide little for AI engines to extract or cite. Google prefers pages that answer follow-up questions.

**Fix:** Expand key pages to 400-600 words by adding FAQ sections, event history, or feature descriptions. For example:

- `/events`: Add past event photos, testimonials, and a calendar of upcoming themes.
- `/drinks`: Describe signature cocktails, happy hour specials, and tap rotation schedule.
- `/cubs`: Add history of Max's as a Cubs fan destination, game-day specials, and Cubs playoff watch party info.

Use natural language. Break up text with H2 subheadings and lists.

---

## Priority list (technical)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Add canonical tags to all pages | HIGH | LOW |
| 2 | Rewrite 9 title tags (40-60 characters, keyword + location) | HIGH | LOW |
| 3 | Add Organization schema to homepage | HIGH | LOW |
| 4 | Fix 2 missing H1s and 1 empty H1 | HIGH | LOW |
| 5 | Add alt text to 10 images | MEDIUM | LOW |
| 6 | Add WebSite and BreadcrumbList schema | MEDIUM | MEDIUM |
| 7 | Expand 8 thin pages to 400+ words | MEDIUM | HIGH |
| 8 | Add 2-3 contextual external links per page | LOW | MEDIUM |

---

## Raw data captured

The following files are in `raw/` for auditor reference:

- `home.html` — homepage HTML
- `about-us.html` — about page
- `contact.html` — contact page
- `cornhole-about.html` — cornhole league page
- `crawfish-information.html` — crawfish event page
- `cubs.html` — Cubs fan page
- `drinks.html` — drinks menu page
- `events.html` — events calendar page
- `food-menu.html` — food menu page
- `nfl-pickem-rules-1.html` — NFL pick'em rules page
- `robots.txt` — robots directives
- `sitemap.xml` — URL inventory

Technical extraction ran via `scripts/run-audit.py` — see `raw/intake-report.json` for the full per-page signal data.