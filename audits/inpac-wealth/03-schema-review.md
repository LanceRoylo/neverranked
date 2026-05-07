# Schema Review — InPac Wealth

**Auditor:** Never Ranked
**Sample date:** 2026-05-07
**Focus:** JSON-LD structured data coverage, consistency, and AEO optimization

---

## Summary

InPac Wealth's homepage carries zero structured data. No Organization schema, no WebSite schema, no FAQPage or Service markup. The site is invisible to entity extraction systems and ineligible for any rich result treatment in search or AI answer engines. For a wealth advisory firm competing on trust signals and local authority, this is a material gap. Even basic financial services sites in this vertical deploy Organization + FAQPage as table stakes.

**Schema grade: F** (zero JSON-LD blocks detected across the sampled page)

---

## What exists today

| Page type | FAQPage | Service | Article | Organization | BreadcrumbList | HowTo | AggregateRating |
|---|---|---|---|---|---|---|---|
| Homepage | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

---

## Findings

### 1. Missing Organization schema blocks entity recognition ⚠ CRITICAL

Google, Bing, ChatGPT, and Perplexity cannot reliably identify InPac Wealth as a named entity without Organization schema. This markup establishes the business name, logo, contact points, and social profiles. It powers knowledge panel eligibility and gives AI engines a canonical reference when the brand appears in training data or retrieval contexts. The homepage mentions "INPAC Financial Advisor" and "INPAC WEALTH" but offers no machine-readable declaration of what InPac Wealth is, where it operates, or how to contact it.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "FinancialService",
  "@id": "https://inpacwealth.com/#organization",
  "name": "InPac Wealth",
  "url": "https://inpacwealth.com",
  "logo": "https://inpacwealth.com/path-to-logo.png",
  "description": "Financial planning and wealth advisory services to help families grow and protect assets.",
  "telephone": "+1-XXX-XXX-XXXX",
  "email": "info@inpacwealth.com",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Main Street",
    "addressLocality": "City",
    "addressRegion": "ST",
    "postalCode": "12345",
    "addressCountry": "US"
  },
  "sameAs": [
    "https://www.linkedin.com/company/inpacwealth",
    "https://www.facebook.com/inpacwealth"
  ]
}
```

**Why this specific structure:** We use FinancialService (a subtype of LocalBusiness and Organization) because InPac Wealth provides advisory services, not retail banking. The `@id` anchor lets other schemas reference this entity. Replace logo URL, phone, email, address, and social links with real values. If InPac Wealth operates multiple locations, nest each as a `location` array of Place objects.

---

### 2. No WebSite schema means sitelinks search box is unavailable ⚠ HIGH

WebSite schema with a potentialAction SearchAction tells Google and Bing how to surface a search box directly in SERPs under the brand query. For a firm with multiple service pages (financial planning, retirement, estate planning), this shortcut improves click-through and signals category authority. The scan shows 62 internal links on the homepage but no schema to map search intent to the site's own query handler.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://inpacwealth.com/#website",
  "url": "https://inpacwealth.com",
  "name": "InPac Wealth",
  "publisher": {
    "@id": "https://inpacwealth.com/#organization"
  },
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://inpacwealth.com/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

**Why this specific structure:** The `publisher` reference points back to the Organization schema by `@id`, creating a graph. If InPac Wealth does not have a search endpoint, remove the potentialAction block and keep only the WebSite declaration. The name and url fields are required.

---

### 3. Missing FAQPage schema loses AI citation and featured snippet eligibility ⚠ HIGH

The homepage copy is structured around value propositions ("Dream with Inspiration. Plan with a Purpose. Live with Intention.") but does not encode any question-and-answer pairs. Wealth advisory queries often follow a FAQ pattern: "How do I choose a financial advisor?" "What is fee-only planning?" "Do I need estate planning?" FAQPage schema turns these into eligible snippets for Google's featured results and citable references for ChatGPT, Perplexity, and Gemini.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://inpacwealth.com/#faqpage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What services does InPac Wealth offer?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "InPac Wealth provides comprehensive financial planning, retirement strategy, estate planning, and wealth advisory services tailored to family needs."
      }
    },
    {
      "@type": "Question",
      "name": "How do I connect with an InPac financial advisor?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "You can connect with an InPac Wealth advisor by visiting our contact page or calling our office directly to schedule a consultation."
      }
    },
    {
      "@type": "Question",
      "name": "Who benefits from working with InPac Wealth?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Families seeking to grow and protect their wealth, plan for retirement, or coordinate estate strategies benefit from our personalized advisory approach."
      }
    }
  ]
}
```

**Why this specific structure:** Each Question must have a `name` (the question text) and an `acceptedAnswer` of type Answer. The `text` field inside Answer must be plain text or HTML. Add as many Question objects as the page supports. If InPac Wealth already has a dedicated FAQ page, deploy this schema there instead of the homepage and adjust the `@id` URL accordingly.

---

### 4. No BreadcrumbList schema hides hierarchy in search results ⚠ MEDIUM

Breadcrumb schema renders visual breadcrumbs in Google's SERP snippets and helps AI engines understand page hierarchy. The homepage is the root, so breadcrumbs are not applicable here. But any interior page (Services, About, Contact, Blog posts) should carry BreadcrumbList. We include a sample for a hypothetical "Retirement Planning" service page.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "@id": "https://inpacwealth.com/services/retirement-planning#breadcrumb",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://inpacwealth.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Services",
      "item": "https://inpacwealth.com/services"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "Retirement Planning",
      "item": "https://inpacwealth.com/services/retirement-planning"
    }
  ]
}
```

**Why this specific structure:** Each ListItem requires `position`, `name`, and `item` (the URL). The final item in the list should match the current page's URL. Deploy this template on every non-homepage URL, adjusting the itemListElement array to reflect the actual path.

---

### 5. No AggregateRating or Review schema eliminates social proof in AI answers ⚠ MEDIUM

If InPac Wealth collects client testimonials or ratings (Google reviews, third-party review platforms), those signals should be encoded as AggregateRating (summary) or individual Review objects. AI answer engines cite star ratings and review counts as social proof when recommending service providers. The scan detected no testimonial or rating text on the homepage, but if reviews exist elsewhere, add this schema to the page that displays them.

**Fix — ready-to-paste code:**

```json
{
  "@context": "https://schema.org",
  "@type": "FinancialService",
  "@id": "https://inpacwealth.com/#organization",
  "name": "InPac Wealth",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "27",
    "bestRating": "5",
    "worstRating": "1"
  }
}
```

**Why this specific structure:** Nest the aggregateRating inside the Organization (or FinancialService) schema using the same `@id`. Replace `ratingValue` and `reviewCount` with real figures from Google Business Profile or a review aggregator. Do not fabricate ratings. Google may penalize sites that misrepresent review data.

---

## Priority list (schema)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Add Organization (FinancialService) schema to site-wide footer or header | HIGH | LOW |
| 2 | Add WebSite schema with SearchAction to site-wide layout | HIGH | LOW |
| 3 | Add FAQPage schema to homepage or dedicated FAQ page | HIGH | MEDIUM |
| 4 | Add BreadcrumbList schema to all interior pages via template | MEDIUM | MEDIUM |
| 5 | Add AggregateRating to Organization schema if reviews exist | MEDIUM | LOW |

---

## Validation checklist

After the client implements the recommended schema fixes:

- [ ] Google Rich Results Test passes on home page
- [ ] Schema.org Validator shows no warnings
- [ ] Organization + WebSite schemas present in site-wide layout
- [ ] BreadcrumbList on every non-home page
- [ ] FAQPage schema on FAQ or homepage
- [ ] `@graph` with `@id` references linking Organization, WebSite, and page-level schemas together