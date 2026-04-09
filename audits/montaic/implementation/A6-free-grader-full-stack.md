# A6 — Full Schema Stack for /free-listing-generator

**What it does:** Turns Montaic's most linkable, most inbound-friendly page into a fully structured AEO-ready asset. Currently this page has **ZERO** schema markup — no canonical, no schema, only 78 words of copy. It's the biggest single wasted opportunity on the entire site.

**Where it goes:** `/free-listing-generator` only. Single-page fix.

**Time to implement:** 45 minutes, including a copy expansion.

**Impact:** HIGH. This is the lowest-friction funnel entry point on Montaic — the page most likely to be linked to from external sites and the page with the highest "random stranger searched 'free listing description generator' and landed here" chance.

---

## What to add (full stack)

### 1. Canonical tag

```html
<link rel="canonical" href="https://montaic.com/free-listing-generator" />
```

### 2. Robots meta

```html
<meta name="robots" content="index, follow, max-image-preview:large" />
```

### 3. Full schema block (paste as single `<script type="application/ld+json">`)

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": "https://montaic.com/free-listing-generator#software",
      "name": "Montaic Free Listing Grader",
      "alternateName": "Free MLS Listing Description Grader",
      "applicationCategory": "BusinessApplication",
      "applicationSubCategory": "Real Estate Marketing",
      "operatingSystem": "Web",
      "url": "https://montaic.com/free-listing-generator",
      "description": "Paste any real estate listing description and get an instant AI-powered grade with category breakdowns. See exactly what's weak and get a professional rewrite suggestion. Free, no signup, no credit card.",
      "publisher": {"@id": "https://montaic.com/#organization"},
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD",
        "availability": "https://schema.org/InStock"
      },
      "isAccessibleForFree": true,
      "featureList": [
        "Instant AI grading of listing descriptions",
        "Category breakdowns (clarity, appeal, compliance, MLS-fit)",
        "Fair Housing language scanning",
        "Professional rewrite suggestions",
        "No signup required"
      ]
    },
    {
      "@type": "HowTo",
      "@id": "https://montaic.com/free-listing-generator#howto",
      "name": "How to Grade Your Listing Description for Free",
      "description": "Get an instant AI grade on your MLS listing description in under 10 seconds.",
      "totalTime": "PT10S",
      "supply": [
        {"@type": "HowToSupply", "name": "Your existing listing description (or draft)"}
      ],
      "tool": [{"@type": "HowToTool", "name": "Montaic Free Grader"}],
      "step": [
        {
          "@type": "HowToStep",
          "position": 1,
          "name": "Paste your listing description",
          "text": "Copy any existing MLS listing description or your draft and paste it into the input box."
        },
        {
          "@type": "HowToStep",
          "position": 2,
          "name": "Get the AI grade",
          "text": "Montaic instantly analyzes your copy across clarity, buyer appeal, Fair Housing compliance, MLS format fit, and emotional hook strength."
        },
        {
          "@type": "HowToStep",
          "position": 3,
          "name": "Review the rewrite",
          "text": "See exactly what Montaic would change and why. Copy the rewrite, or use it as a starting point for your own edit."
        }
      ],
      "inLanguage": "en-US",
      "mainEntityOfPage": "https://montaic.com/free-listing-generator"
    },
    {
      "@type": "FAQPage",
      "@id": "https://montaic.com/free-listing-generator#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Is the listing grader really free?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. No signup, no credit card, no usage cap. Paste any listing description and get an instant grade with rewrite suggestions. It's how we show you what Montaic can do before you try the full product."
          }
        },
        {
          "@type": "Question",
          "name": "What does the grader check for?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The grader scores your listing across five categories: clarity, buyer appeal, Fair Housing compliance, MLS format fit, and emotional hook strength. It also flags language that could violate the Fair Housing Act and suggests compliant alternatives."
          }
        },
        {
          "@type": "Question",
          "name": "Does this work for commercial listings?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, but the full commercial grading with cap rate, NOI, and investment language is only in the Broker tier. The free grader handles residential listings best."
          }
        },
        {
          "@type": "Question",
          "name": "Will I be emailed if I use the free grader?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. The free grader is fully anonymous. If you want to save your results or get a personalized rewrite, you can optionally sign up for the free Montaic account, but it's not required."
          }
        },
        {
          "@type": "Question",
          "name": "How is this different from pasting my description into ChatGPT?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "ChatGPT gives you general writing feedback. The Montaic grader is specifically trained on real estate listing conventions, MLS format rules, Fair Housing Act language, and buyer psychology for property descriptions. It produces a structured score with specific fixes, not just a paragraph of generic advice."
          }
        }
      ]
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://montaic.com/free-listing-generator#breadcrumbs",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://montaic.com"},
        {"@type": "ListItem", "position": 2, "name": "Free Listing Grader", "item": "https://montaic.com/free-listing-generator"}
      ]
    }
  ]
}
```

---

## Copy expansion required

The page currently has **78 words** of copy. That's not enough for AI engines to understand what it is or for Google to rank it for anything meaningful.

**Minimum target: 500 words.** Here's a skeleton to fill in:

### Section 1 — Above the fold (what's there now)
- H1: "Grade your listing description in 10 seconds"
- Subhead: "Free, instant, no signup. See exactly what's weak."
- Input box + "Grade My Listing" button

### Section 2 — What the grader checks (add this)
Five cards explaining each scoring category:

**Clarity**
"Does the description tell a buyer what this property actually is? Clear descriptions tell you the type, style, bedroom count, and standout features within the first two sentences."

**Buyer Appeal**
"Does the copy create emotional interest? Appealing descriptions paint a picture of daily life in the home without making promises they can't keep."

**Fair Housing Compliance**
"Does your copy avoid language that could violate the Fair Housing Act? The grader scans for implicit references to race, religion, familial status, disability, and other protected categories."

**MLS Format Fit**
"Does your description respect character limits and standard MLS formatting? The grader checks against major MLS systems and flags over-limit descriptions."

**Hook Strength**
"Does the first sentence earn the next sentence? The grader scores whether your opening creates enough curiosity to keep the reader going."

### Section 3 — What you'll see (add this)
One short paragraph explaining the output format.

"You'll get a letter grade for each category, specific examples of weak phrases, and a suggested rewrite for the whole description. Everything stays in your browser. Nothing is saved without your permission."

### Section 4 — Why we built this (add this)
"Real estate agents are being asked to write 40-60% more content than they were 3 years ago, and most of it is landing in front of AI engines that cite the best-formatted, most compliant descriptions. We built the free grader because we think the bar for listing copy just went up, and most agents haven't noticed yet."

### Section 5 — Link out
"Ready to generate complete listing descriptions in your writing style? Try the full Montaic app." [CTA to homepage]

---

## Validation

After deploying:

1. [Rich Results Test](https://search.google.com/test/rich-results) → should detect WebApplication + HowTo + FAQPage + BreadcrumbList (all four)
2. Count words on the page (target: 500+)
3. Page weight should be reasonable (under 200KB total)
4. Check with [FAQ Rich Results Test](https://search.google.com/test/rich-results) specifically — FAQPage is often the first schema to show SERP rich results (the expandable FAQ snippets)

---

## Why this page matters so much

Of all the pages on Montaic, the `/free-listing-generator` has the best potential as an external citation magnet. Here's why:

1. **"Free" in the URL is a magnet.** People share "free" tools. Blog posts list "free" tools. ChatGPT recommends "free" tools.
2. **Zero signup friction** means agents can test it and write about it publicly.
3. **It's a novel enough idea** (a grader, not just a generator) that it stands out from the 20+ "free listing description generator" pages already ranking.
4. **HowTo + FAQPage + WebApplication all on one URL** is an AEO dream. Each schema type triggers different rich results and different AI citation paths.

With this full schema stack and a 500-word page, this URL should start ranking within 30-60 days for queries like:
- "free listing description grader"
- "grade my real estate listing"
- "is my MLS description good"
- "free tool to check listing description"

None of those are currently owned by Montaic.

---

## Effort estimate

- Paste schema block: 5 min
- Add canonical and robots meta: 2 min
- Write the copy expansion (500 words): 20 min
- Deploy: 5 min
- Validate: 5 min

**Total: ~40 minutes.**

This is one of the highest ROI single-page fixes in the entire Month 1 kit. Do it first if you want a quick win.
