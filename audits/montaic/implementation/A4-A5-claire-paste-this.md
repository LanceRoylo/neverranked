# Content Authority Bundle — A4 + A5

**For:** Claire (Montaic codebase)
**From:** Never Ranked side
**Deploy order:** A4 first (full deploy), A5 in two phases (template now, AggregateRating after reviews collected)
**Total time:** ~90 minutes of work for A4 + A5 template. A5 AggregateRating is gated on review collection (2-3 calendar days).

---

## Pre-flight

Confirm A1.6, A2, A3, and A8 are still live before touching anything:

```bash
# A1.6 — agent ProfilePage
curl -s https://montaic.com/agents/<any-slug> | grep -o '"@type":"ProfilePage"'

# A2 — breadcrumbs on tool + market + blog
curl -s https://montaic.com/tools/mls-description-generator | grep -o '"@type":"BreadcrumbList"'
curl -s https://montaic.com/markets/austin-tx | grep -o '"@type":"BreadcrumbList"'
curl -s https://montaic.com/blog/best-ai-listing-description-generator | grep -o '"@type":"BreadcrumbList"'

# A3 — HowTo on top tool pages
curl -s https://montaic.com/tools/mls-description-generator | grep -o '"@type":"HowTo"'

# A8 — og:image rendering
curl -s https://montaic.com/tools/mls-description-generator | grep -o 'og:image'
curl -s -o /dev/null -w "%{http_code}" "https://montaic.com/og?title=Test&type=tool"
# Expected: 200
```

All six should match. If any are missing, stop and flag before continuing.

---

## A4 — BlogPosting schema upgrade (60 minutes)

**Context:** Blog posts currently carry a bare `@type: Article` with `Organization` author, no hero image, no wordCount, no keywords, no articleSection, and a duplicated publisher block instead of an `@id` reference to the root Organization. A1.6.2 already pushed the author to `Person: Lance Roylo`, but the rest of the Article schema is still thin. A4 upgrades the whole block to full `BlogPosting` with Person author referenced by `@id`, ImageObject hero, wordCount, keywords, articleSection, and `isAccessibleForFree`.

This is what gets blog posts cited by AI engines when they are asked informational queries. Right now Montaic's blog is structurally invisible to them.

### A4.1 — Add the blogPostingSchema utility

**File:** `lib/schema.ts` (same file where `breadcrumbSchemaFromPath` and `howToSchema` now live)

Add this type and function:

```ts
type BlogPostInput = {
  slug: string;                // e.g. "best-ai-listing-description-generator"
  headline: string;
  description: string;
  datePublished: string;       // ISO 8601, e.g. "2026-02-10"
  dateModified?: string;
  heroImage: string;           // full URL
  wordCount: number;
  keywords: string[];
  articleSection: string;      // e.g. "Real Estate Marketing"
  authorName?: string;         // defaults to Lance Roylo
  authorTitle?: string;
};

export function blogPostingSchema(input: BlogPostInput) {
  const url = `https://montaic.com/blog/${input.slug}`;
  const authorName = input.authorName || "Lance Roylo";
  const authorTitle = input.authorTitle || "Founder, Montaic";

  return {
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: input.headline,
    description: input.description,
    image: {
      "@type": "ImageObject",
      url: input.heroImage,
      width: 1200,
      height: 630,
    },
    datePublished: input.datePublished,
    dateModified: input.dateModified || input.datePublished,
    wordCount: input.wordCount,
    keywords: input.keywords,
    articleSection: input.articleSection,
    isAccessibleForFree: true,
    inLanguage: "en-US",
    author: {
      "@type": "Person",
      "@id": "https://montaic.com/#founder",
      name: authorName,
      jobTitle: authorTitle,
      url: "https://montaic.com/about",
      worksFor: { "@id": "https://montaic.com/#organization" },
    },
    publisher: { "@id": "https://montaic.com/#organization" },
    mainEntityOfPage: url,
  };
}
```

**Notable:** The author block uses `@id: https://montaic.com/#founder` — the same ID used in the root Organization schema from A1. This is intentional. When every blog post references the same `@id`, AI engines consolidate them into a single author entity: one Lance Roylo, 55 posts, growing topical authority. That's how you build authorial E-E-A-T that AI engines can see.

### A4.2 — Add the founder Person entity to the root Organization

**File:** wherever the root Organization `@graph` is rendered (homepage layout / root layout from A1)

Add a `Person` node to the existing `@graph` array so `https://montaic.com/#founder` actually resolves to a real entity:

```ts
{
  "@type": "Person",
  "@id": "https://montaic.com/#founder",
  "name": "Lance Roylo",
  "jobTitle": "Founder",
  "url": "https://montaic.com/about",
  "worksFor": { "@id": "https://montaic.com/#organization" }
}
```

Put it right after the Organization node in the same `@graph`. Every `@id` reference from blog posts now points to a fully defined entity rooted on the homepage, which is exactly what AI engines want to see.

### A4.3 — Dynamic extraction helpers

Hand-maintaining 55 schema blocks is the wrong move. Auto-compute everything you can at build time:

```ts
// lib/blog-meta.ts (new file)

export function getWordCount(markdown: string): number {
  return markdown.replace(/[\s\n]+/g, " ").trim().split(" ").length;
}

export function getFrontmatterKeywords(frontmatter: any): string[] {
  return frontmatter.tags || frontmatter.keywords || [];
}

export function getArticleSection(frontmatter: any): string {
  return frontmatter.category || frontmatter.section || "Real Estate Marketing";
}
```

Wire these into whatever MDX/Markdown processor the blog uses so every post auto-generates its schema from frontmatter + content. Manual updates should only be needed if a post lacks the frontmatter fields.

### A4.4 — Wire into the blog post page

**File:** `app/blog/[slug]/page.tsx` (or wherever BlogPosting JSON-LD is rendered)

Replace the existing Article schema block with:

```ts
import { blogPostingSchema } from "@/lib/schema";
import { getWordCount, getFrontmatterKeywords, getArticleSection } from "@/lib/blog-meta";

// Inside the page component, after loading post content + frontmatter:
const schema = {
  "@context": "https://schema.org",
  ...blogPostingSchema({
    slug: post.slug,
    headline: post.frontmatter.title,
    description: post.frontmatter.description || post.frontmatter.excerpt,
    datePublished: post.frontmatter.date,
    dateModified: post.frontmatter.updated,
    heroImage: post.frontmatter.heroImage
      || `https://montaic.com/og?title=${encodeURIComponent(post.frontmatter.title)}&type=blog`,
    wordCount: getWordCount(post.content),
    keywords: getFrontmatterKeywords(post.frontmatter),
    articleSection: getArticleSection(post.frontmatter),
  }),
};
```

**Hero image fallback:** If a post lacks a `heroImage` in frontmatter, fall back to the dynamic `/og` route from A8. Every post ships with a valid `ImageObject` even without hand-curated artwork. You can come back later and add real hero images to the top-performing posts.

### A4.5 — If blog posts currently use `@graph`

If the blog template from A2 already wraps JSON-LD in `@graph` for the BreadcrumbList, add the BlogPosting object to that same `@graph` array instead of creating a second `<script>` tag:

```ts
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    blogPostingSchema({ /* ... */ }),
    breadcrumbSchemaFromPath(`blog/${post.slug}`, post.frontmatter.title),
  ],
};
```

One `@graph` per page is cleaner than stacked script tags.

### A4 validation

After deploying:

```bash
# BlogPosting type
curl -s https://montaic.com/blog/best-ai-listing-description-generator | grep -o '"@type":"BlogPosting"'

# Person author referenced by @id
curl -s https://montaic.com/blog/best-ai-listing-description-generator | grep -o '"@id":"https://montaic.com/#founder"'

# ImageObject hero
curl -s https://montaic.com/blog/best-ai-listing-description-generator | grep -o '"@type":"ImageObject"'

# wordCount present
curl -s https://montaic.com/blog/best-ai-listing-description-generator | grep -o '"wordCount"'

# Founder entity resolves on homepage
curl -s https://montaic.com/ | grep -o '"@id":"https://montaic.com/#founder"'
```

All five should match. Then paste one blog URL into the [Rich Results Test](https://search.google.com/test/rich-results) and confirm BlogPosting is detected with Person author and image.

---

## A5 — SoftwareApplication + AggregateRating (20 min template + 2-3 calendar days for reviews)

**Context:** Montaic currently has a `SoftwareApplication` schema on home and pricing (from A1), but without `aggregateRating`. AggregateRating is the single biggest AI-citation trust signal — when ChatGPT or Perplexity are asked "is Montaic any good," they cite pages with explicit ratings at a much higher rate than unrated ones.

**Critical constraint: don't fake ratings.** Schema ratings with no backing reviews is one of the few patterns Google actively penalizes when detected, and AI engines are beginning to cross-check aggregate ratings against Capterra, G2, and similar platforms. A5 deploys in two phases: the utility + SoftwareApplication body now, and the AggregateRating block added only after real reviews are collected.

### A5.1 — Add the softwareApplicationSchema utility

**File:** `lib/schema.ts`

```ts
type Review = {
  name: string;
  rating: number;       // 1-5
  body: string;
  date: string;         // ISO 8601
  verified?: boolean;
};

type SoftwareAppInput = {
  url?: string;
  reviews: Review[];
  includeIndividualReviews?: boolean;
};

export function softwareApplicationSchema(input: SoftwareAppInput) {
  const reviews = input.reviews;
  const count = reviews.length;
  const avg = count > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;

  const base: any = {
    "@type": "SoftwareApplication",
    "@id": "https://montaic.com/#software",
    name: "Montaic",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Content Generation",
    operatingSystem: "Web",
    url: input.url || "https://montaic.com",
    description:
      "AI-native listing content platform for real estate professionals. MLS descriptions, social posts, fact sheets, and marketing copy in your writing style, with Fair Housing compliance scanning built in.",
    publisher: { "@id": "https://montaic.com/#organization" },
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "USD",
        description:
          "3 listings with MLS descriptions and Fair Housing screening. No credit card required.",
        availability: "https://schema.org/InStock",
      },
      {
        "@type": "Offer",
        name: "Pro",
        price: "149",
        priceCurrency: "USD",
        description:
          "Unlimited listings, all content types, writing style calibration, comp analysis, positioning briefs, fact sheets, AI follow-ups.",
        availability: "https://schema.org/InStock",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "149",
          priceCurrency: "USD",
          unitCode: "MON",
          referenceQuantity: { "@type": "QuantitativeValue", value: 1 },
        },
      },
      {
        "@type": "Offer",
        name: "Broker",
        price: "299",
        priceCurrency: "USD",
        description:
          "Everything in Pro plus writing style cloning, commercial property compliance, team seats, priority support.",
        availability: "https://schema.org/InStock",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "299",
          priceCurrency: "USD",
          unitCode: "MON",
          referenceQuantity: { "@type": "QuantitativeValue", value: 1 },
        },
      },
    ],
    featureList: [
      "MLS-compliant listing descriptions",
      "Writing style calibration",
      "Fair Housing compliance scanning",
      "Character-limit aware output",
      "Social media content generation",
      "Property fact sheet PDFs",
      "Commercial real estate support",
      "Voice-cloned output (Broker tier)",
    ],
    screenshot: "https://montaic.com/og/product-screenshot.png",
    softwareVersion: "2026.1",
  };

  if (count > 0) {
    base.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: avg.toFixed(1),
      bestRating: "5",
      worstRating: "1",
      reviewCount: count,
      ratingCount: count,
    };
  }

  if (input.includeIndividualReviews && count > 0) {
    base.review = reviews.slice(0, 5).map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.name },
      datePublished: r.date,
      reviewBody: r.body,
      reviewRating: {
        "@type": "Rating",
        ratingValue: r.rating.toString(),
        bestRating: "5",
        worstRating: "1",
      },
    }));
  }

  return base;
}
```

**Important:** The function conditionally adds `aggregateRating` and `review` — if `reviews` is an empty array, neither block appears. This means you can deploy the utility now with an empty `data/reviews.json` and the SoftwareApplication body still upgrades, but no rating claim is made until real reviews exist.

### A5.2 — Create the reviews data file

**File:** `data/reviews.json` (new file)

Start empty. This file is the single source of truth for all review data on the site.

```json
[]
```

When real reviews come in, add entries shaped like:

```json
[
  {
    "name": "Sarah Chen",
    "rating": 5,
    "body": "I was skeptical about AI for listings but Montaic actually sounds like me. Saves me 2-3 hours per listing and the Fair Housing check caught something I would have missed.",
    "date": "2026-03-15",
    "verified": true
  }
]
```

Keep the file in git. Every new review is a commit. The aggregate rating recomputes automatically on next deploy.

### A5.3 — Wire into the homepage

**File:** wherever the homepage schema `@graph` is rendered (likely `app/page.tsx` or `app/layout.tsx`)

Replace any existing SoftwareApplication block with:

```ts
import reviews from "@/data/reviews.json";
import { softwareApplicationSchema } from "@/lib/schema";

// Inside the @graph:
softwareApplicationSchema({
  reviews,
  includeIndividualReviews: true,
})
```

### A5.4 — Wire into the pricing page

**File:** `app/pricing/page.tsx` (or equivalent)

Same pattern, same reviews source:

```ts
import reviews from "@/data/reviews.json";
import { softwareApplicationSchema } from "@/lib/schema";

softwareApplicationSchema({
  url: "https://montaic.com/pricing",
  reviews,
  includeIndividualReviews: true,
})
```

### A5.5 — Wire into comparison pages

**File:** `app/compare/[slug]/page.tsx`

On compare pages, include the SoftwareApplication body for entity recognition, but skip individual reviews (those belong on the commercial pages):

```ts
import reviews from "@/data/reviews.json";

softwareApplicationSchema({
  url: `https://montaic.com/compare/${slug}`,
  reviews,
  includeIndividualReviews: false,
})
```

### A5.6 — Review collection (Lance's side, not Claire's)

Claire: you can deploy A5.1 through A5.5 right now with an empty `data/reviews.json`. The SoftwareApplication body upgrades immediately. The AggregateRating block will only appear once Lance populates the reviews file.

Lance is handling outreach to paying Pro/Broker customers this week. Target is 5-10 real reviews in 72 hours. Once those come in, Lance will hand you the `data/reviews.json` update (or just do the PR himself). No action needed from you on collection.

**Do not:** generate placeholder reviews, use "example" names, or deploy any rating without real backing data. One of the few ways to actively hurt this domain's trust is to ship fake ratings that Google or Perplexity later flag.

### A5 validation

After deploying the template (empty reviews file):

```bash
# SoftwareApplication with @id
curl -s https://montaic.com/ | grep -o '"@id":"https://montaic.com/#software"'

# No aggregateRating yet (empty reviews)
curl -s https://montaic.com/ | grep -c 'aggregateRating'
# Expected: 0

# Offers block present
curl -s https://montaic.com/pricing | grep -o '"@type":"Offer"' | head -1

# featureList present
curl -s https://montaic.com/ | grep -o 'featureList'
```

After Lance adds real reviews and redeploys:

```bash
# aggregateRating now present
curl -s https://montaic.com/ | grep -o '"@type":"AggregateRating"'

# reviewCount matches reviews.json length
curl -s https://montaic.com/ | grep -o '"reviewCount":[0-9]*'
```

Then paste the homepage URL into the [Rich Results Test](https://search.google.com/test/rich-results) and confirm SoftwareApplication is detected. Once reviews are live, the Merchant Listings / Product rich results should also show up.

---

## Full deploy sequence

1. Deploy A4 (blogPostingSchema utility + founder Person entity + blog page wiring)
2. Validate A4 with the curl commands above
3. Deploy A5.1 through A5.5 (softwareApplicationSchema + empty reviews.json + homepage/pricing/compare wiring)
4. Validate A5 template with the curl commands above
5. Wait for Lance to supply real reviews
6. Lance commits reviews.json update, Claire redeploys, re-validates the AggregateRating block

---

## Known risks

- **Hero image fallback:** If A8's `/og` route has edge runtime or caching issues, blog posts that rely on the fallback URL will carry a broken ImageObject. Spot-check at least 3 blog posts after deploy to confirm the fallback resolves.
- **`@id` consolidation depends on A1:** The `@id: https://montaic.com/#founder` reference only resolves if A4.2 (adding the Person entity to the root `@graph`) is actually deployed. Don't skip A4.2.
- **Review data file import:** Next.js may need `resolveJsonModule: true` in `tsconfig.json` if it isn't already set. If `import reviews from "@/data/reviews.json"` throws, that's the fix.
- **No faked ratings.** If anything in the codebase currently has a hardcoded `aggregateRating`, remove it as part of A5. Only the utility should ever produce an AggregateRating, and only when `data/reviews.json` has real entries.
- **Comparison page review omission:** A5.5 deliberately sets `includeIndividualReviews: false` on compare pages. This is correct — review objects belong on commercial pages, not on positioning pages.

---

## Out of scope

- **A10** — Entity registration (Wikidata, Crunchbase, LinkedIn Company, Product Hunt, G2). Off-site work Lance handles directly. Next bundle.
- **A11** — Fair Housing pillar article (2,400 words on 2024 HUD AI guidance). Content work, not schema. Queued after A10.
- **Review collection outreach** — Lance's job, not Claire's. Don't email customers from the codebase.
- **Per-post hero image art direction** — A4.4 uses the `/og` fallback for every post. Swapping in hand-crafted hero images for top posts is a later pass.

---

## When you're done

Save the validator output for:
- 1 blog post (should show BlogPosting with Person author `@id: #founder`, ImageObject, wordCount, keywords)
- The homepage (should show SoftwareApplication with `@id: #software`, Offers array, featureList, Person `#founder` entity, Organization `#organization` entity — but NO aggregateRating until reviews land)
- 1 compare page (should show SoftwareApplication without individual reviews)

Then tell Lance:

> "A4 and A5 template deployed and validated. [X] blog posts now carry BlogPosting schema with consolidated founder author. SoftwareApplication upgraded on home / pricing / compare pages. Reviews file is empty — AggregateRating will turn on automatically once `data/reviews.json` is populated. 0 errors. Returned to Claude."

---

## Questions?

If the blog template doesn't currently parse frontmatter at all (unlikely given the 55 posts already render), flag it and we'll fall back to a hand-maintained `blog-meta.ts` lookup map keyed by slug. But that's a last resort — frontmatter extraction is the right move.

If the `SoftwareApplication` currently on home/pricing has hardcoded fields that differ from what A5.1 specifies (different pricing, different features), reconcile to the source of truth (the actual pricing page UI) rather than blindly copying A5.1. The schema should match what users see. If the pricing page shows different numbers than what's in A5.1, use the page numbers and flag the discrepancy for Lance.
