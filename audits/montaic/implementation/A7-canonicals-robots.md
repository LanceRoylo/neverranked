# A7 — Canonical Tags + Robots Meta

**What it does:** Stops Google and AI engines from splitting page authority across URL variants. Adds explicit indexing permissions. Currently missing on homepage, pricing, blog posts, and free-grader — four of Montaic's highest-value pages.

**Where it goes:** `<head>` of every page. One line each, ~2 lines of code per page type.

**Time to implement:** 15 minutes for a template-wide fix.

**Impact:** HIGH for pages currently missing canonicals. The homepage not having a canonical is particularly damaging because it's the page Google treats as the brand entity root.

---

## The problem

From the technical audit:

| Page | Canonical present? |
|---|---|
| `/` (home) | ❌ MISSING |
| `/pricing` | ❌ MISSING |
| `/free-listing-generator` | ❌ MISSING |
| `/blog/*` | ❌ MISSING |
| `/tools/*` | ✓ present |
| `/markets/*` | ✓ present |
| `/compare/*` | ✓ present |

The pattern suggests there's a canonical helper being called on `tools`, `markets`, and `compare` templates but NOT on the homepage, pricing, free-grader, and blog layouts. Two-minute fix per template.

---

## The canonical helper

In Next.js App Router, the correct place is `generateMetadata` in each page:

```typescript
// app/page.tsx (homepage)
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Montaic — Your Next Listing, Ready in 30 Seconds",
  description: "One input. Five publish-ready content pieces — MLS description, marketing copy, Instagram caption, headline, and bullet points. Written in your writing style. Free to start.",
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

```typescript
// app/pricing/page.tsx
export const metadata: Metadata = {
  title: "Montaic Pricing — Free to Start, $149/mo Pro Plan for Real Estate Agents",
  description: "Start free with 3 listings. Pro at $149/month for unlimited agent tools, or Broker at $299/month for voice cloning, commercial properties, and team seats.",
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

```typescript
// app/free-listing-generator/page.tsx
export const metadata: Metadata = {
  title: "Free Listing Description Grader — Grade Your MLS Copy in 10 Seconds",
  description: "Paste any listing description and get an instant AI grade across clarity, buyer appeal, Fair Housing, and MLS format. Free, no signup, no credit card.",
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

---

## Blog post canonical pattern

Blog posts need to be dynamic based on the slug:

```typescript
// app/blog/[slug]/page.tsx
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
      images: [
        {
          url: post.heroImage,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
  };
}
```

---

## If Montaic isn't on Next.js

If the stack is different (Remix, SvelteKit, Nuxt, Astro, Rails, plain HTML), the canonical tag just needs to be in `<head>`:

```html
<link rel="canonical" href="https://montaic.com/[current-path]" />
<meta name="robots" content="index, follow, max-image-preview:large" />
```

Wire it into whatever layout system handles head tags. The important thing is that **every indexable page has BOTH tags**, and the canonical URL matches the actual URL exactly (same casing, same trailing slash policy, same http/https).

---

## The trailing slash question

Montaic's `sitemap.xml` uses URLs without trailing slashes (`/pricing` not `/pricing/`). The canonical tag must match:

✅ `<link rel="canonical" href="https://montaic.com/pricing" />`
❌ `<link rel="canonical" href="https://montaic.com/pricing/" />`

If pages are accessible at both variants, configure a 301 redirect from the trailing-slash version to the non-slash version (or vice versa — pick one and be consistent). Next.js has a `trailingSlash: false` option in `next.config.js` that handles this automatically.

---

## Homepage canonical — a subtle gotcha

For the homepage, the canonical URL should be `https://montaic.com` (no trailing slash, no `/index.html`). But some frameworks generate it as `https://montaic.com/`. Both work for Google, but consistency matters.

**Pick one and use it everywhere:**
- Organization schema `url`
- WebSite schema `url`
- Homepage canonical tag
- Sitemap.xml entry
- All internal links to home

Mixing `https://montaic.com` and `https://montaic.com/` can confuse authority consolidation.

**My recommendation:** Use `https://montaic.com` (no trailing slash) everywhere. It's cleaner in displays and matches how people actually type domain names.

---

## The `max-image-preview:large` detail

This is the one non-obvious part of the robots meta:

```html
<meta name="robots" content="index, follow, max-image-preview:large" />
```

The `max-image-preview:large` directive tells Google (and, increasingly, AI engines) that they can use large preview images from your pages in search results and AI citations. Without it, Google defaults to smaller thumbnail previews.

This is a free win. Add it site-wide.

---

## Validation

After deploying:

1. Open each fixed page in incognito
2. View source and grep for `rel="canonical"` — should be present
3. Grep for `name="robots"` — should be present
4. Check [Google Search Console](https://search.google.com/search-console) → URL Inspection tool → paste the URL → verify canonical is recognized
5. Monitor Coverage report over the next 2-3 weeks for any "Duplicate without user-selected canonical" warnings — those would indicate issues

---

## Effort estimate

- Homepage canonical + robots: 2 min
- Pricing canonical + robots: 2 min
- Free-grader canonical + robots: 2 min
- Blog post canonical template: 5 min (applies to all 55 posts at once)
- Deploy: 2 min
- Validate: 5 min

**Total: ~20 minutes for full canonical coverage across the site.**

This is the highest impact-to-effort ratio fix in the entire kit. If you do nothing else this week, do this one.
