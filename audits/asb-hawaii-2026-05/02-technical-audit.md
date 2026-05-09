```markdown
# Technical Audit: American Savings Bank

**Auditor:** Never Ranked
**Sample date:** 2026-05-08
**Pages sampled:** 10 representative pages across homepage, leadership bio, accessibility statement, ATM locator, business banking, SBA resources, common forms, and contact pages

---

## Summary

American Savings Bank has a solid technical foundation in place. Canonicals are correct on all 10 sampled pages, content depth is strong (averaging 2,400 words per page), and title tags are well-optimized on 8 of 10 pages. The critical gaps are in social sharing metadata (zero Open Graph images deployed) and structured data coverage (only 3 of 10 pages carry any schema, and the critical types for a financial institution are missing entirely). Six pages have multiple H1 tags, which dilutes topical focus. The good news: these are all high-impact, low-effort fixes.

**Overall grade: C+** (strong content foundation, weak schema and social layer, fixable in one deployment cycle)

---

## Findings

### 1. Add social preview cards to every page so your site shows up correctly when shared ⚠ HIGH PRIORITY

Right now when someone shares your site on LinkedIn, pastes a link into Slack, or references it in ChatGPT, the preview is blank. All 10 sampled pages are missing Open Graph image tags. This means you lose click-through on social channels and AI engines have no visual hook to display when citing you.

**Impact:** LinkedIn posts with images get 2.3x more engagement than text-only. AI answer engines (ChatGPT, Perplexity, Google AI Overviews) use og:image as the thumbnail when citing sources. Your competitors with Open Graph deployed get the visual real estate. You don't.

**Fix:**

Upload a branded default share image (1200x630px, PNG or JPG, under 1MB). Your logo on a solid background works. Then add these four tags to the `<head>` of every page:

**Custom-coded site (paste this in your global header template):**

```html
<meta property="og:title" content="Your page title here">
<meta property="og:description" content="Your meta description here">
<meta property="og:image" content="https://www.asbhawaii.com/images/asb-share-card.jpg">
<meta property="og:type" content="website">
```

**WordPress:**
- Install Yoast SEO or Rank Math (free)
- Go to SEO → Social → Facebook tab
- Upload your default share image
- Both plugins auto-populate og:image on every page

**Squarespace:**
- Settings → Marketing → Social Sharing
- Upload Social Sharing Logo (use your 1200x630 image)
- Enable "Show Thumbnail Image"

**Webflow:**
- Open any page in the Designer
- Click Pages panel (top left)
- Select a page → Settings gear → Open Graph Settings
- Upload image and populate fields
- Repeat for each page template, or set a global default in Project Settings → SEO tab

**Wix:**
- Go to Settings → Marketing & SEO → Social Share
- Upload Social Share Image
- Click "Apply to all pages"

**Technical detail:** Open Graph is a meta tag protocol developed by Facebook, now used by LinkedIn, Slack, WhatsApp, iMessage, ChatGPT, Perplexity, and Google AI Overviews. The four required properties are `og:title`, `og:description`, `og:image`, and `og:type`. Test your implementation at https://www.opengraph.xyz/ or in LinkedIn's Post Inspector.

---

### 2. Deploy WebSite schema with SearchAction so your site search appears in Google results ⚠ HIGH PRIORITY

Add a single block of JSON-LD to your homepage that tells Google you have an on-site search function. Right now Google has no signal that visitors can search your site directly from the SERP. With WebSite schema deployed, Google can show a search box in your brand result, letting users jump straight to "mortgage rates" or "business checking" without clicking through to your homepage first.

**Impact:** Sites with sitelinks search boxes get 10-15% more clicks on brand queries. For a bank, this is table stakes. Every major financial institution (Bank of America, Wells Fargo, Chase) has this deployed.

**Fix:**

NeverRanked's schema snippet will deploy this automatically when we ship your schema layer. No action required from your team. For reference, the code block looks like this:

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "American Savings Bank",
  "url": "https://www.asbhawaii.com",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://www.asbhawaii.com/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

Replace the `target` URL with your actual site search endpoint. Validate after deployment at https://search.google.com/test/rich-results.

**Technical detail:** WebSite schema is a top-level type defined in the schema.org vocabulary. The `potentialAction` property of type `SearchAction` signals that your site supports search and provides the query template. Google uses this to render the sitelinks search box in brand SERPs. This is a one-time deployment, placed in the `<head>` or footer of your homepage only.

---

### 3. Add BreadcrumbList schema so Google shows navigation breadcrumbs in your search results ⚠ HIGH PRIORITY

Your pages have visual breadcrumb trails (e.g., Home > Business > Business Banking Team), but none of the 10 sampled pages carry BreadcrumbList schema. That means Google can't display breadcrumbs in your search snippet. When breadcrumbs appear in the SERP, users understand page hierarchy at a glance and are more likely to click on deep pages (like "/business/sales") because they see the path.

**Impact:** Breadcrumb-enhanced snippets increase CTR by 5-8% on non-brand queries. For a 25-branch bank competing with First Hawaiian and Bank of Hawaii, every percentage point of CTR compounds across hundreds of pages.

**Fix:**

NeverRanked's schema snippet will deploy this automatically on every page with a visible breadcrumb trail. The schema snippet dynamically reads your breadcrumb HTML and outputs the corresponding JSON-LD. No manual page-by-page work required.

For reference, the code structure for a page like `/business/sales` looks like this:

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://www.asbhawaii.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Business",
      "item": "https://www.asbhawaii.com/business"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "Business Banking Team",
      "item": "https://www.asbhawaii.com/business/sales"
    }
  ]
}
```

**Technical detail:** BreadcrumbList is a schema.org type that represents a navigation path. Each `ListItem` in the `itemListElement` array must have a `position` (integer, starting at 1), a `name` (the link text), and an `item` (the URL). Google renders this in the SERP above the page title. Validate at https://search.google.com/test/rich-results.

---

### 4. Deploy FAQPage schema on your Common Questions page to trigger rich results ⚠ HIGH PRIORITY

Your `/common-questions` page is a 10,900-word FAQ resource covering personal accounts, business banking, loans, and digital services. It has 28 H3 headings, most of which are questions. Right now this page carries zero schema. If you add FAQPage markup, Google can display your answers directly in search results as expandable accordions, which dramatically increases visibility and CTR for long-tail queries like "how do I open a business checking account in Hawaii."

**Impact:** FAQPage schema makes your content eligible for rich results. When your answer appears in the expanded snippet, you own the SERP real estate. AI engines (ChatGPT, Perplexity, Google AI Overviews) also preferentially cite schema-marked FAQs because the Q&A structure is already parse-friendly.

**Fix:**

NeverRanked's schema snippet will deploy this automatically. The snippet scans for question headings and answer paragraphs, then outputs FAQPage JSON-LD. You can also manually add it if you're on a custom CMS.

For reference, the structure for one Q&A pair looks like this:

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "How do I open a business checking account?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Visit any ASB branch with your EIN, business license, and a government-issued ID. You can also start the application online at asbhawaii.com/business."
      }
    }
  ]
}
```

Repeat the `Question` object for each FAQ pair on the page. Google supports up to 50 questions per page in FAQPage schema.

**Technical detail:** FAQPage is a schema.org type designed for pages that consist exclusively or primarily of questions and answers. Each `Question` has a `name` (the question text) and an `acceptedAnswer` of type `Answer` containing the `text` (the answer, plain text or HTML). Google displays up to 2-3 questions in the SERP, with a "More questions" accordion. Validate at https://search.google.com/test/rich-results.

---

### 5. Deploy FinancialService schema on product pages to define your banking services ⚠ MEDIUM PRIORITY

Your site offers checking accounts, savings accounts, mortgages, business loans, and SBA financing, but none of the sampled pages carry FinancialService schema. This means Google and AI engines see your pages as unstructured content. With FinancialService markup, you define each product explicitly (its name, URL, description, and service type), which makes your offerings citation-ready for AI answer engines responding to queries like "best mortgage lender in Honolulu" or "Hawaii SBA 7(a) lenders."

**Impact:** AI engines (ChatGPT, Perplexity, Google AI Overviews) are increasingly pulling structured attributes from schema when constructing answers. If your competitors deploy FinancialService and you don't, they get cited with clean product names and service types. You get cited (if at all) with scraped paragraph text that may or may not surface the right details.

**Fix:**

NeverRanked's schema snippet can deploy this on your product and service pages. This requires mapping each product page to its corresponding schema type (e.g., /mortgage → FinancialService with serviceType "Mortgage Loan", /business-checking → FinancialService with serviceType "Checking Account").

For reference, the structure for a mortgage page looks like this:

```json
{
  "@context": "https://schema.org",
  "@type": "FinancialService",
  "name": "ASB Home Mortgage",
  "url": "https://www.asbhawaii.com/home-loans",
  "description": "Fixed-rate and adjustable-rate mortgages for Hawaii homebuyers, with local underwriting and no application fees.",
  "serviceType": "Mortgage Loan",
  "areaServed": {
    "@type": "State",
    "name": "Hawaii"
  },
  "provider": {
    "@type": "BankOrCreditUnion",
    "name": "American Savings Bank"
  }
}
```

**Technical detail:** FinancialService is a subtype of LocalBusiness in schema.org. The `serviceType` property should match a recognized financial service category (e.g., "Checking Account", "Savings Account", "Mortgage Loan", "Business Loan"). The `provider` property links to your Organization schema (see next finding). FinancialService is not yet widely supported for rich results in Google, but it is actively ingested by AI engines.

---

### 6. Add AggregateRating schema to your homepage and high-trust pages so AI engines have a social proof hook ⚠ MEDIUM PRIORITY

You have testimonial text on your `/common-questions` page, but none of the 10 sampled pages carry AggregateRating schema. When AI engines (ChatGPT, Perplexity, Gemini) cite banks, they preferentially surface star ratings and review counts as trust signals. Right now you have no structured rating data for them to pull.

**Impact:** A cited rating is a trust multiplier. "American Savings Bank (4.6 stars, 850 reviews)" is more clickable than "American Savings Bank." Google may also display star ratings in your local pack or knowledge panel if you deploy AggregateRating at the Organization level.

**Fix:**

If you have Google Business Profile reviews (or reviews on another platform), you can aggregate them into AggregateRating schema. Add this block to your homepage inside your existing Organization schema:

```json
{
  "@context": "https://schema.org",
  "@type": "BankOrCreditUnion",
  "name": "American Savings Bank",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.6",
    "reviewCount": "850"
  }
}
```

Replace `ratingValue` and `reviewCount` with your actual figures. Google requires that ratings be based on real reviews and that you can substantiate the numbers if challenged.

**If you're on WordPress:**
- Use Schema Pro or Rank Math Pro to add AggregateRating to your Organization schema
- Both plugins have UI fields for rating value and review count

**If you're on Squarespace, Webflow, or Wix:**
- No native support. Add the code manually via a global HTML injection in the site footer or header.

**If you don't have a review aggregation source yet:**
- Focus on accumulating Google Business Profile reviews across your 25+ branches
- Use a review aggregation tool like Podium or Birdeye to centralize ratings

**Technical detail:** AggregateRating is a schema.org type that summarizes multiple reviews into a single rating. It requires `ratingValue` (decimal, typically 1-5), `reviewCount` (integer), and optionally `bestRating` (default 5) and `worstRating` (default 1). When nested inside Organization or LocalBusiness, it represents the overall rating of the business. When nested inside Product or FinancialService, it represents the rating of that specific offering. Validate at https://search.google.com/test/rich-results.

---

### 7. H1 structure ⚠ ISSUES

Six of 10 sampled pages have multiple H1 tags, which dilutes topical focus and makes it harder for Google to identify the primary subject of the page.

| Page | H1 count | First H1 | Issue |
|---|---|---|
| https://www.asbhawaii.com/ | 2 | "NO SERVICE FEE." | Multiple H1s |
| https://www.asbhawaii.com/SBA | 3 | "Small Business Administration Resources" | Multiple H1s |
| https://www.asbhawaii.com/atm | 4 | "Easy Banking in Hawaii with Our Upgraded ATMs" | Multiple H1s |
| https://www.asbhawaii.com/business/sales | 3 | "Business Banking Team" | Multiple H1s |
| https://www.asbhawaii.com/contact-us/business-banking-contact-us | 4 | "Business Banking Contacts" | Multiple H1s |
| https://www.asbhawaii.com/about-us/meet-our-leadership/dani-aiu | 1 | "Dani Aiu" | ✓ Clean |
| https://www.asbhawaii.com/accessibility | 1 | "American Savings Bank Accessibility Statement" | ✓ Clean |
| https://www.asbhaw