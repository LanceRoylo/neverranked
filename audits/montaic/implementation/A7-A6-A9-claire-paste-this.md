# Quick-Wins Bundle — A7 + A6 + A9

**For:** Claire (Montaic codebase)
**From:** Never Ranked side
**Deploy order:** A7 → A6 → A9 (canonicals first, then the free-grader overhaul, then the metadata sweep)
**Total time:** ~75 minutes of actual work, plus deploy + validation

---

## Pre-flight

Before touching anything, confirm A1 and A1.5 are still live:

```bash
curl -s https://montaic.com/ | grep -o '"@id":"https://montaic.com/#organization"'
curl -s https://montaic.com/pricing | grep -o '"@id":"https://montaic.com/#organization"'
curl -s https://montaic.com/blog | head -c 200
```

You should see the `@id` reference on at least the homepage. If not, stop and flag it before continuing.

---

## A7 — Canonical tags + robots meta (20 minutes)

**Context:** Four of Montaic's highest-value pages are currently missing canonical tags and the `max-image-preview:large` robots directive. This fix closes those four holes and adds a blog-post template that covers all 55 posts at once.

### A7.1 — Homepage

**File:** `apps/dashboard/app/(marketing)/page.tsx` (or wherever the root marketing page lives — you confirmed Next.js 16 App Router earlier)

Add/update the `metadata` export:

```typescript
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Montaic — AI Listing Content for Real Estate Agents",
  description: "AI-native listing content for real estate agents. MLS descriptions, social posts, fact sheets, and marketing copy in your writing style. Free to start.",
  alternates: {
    canonical: "https://montaic.com",
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
  },
};
```

**Note:** The canonical is `https://montaic.com` with NO trailing slash. This must match the `url` field in the Organization schema from A1. Don't let Next auto-append a slash.

### A7.2 — Pricing

**File:** `apps/dashboard/app/(marketing)/pricing/page.tsx`

```typescript
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Montaic Pricing — Free to Start, $149/mo Pro for Real Estate",
  description: "Start free with 3 listings. Pro at $149/mo unlocks unlimited content, writing style calibration, and Fair Housing scanning. Broker at $299/mo.",
  alternates: {
    canonical: "https://montaic.com/pricing",
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
  },
};
```

**Important:** Leave the existing SoftwareApplication schema on this page alone — A1.5 wired it to the root Organization and it's validating correctly. You're only adding/updating the metadata export, not touching the schema.

### A7.3 — Free listing grader

**File:** `apps/dashboard/app/(marketing)/free-listing-generator/page.tsx` (or whatever the actual route is)

```typescript
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free MLS Listing Grader — Score & Rewrite Your Copy Instantly",
  description: "Paste any MLS listing description for an instant AI grade and rewrite. Scores clarity, appeal, Fair Housing, and MLS fit. No signup, no credit card.",
  alternates: {
    canonical: "https://montaic.com/free-listing-generator",
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
  },
};
```

**This page is also getting the A6 schema overhaul below. Do A7.3 first so the metadata is in place before the schema drops in.**

### A7.4 — Blog post template

**File:** `apps/dashboard/app/(marketing)/blog/[slug]/page.tsx`

The blog already has A1.5's BlogPosting schema wired to root Org. Now add the canonical and robots via `generateMetadata`:

```typescript
import type { Metadata } from "next";

export async function generateMetadata(
  { params }: { params: { slug: string } }
): Promise<Metadata> {
  const post = await getPostBySlug(params.slug);

  return {
    title: post.title,
    description: post.description,
    alternates: {
      canonical: `https://montaic.com/blog/${params.slug}`,
    },
    robots: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `https://montaic.com/blog/${params.slug}`,
      type: "article",
      publishedTime: post.datePublished,
      images: post.heroImage ? [
        {
          url: post.heroImage,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ] : undefined,
    },
  };
}
```

If `getPostBySlug` returns a different shape than the above fields, adjust accordingly. The three required pieces are: `canonical`, `robots`, and `openGraph`.

### A7 validation

After deploy:

```bash
curl -s https://montaic.com/ | grep -o 'rel="canonical" href="[^"]*"'
curl -s https://montaic.com/pricing | grep -o 'rel="canonical" href="[^"]*"'
curl -s https://montaic.com/free-listing-generator | grep -o 'rel="canonical" href="[^"]*"'
curl -s https://montaic.com/blog/<any-real-slug> | grep -o 'rel="canonical" href="[^"]*"'
```

All four should return the exact canonical URL. Also grep for `max-image-preview:large` to confirm the robots meta is present.

---

## A6 — Full schema stack for /free-listing-generator (40 minutes)

**Context:** The free grader page currently has ZERO schema and only 78 words of copy. It's the single biggest wasted opportunity on the site because it's the most linkable, most AEO-friendly page Montaic has. We're fixing both halves in one pass.

### A6.1 — Add the schema block

**File:** `apps/dashboard/app/(marketing)/free-listing-generator/page.tsx`

Add this constant at the top of the file, then render it via `dangerouslySetInnerHTML` the same way A1 rendered the root Organization:

```typescript
const FREE_GRADER_SCHEMA = {
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
      "publisher": { "@id": "https://montaic.com/#organization" },
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
        { "@type": "HowToSupply", "name": "Your existing listing description (or draft)" }
      ],
      "tool": [
        { "@type": "HowToTool", "name": "Montaic Free Grader" }
      ],
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
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://montaic.com" },
        { "@type": "ListItem", "position": 2, "name": "Free Listing Grader", "item": "https://montaic.com/free-listing-generator" }
      ]
    }
  ]
} as const;
```

In the page's JSX return, render it in the `<head>` or early in the body:

```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(FREE_GRADER_SCHEMA) }}
/>
```

**Publisher reference:** Note the `publisher` in WebApplication uses `{ "@id": "https://montaic.com/#organization" }` — same pattern as A1.5. This keeps the free-grader wired to the root Organization entity.

### A6.2 — Expand the page copy to 500+ words

The page currently has 78 words. That's not enough for AI engines to understand or for Google to rank. Add the following sections to the page body. Exact copy below — Lance approved this wording, paste as-is.

**Section: What the grader checks (add below the input box)**

Five cards, one per category:

**Clarity**
> Does the description tell a buyer what this property actually is? Clear descriptions tell you the type, style, bedroom count, and standout features within the first two sentences.

**Buyer Appeal**
> Does the copy create emotional interest? Appealing descriptions paint a picture of daily life in the home without making promises they can't keep.

**Fair Housing Compliance**
> Does your copy avoid language that could violate the Fair Housing Act? The grader scans for implicit references to race, religion, familial status, disability, and other protected categories.

**MLS Format Fit**
> Does your description respect character limits and standard MLS formatting? The grader checks against major MLS systems and flags over-limit descriptions.

**Hook Strength**
> Does the first sentence earn the next sentence? The grader scores whether your opening creates enough curiosity to keep the reader going.

**Section: What you'll see**

One paragraph explaining output format:

> You'll get a letter grade for each category, specific examples of weak phrases, and a suggested rewrite for the whole description. Everything stays in your browser. Nothing is saved without your permission.

**Section: Why we built this**

> Real estate agents are being asked to write 40-60% more content than they were 3 years ago, and most of it is landing in front of AI engines that cite the best-formatted, most compliant descriptions. We built the free grader because we think the bar for listing copy just went up, and most agents haven't noticed yet.

**Section: CTA out**

> Ready to generate complete listing descriptions in your writing style? Try the full Montaic app. [link to homepage]

### A6 validation

After deploy:

1. [Rich Results Test](https://search.google.com/test/rich-results) on `https://montaic.com/free-listing-generator` — should detect **WebApplication + HowTo + FAQPage + BreadcrumbList** (all four)
2. View source and confirm the schema block is present
3. Count words on the page — target 500+
4. Confirm the `publisher` reference to `#organization` resolves correctly

---

## A9 — Title + meta rewrites, top 4 only (15 minutes)

**Context:** These four pages have the worst title/meta in the sitemap. A7.1–A7.4 above already cover the homepage, pricing, free-grader, and blog template. If you've deployed A7, the title and description for those pages are already updated with the A9 rewrites — so A9 for those pages is effectively done.

The one page A9 still needs is the Fair Housing compliance checker.

### A9.1 — Fair Housing Compliance Checker

**File:** `apps/dashboard/app/(marketing)/tools/fair-housing-compliance-checker/page.tsx` (or whatever the actual route is)

```typescript
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fair Housing AI Compliance Checker for Real Estate | Montaic",
  description: "Scan any real estate listing description for Fair Housing Act violations in seconds. Built for agents who know HUD holds them legally responsible.",
  alternates: {
    canonical: "https://montaic.com/tools/fair-housing-compliance-checker",
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
  },
};
```

**Why this one matters most:** The 2024 HUD AI guidance gives Montaic a legally defensible differentiator that nobody else in the listing-generator space is claiming. This title and description lean hard into the legal angle because that's the positioning Lance wants Montaic to own. Don't soften it.

### A9 skip list (do NOT touch in this pass)

Leave these for a later batch — they're template-driven and need more care:

- Market pages (50+ city pages)
- Compare pages (8)
- Blog post titles beyond what A7.4's template auto-handles
- Tool listing-type variants (25+)

---

## Full deploy sequence

1. Deploy A7 changes. Run A7 validation curls.
2. Deploy A6 changes (schema + copy). Run Rich Results Test.
3. Deploy A9.1 (Fair Housing page). Spot-check the title in view-source.
4. Report back with:
   - All A7 canonicals present: Y/N
   - A6 Rich Results Test output (count of detected items, errors, warnings)
   - A9.1 title visible in source: Y/N

---

## Known risks

- **Trailing slash policy:** The homepage canonical MUST be `https://montaic.com` with no trailing slash. If Next.js is configured with `trailingSlash: true`, this will conflict. Check `next.config.js` before deploying A7.1 and flag it to Lance if there's a mismatch.
- **CDN caching:** Like A1.5, the schema changes may hit CDN cache on some pages. After deploying A6, force a cache purge or wait for the natural TTL before running Rich Results Test.
- **BlogPosting schema collision:** A1.5 added the BlogPosting schema inline on `[slug]/page.tsx`. A7.4 adds the `openGraph` metadata. These should coexist fine because they're in different APIs (JSON-LD vs Next metadata), but if there's a conflict, the schema takes precedence — keep the A1.5 block as-is.

---

## Out of scope (flag to Lance after deploy)

- **A1.6** — The Person schema on `/agents/[slug]` still has `worksFor: Montaic` which is factually wrong (agents are customers, not employees). Not part of this bundle. Will come as a separate patch.
- **A2** — BreadcrumbList across all 222 URLs. Next bundle after this one.
- **A10** — Entity registration (Wikidata, Crunchbase, etc.). Manual work, not code. Lance will handle separately.

---

**Questions before starting?** If any file path doesn't match what's actually in the Montaic codebase, flag it with the real path and I'll update this doc. Don't guess — the canonical URLs and metadata keys need to match exactly.
