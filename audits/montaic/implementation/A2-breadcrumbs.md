# A2 — BreadcrumbList Schema

**What it does:** Tells Google and AI engines the hierarchy of every page on Montaic. Currently zero breadcrumbs exist anywhere on the site, despite Montaic having a clean `home > tools > mls-description-generator` style taxonomy across 222 URLs.

**Where it goes:** Per-page, inside each page's head. Can be server-rendered from the URL path or the site's navigation tree.

**Time to implement:** 20 minutes for the template + 5 min per page type to wire it up.

**Impact:** High. Breadcrumbs are rich results in Google SERPs, and AI engines use them heavily to understand site structure.

---

## The templated function

This is a small utility function that takes a path and generates the correct BreadcrumbList schema. Drop into a utility file (e.g., `lib/schema.ts` in Next.js) and call from every page template.

```typescript
// lib/schema.ts

type BreadcrumbItem = {
  name: string;
  path: string;
};

const BASE_URL = "https://montaic.com";

/**
 * Generate BreadcrumbList JSON-LD schema for a page.
 * @param items  ordered list of breadcrumb items (without "Home")
 * @returns JSON-LD object to embed in a <script type="application/ld+json">
 */
export function breadcrumbSchema(items: BreadcrumbItem[]) {
  const crumbs = [
    { name: "Home", path: "" },
    ...items,
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": crumbs.map((c, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": c.name,
      "item": `${BASE_URL}${c.path ? "/" + c.path : ""}`,
    })),
  };
}
```

---

## How to use it per page type

### Tool page (e.g., `/tools/mls-description-generator`)

```typescript
import { breadcrumbSchema } from "@/lib/schema";

const crumbs = breadcrumbSchema([
  { name: "Tools", path: "tools" },
  { name: "MLS Description Generator", path: "tools/mls-description-generator" },
]);

// In the page's JSX:
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }}
/>
```

### Market page (e.g., `/markets/austin-tx`)

```typescript
const crumbs = breadcrumbSchema([
  { name: "Markets", path: "markets" },
  { name: "Austin, TX", path: "markets/austin-tx" },
]);
```

### Comparison page (e.g., `/compare/montaic-vs-chatgpt`)

```typescript
const crumbs = breadcrumbSchema([
  { name: "Compare", path: "compare" },
  { name: "Montaic vs ChatGPT", path: "compare/montaic-vs-chatgpt" },
]);
```

### Blog post (e.g., `/blog/best-ai-listing-description-generator`)

```typescript
const crumbs = breadcrumbSchema([
  { name: "Blog", path: "blog" },
  { name: "The Best AI Listing Description Generator (2026)", path: "blog/best-ai-listing-description-generator" },
]);
```

### Marine pages

Marine has its own namespace, so the breadcrumbs should reflect that:

```typescript
// /marine/ports/fort-lauderdale-fl
const crumbs = breadcrumbSchema([
  { name: "Marine", path: "marine" },
  { name: "Ports", path: "marine/ports" },
  { name: "Fort Lauderdale, FL", path: "marine/ports/fort-lauderdale-fl" },
]);
```

### Listing-type subpages (e.g., `/tools/listing-generator/luxury-homes`)

```typescript
const crumbs = breadcrumbSchema([
  { name: "Tools", path: "tools" },
  { name: "Listing Generator", path: "tools/listing-generator" },
  { name: "Luxury Homes", path: "tools/listing-generator/luxury-homes" },
]);
```

---

## The shortcut: path-based auto-generation

If you don't want to manually add crumbs to every page, you can auto-generate from the URL path. This works for ~80% of cases and you can override for the outliers.

```typescript
// lib/schema.ts (auto-generate variant)

const SEGMENT_LABELS: Record<string, string> = {
  tools: "Tools",
  markets: "Markets",
  compare: "Compare",
  blog: "Blog",
  marine: "Marine",
  ports: "Ports",
  "vessel-types": "Vessel Types",
  "listing-generator": "Listing Generator",
};

function titleize(slug: string): string {
  if (SEGMENT_LABELS[slug]) return SEGMENT_LABELS[slug];
  return slug
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function breadcrumbSchemaFromPath(path: string, finalName?: string) {
  const segments = path.split("/").filter(Boolean);
  const items: BreadcrumbItem[] = segments.map((seg, i) => ({
    name: i === segments.length - 1 && finalName ? finalName : titleize(seg),
    path: segments.slice(0, i + 1).join("/"),
  }));
  return breadcrumbSchema(items);
}

// Usage:
const crumbs = breadcrumbSchemaFromPath(
  "tools/mls-description-generator",
  "MLS Description Generator"
);
```

The `finalName` parameter lets you override the last crumb with a nicer display name (e.g., "MLS Description Generator" instead of "Mls Description Generator").

---

## Connect to the root Organization

For the cleanest entity graph, breadcrumbs on each page can be wrapped in the same `@graph` structure as the root schema so they reference the root Organization. But this isn't strictly required — BreadcrumbList works standalone too.

If you want to wrap everything into `@graph`, you can extend the page's schema block like this:

```typescript
const pageSchema = {
  "@context": "https://schema.org",
  "@graph": [
    breadcrumbSchema([...]),
    softwareApplicationSchema(),  // from A5
    howToSchema(),                 // from A3 (tool pages)
    // etc.
  ],
};
```

But a simpler approach is just to ship each schema as its own `<script>` tag in the head. Google and AI engines handle both patterns fine.

---

## Validation checklist

After deploying on one test page:

1. Right-click → View Source → search for `"@type":"BreadcrumbList"`
2. Paste the block into [Rich Results Test](https://search.google.com/test/rich-results)
3. Should see "Breadcrumbs" detected with the right hierarchy
4. Test on at least one page from each category: `/tools/*`, `/markets/*`, `/compare/*`, `/blog/*`, `/marine/*`
5. Google Search Console → Enhancements → Breadcrumbs should eventually show indexed breadcrumbs (takes 1-2 weeks after deploy)

---

## Effort estimate

- Write the utility function: 5 min
- Wire it up to tool pages (one template): 5 min
- Wire up market pages: 5 min
- Wire up compare pages: 5 min
- Wire up blog posts: 10 min (blog post names need to match their actual titles)
- Wire up marine pages: 5 min
- Deploy + validate: 5 min

**Total: ~40 minutes for every page type on the site.**

All 222 URLs become breadcrumb-enabled in one push.
