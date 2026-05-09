# Schema Review: American Savings Bank

**Auditor:** Never Ranked
**Sample date:** 2026-05-08
**Focus:** JSON-LD structured data coverage, consistency, and AEO optimization

---

## Summary

American Savings Bank has minimal schema coverage. Only 3 of 10 sampled pages carry any structured data. The two homepage variants carry basic Organization markup, and one leadership bio page has Person schema. Critical markup for search features (WebSite, BreadcrumbList, FAQPage) is completely absent. When AI engines search for Hawaii banking information or Google assembles rich results for "American Savings Bank," they have almost nothing to work with. Competitors with fuller schema coverage will consistently outrank ASB in zero-click answers and AI citations.

**Schema grade: D** (Basic Organization markup present, but missing every schema type that drives rich results and AI visibility.)

---

## What exists today

| Page type | FAQPage | Organization | BreadcrumbList | WebSite | Person | FinancialService | AggregateRating |
|---|---|---|---|---|---|---|---|
| Homepage | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| SBA resource page | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Leadership bio (Dani Aiu) | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Accessibility page | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| ATM page | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Common Questions page | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

---

## Findings

### 1. Tell Google and AI engines what your site does so they can show a search box in your search results ⚠ HIGH

Right now, when someone searches "American Savings Bank" on Google, your result appears as a plain blue link. With WebSite schema and a SearchAction property, Google can display a search box directly in the result, letting customers jump straight to checking rates or finding a branch. More importantly, when ChatGPT or Perplexity is asked "Can I search American Savings Bank's site for mortgage rates?", they have no structured signal that your site offers search. This schema also anchors your brand identity for AI engines. It is the foundation that other schemas reference.

**Where to add it:**

We will deploy this via the NeverRanked schema snippet. No manual work required. This schema will appear in the site-wide `<head>` on every page.

**Technical detail (WebSite schema with SearchAction):**

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://www.asbhawaii.com/#website",
  "url": "https://www.asbhawaii.com",
  "name": "American Savings Bank Hawaii",
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://www.asbhawaii.com/search?q={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
}
```

**Why this structure:** The `@id` property creates a unique identifier for your site that other schemas can reference (using `isPartOf`). The `potentialAction` SearchAction tells Google your site has a search function. Update the `urlTemplate` to match your actual search URL pattern. If your site does not have search, remove the `potentialAction` block entirely and keep only the WebSite declaration.

---

### 2. Show breadcrumb trails in search results so customers know where they will land ⚠ HIGH

When your ATM page or Business Banking page appears in search results, Google has no way to show the breadcrumb path (Home > Business > Team). Breadcrumbs in search results increase click-through rate by 20 to 30 percent because users see context before they click. Right now, 10 of 10 sampled pages are missing BreadcrumbList schema. Every non-homepage URL should carry it. AI engines also use breadcrumbs to understand your site structure. When Perplexity is asked "Does American Savings Bank have business banking?", it cannot infer from your navigation hierarchy because the hierarchy is not machine-readable.

**Where to add it:**

We will deploy this via the NeverRanked schema snippet. No manual work required. BreadcrumbList will be dynamically generated based on URL path for every non-homepage page.

**Technical detail (BreadcrumbList schema):**

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

**Why this structure:** Each `ListItem` represents one breadcrumb level. The `position` property must increment sequentially. The final item in the list should be the current page. Google requires `name` and `item` on every ListItem. This example shows the breadcrumb path for the Business Banking Team page. The NeverRanked snippet will generate the correct path automatically for each page based on URL segments and page titles.

---

### 3. Mark up your Common Questions page so Google shows expandable FAQ answers in search results ⚠ HIGH

Your Common Questions page (https://www.asbhawaii.com/common-questions) has 28 H3 headings and over 10,000 words of Q&A content. This is a perfect candidate for FAQPage schema. Right now, when someone searches "Can I open a business account at American Savings Bank online?", Google shows a plain snippet. With FAQPage markup, Google can display your answer directly in the search result as an expandable rich result. AI engines also treat FAQ schema as high-trust source material. When ChatGPT is asked a banking question, it preferentially cites sites with structured FAQ markup because the question-answer pairs are explicitly labeled.

**How to add it:**

- **WordPress** (with Yoast or Rank Math): These plugins have built-in FAQ blocks. In the block editor, add an "FAQ" block and paste each question and answer. The plugin will auto-generate the schema. Alternatively, use the code block below and paste it into a Custom HTML block at the top of the page, or add via the Yoast schema editor under "Advanced."
- **Squarespace**: No native FAQ schema support. Add a Code Block to the page and paste the JSON-LD block below.
- **Webflow**: Add an Embed element to the page and paste the JSON-LD block below.
- **Wix**: Use the Wix SEO Wiz or add an HTML iframe element with the JSON-LD block.
- **Custom-coded**: Paste the JSON-LD block below into the `<head>` or at the end of the `<body>` of the Common Questions page template.

**Technical detail (FAQPage schema, partial example):**

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Can I open a business account at American Savings Bank online?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes, you can start your business account application online. Visit our Business Checking page and click 'Open Account.' You may need to visit a branch to finalize certain account types."
      }
    },
    {
      "@type": "Question",
      "name": "What are the fees for a personal checking account?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Our No Service Fee Checking account has no monthly maintenance fees. Other account types may have fees depending on balance and activity. See our fee schedule for details."
      }
    }
  ]
}
```

**Why this structure:** Each question is a `Question` object nested inside the `mainEntity` array. The `name` property holds the question text. The `acceptedAnswer` is an `Answer` object containing the plain-text response in the `text` field. You can include HTML in the `text` field (using escaped quotes), but plain text is safer for broad compatibility. Add one `Question` object for every Q&A pair on your page. Google recommends at least 3 questions for eligibility. Your page has 28, so this is a high-value implementation.

---

### 4. Add social preview cards so every share shows a proper image and title ⚠ HIGH

Right now when your site is shared on LinkedIn, Slack, or referenced by ChatGPT, the preview is blank. All 10 sampled pages are missing Open Graph image tags (og:image). This means no thumbnail appears when a loan officer shares your mortgage page in a Slack channel, or when a journalist links to your site on Twitter. With this fix, every share shows a branded image, your page title, and a description. AI engines also use og:image as a fallback when they generate summaries with visual context.

**How to add it:**

- **WordPress** (Yoast or Rank Math): Settings > Social > Facebook/OpenGraph. Upload a default image (recommended size: 1200×630 pixels). The plugin will auto-populate og:image, og:title, and og:description on every page. You can override per-page in the Yoast meta box.
- **Squarespace**: Settings > Marketing > Social Image Sharing. Upload a site-wide social image. Squarespace auto-generates og tags.
- **Webflow**: Page Settings > Open Graph Settings. Upload an og:image for each page template. For a site-wide default, set it in Site Settings > SEO > Social Sharing Image.
- **Wix**: Dashboard > Marketing & SEO > Social Share. Upload a default image. Wix auto-generates tags.
- **Custom-coded**: Add these four meta tags to the `<head>` of every page (adjust content values per page):

```html
<meta property="og:title" content="Hawaii Banking, Checking, Savings, Mortgages | American Savings Bank">
<meta property="og:description" content="American Savings Bank Hawaii offers consumer and business banking services including checking, savings, CDs, mortgages, loans and lines, and online banking.">
<meta property="og:image" content="https://www.asbhawaii.com/images/asb-social-share.jpg">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://www.asbhawaii.com/images/asb-social-share.jpg">
```

**Technical detail:** Open Graph tags are `<meta>` elements in the HTML `<head>`. They do not use JSON-LD. The four required properties are og:title, og:description, og:image, and og:type. Image must be absolute URL (not relative path). Recommended image size is 1200×630 pixels for LinkedIn and Facebook. Twitter uses the same image if you include `twitter:card` and `twitter:image`. Test your implementation at https://www.opengraph.xyz/ or the LinkedIn Post Inspector.

---

### 5. Tell AI engines you are a financial institution so they cite you in banking queries ⚠ MEDIUM

Your existing Organization schema is generic. It does not declare that you are a bank or credit union. When Perplexity or ChatGPT is asked "What banks in Hawaii offer no-fee checking?", they filter by `@type`. Right now your markup says `Organization`, which is true but not specific. Changing it to `BankOrCreditUnion` (a subtype of FinancialService) immediately makes your entity eligible for finance-category queries. You should also add your address, phone, and logo URL so AI engines can cite contact details when users ask "How do I reach American Savings Bank?"

**Where to add it:**

We will deploy this via the NeverRanked schema snippet. No manual work required. We will replace the existing generic Organization schema with the enhanced BankOrCreditUnion version below.

**Technical detail (BankOrCreditUnion schema with address and contact):**

```json
{
  "@context": "https://schema.org",
  "@type": "BankOrCreditUnion",
  "@id": "https://www.asbhawaii.com/#organization",
  "name": "American Savings Bank",
  "legalName": "American Savings Bank, F.S.B.",
  "url": "https://www.asbhawaii.com",
  "logo": "https://www.asbhawaii.com/images/asb-logo.png",
  "telephone": "+1-808-627-6900",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "1001 Bishop Street",
    "addressLocality": "Honolulu",
    "addressRegion": "HI",
    "postalCode": "96813",
    "addressCountry": "US"
  },
  "sameAs": [
    "https://www.facebook.com/ASBHawaii",
    "https://www.linkedin.com/company/american-savings-bank",
    "https://twitter.com/ASB_Hawaii"
  ]
}
```

**Why this structure:** `BankOrCreditUnion` is a schema.org subtype of FinancialService. It signals your entity category to AI engines and Google Knowledge Graph. The `@id` property creates a unique identifier so other schemas can reference this organization (using `publisher` or `organizer` fields). The `address` object is structured as PostalAddress so Google Maps and local search can parse it. The `sameAs` array links your social profiles, which helps entity resolution (Google confirming that your site, Facebook page, and LinkedIn page all represent the same organization). Replace logo URL, phone, and address with your actual values. If you have multiple branch addresses, add those as separate `location` properties (each a Place with its own address).

---

### 6. Add review or rating schema so AI engines have social proof to cite ⚠ MEDIUM

We scanned your site for testimonial or rating signals. Your pages contain the word "testimonial" on 1 of 10 pages, but no structured AggregateRating or Review markup. When ChatGPT is asked "Is American Savings Bank a good bank?", it looks for AggregateRating schema as a trust signal. If your competitors have star ratings marked up and you do not, the AI will cite them and omit you. Even if you do not display public reviews on your site, you can add AggregateRating based on third-party review platforms (Google reviews, Trustpilot, Yelp) as long as you link to the source.

**How to add it:**

- **If you have a Google Business Profile with reviews:** Note your average star rating and total review count. Add the AggregateRating block below to your Organization schema (as a property of the BankOrCreditUnion object).
- **If you collect reviews on your site:** Add a Review schema block for each testimonial. Nest them inside your Organization schema or place them on a dedicated testimonials page.
- **If you have no reviews to mark up yet:** Prioritize collecting Google reviews first. Schema without real reviews violates Google guidelines and can trigger a manual penalty.

**Where to add it:**

We will provide the code structure below. If you have legitimate reviews to reference, reply with your Google review count and average rating, and we will add this to the NeverRanked snippet as part of your Organization schema.

**Technical detail (AggregateRating as part of Organization):**

```json
{
  "@context