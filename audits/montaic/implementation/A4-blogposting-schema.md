# A4 — BlogPosting Schema for Blog Posts

**What it does:** Upgrades the thin `Article` schema currently on blog posts to a full `BlogPosting` schema with Person author, hero image, keywords, word count, and article section. This is what gets blog posts cited by AI engines when they're asked informational questions.

**Where it goes:** Every page under `/blog/*`. Currently there are ~55 posts.

**Time to implement:** 20 minutes for the template, then it applies to all posts at once.

**Impact:** Medium-high. Blog posts are Montaic's highest-quality existing content asset, but they're structurally invisible to AI engines because the Article schema is bare-bones.

---

## What's wrong with the current schema

Sample from `/blog/best-ai-listing-description-generator`:

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "The Best AI Listing Description Generator...",
  "description": "An honest breakdown of every AI listing description tool...",
  "datePublished": "2026-02-10",
  "dateModified": "2026-02-10",
  "author": {"@type": "Organization", "name": "Montaic"},
  "publisher": {"@type": "Organization", "name": "Montaic", "url": "https://montaic.com"},
  "mainEntityOfPage": "https://montaic.com/blog/best-ai-listing-description-generator"
}
```

Problems:
1. `@type: Article` is too generic — `BlogPosting` is more specific and better indexed
2. Author is `Organization`, not `Person` — real authority comes from real bylines
3. No `image` — disqualified from Google News / Discover
4. No `wordCount`, `keywords`, `articleSection`
5. No `isAccessibleForFree` flag
6. `publisher` duplicates Organization instead of referencing the root `@id`

---

## The templated function

```typescript
// lib/schema.ts (addition)

type BlogPostInput = {
  slug: string;                // e.g. "best-ai-listing-description-generator"
  headline: string;
  description: string;
  datePublished: string;       // ISO 8601, e.g. "2026-02-10"
  dateModified?: string;
  heroImage: string;           // full URL
  wordCount: number;
  keywords: string[];          // e.g. ["AI listing descriptions", "MLS copy"]
  articleSection: string;      // e.g. "Real Estate Marketing"
  authorName?: string;         // defaults to Lance Roylo
  authorTitle?: string;
};

export function blogPostingSchema(input: BlogPostInput) {
  const slug = input.slug;
  const url = `https://montaic.com/blog/${slug}`;
  const authorName = input.authorName || "Lance Roylo";
  const authorTitle = input.authorTitle || "Founder, Montaic";

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    "headline": input.headline,
    "description": input.description,
    "image": {
      "@type": "ImageObject",
      "url": input.heroImage,
      "width": 1200,
      "height": 630,
    },
    "datePublished": input.datePublished,
    "dateModified": input.dateModified || input.datePublished,
    "wordCount": input.wordCount,
    "keywords": input.keywords,
    "articleSection": input.articleSection,
    "isAccessibleForFree": true,
    "inLanguage": "en-US",
    "author": {
      "@type": "Person",
      "@id": "https://montaic.com/#founder",
      "name": authorName,
      "jobTitle": authorTitle,
      "url": "https://montaic.com/about",
      "worksFor": {"@id": "https://montaic.com/#organization"},
    },
    "publisher": {"@id": "https://montaic.com/#organization"},
    "mainEntityOfPage": url,
  };
}
```

---

## Sample usage

```typescript
const schema = blogPostingSchema({
  slug: "best-ai-listing-description-generator",
  headline: "The Best AI Listing Description Generator for Real Estate Agents (2026)",
  description: "An honest breakdown of every AI listing description tool on the market in 2026. What works, what doesn't, and why voice-profiled AI is the only category that actually matters.",
  datePublished: "2026-02-10",
  heroImage: "https://montaic.com/blog/best-ai-listing-description-generator/og.jpg",
  wordCount: 2103,
  keywords: [
    "AI listing description",
    "real estate AI tools",
    "MLS copy generator",
    "best AI real estate tools 2026",
  ],
  articleSection: "Real Estate Marketing",
});
```

---

## Dynamic extraction

You can auto-compute some fields at build time instead of hand-maintaining them:

```typescript
function getWordCount(markdown: string): number {
  return markdown.replace(/[\s\n]+/g, " ").trim().split(" ").length;
}

function getFirstHeadingAsHeadline(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1] : "Untitled";
}

function getFrontmatterKeywords(frontmatter: any): string[] {
  return frontmatter.tags || frontmatter.keywords || [];
}
```

Then wire into your MDX/Markdown processor so every blog post auto-generates its schema from the content metadata. Hand-writing 55 schema blocks is the wrong move.

---

## Hero images matter more than you think

The `image` field in BlogPosting is **required** for Google Discover eligibility AND is the single biggest factor in how blog posts surface in AI engine citations. AI engines are increasingly showing thumbnail images alongside their citations, and posts without images get visually demoted in those answers.

**Target specs:**
- 1200×630 (Facebook/Twitter/LinkedIn standard)
- JPG or PNG
- Under 300KB
- Descriptive of the post content (not just a stock abstract)

If Montaic doesn't have hero images on every post yet, the fastest fix is to auto-generate them from the title using `@vercel/og` or a static script. See **A8 — og:image generation** for the full approach.

---

## Author consolidation via `@id` references

Notice how the `author` block uses `@id: https://montaic.com/#founder` — the same ID used in the root Organization schema from A1. This is intentional.

When schemas across the site reference the same `@id`, they're telling AI engines "this is all the same person." The author's identity gets consolidated: one Lance Roylo, 55 blog posts, growing corpus of authored content. That's exactly how you build topical authority with AI engines.

If Montaic ever has guest authors, they'd get their own `@id` in the same pattern (`https://montaic.com/#author-{slug}`).

---

## Effort estimate

- Write the utility function: 10 min
- Build auto-extraction helpers: 15 min
- Apply to all existing blog posts (if template-driven): 5 min deploy
- Manual update of keywords / article sections per post: 30 min for top 10, batch the rest

**Total for top 10 posts: ~60 minutes.**
**Total for full blog coverage: ~2 hours.**

The benefit compounds as you publish more posts — every future post ships with the full schema automatically.
