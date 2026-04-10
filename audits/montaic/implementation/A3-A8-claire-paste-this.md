# AEO Citations + Social Presence Bundle — A3 + A8

**For:** Claire (Montaic codebase)
**From:** Never Ranked side
**Deploy order:** A3 → A8 (HowTo schema first since it's pure metadata, then og:image which has a visual component)
**Total time:** ~120 minutes of actual work, plus deploy + validation

---

## Pre-flight

Confirm the full schema stack from previous bundles is intact:

```bash
# Root Organization (A1)
curl -s https://montaic.com/ | grep -o '"@id":"https://montaic.com/#organization"'

# BreadcrumbList (A2)
curl -s https://montaic.com/tools/mls-description-generator | grep -o '"@type":"BreadcrumbList"'

# ProfilePage on agent pages (A1.6)
curl -s https://montaic.com/agents/ | head -c 500 | grep -o '"@type":"ProfilePage"'

# Canonical tags (A7)
curl -s https://montaic.com/ | grep -o 'rel="canonical"'
```

All four should match. If any are missing, stop and flag before continuing.

---

## A3 — HowTo Schema for Top 5 Tool Pages (60 minutes)

**Context:** Montaic's tool pages describe a natural step-by-step process ("enter details, pick voice, generate, review") but aren't marked up as HowTo. AI engines preferentially cite HowTo-marked content when answering "how do I..." queries. The keyword report flagged informational queries like "how to write an MLS listing description" as the AEO gold mine — these get answered by ChatGPT and Perplexity more often than they get clicked. HowTo schema is the citation hook.

### A3.1 — Create the HowTo utility

**File:** `lib/schema.ts` (same file where `breadcrumbSchema` and `breadcrumbSchemaFromPath` live from A2)

Add this:

```ts
type HowToStep = {
  name: string;
  text: string;
};

type HowToInput = {
  slug: string;
  title: string;
  description: string;
  totalTime: string; // ISO 8601 duration: "PT30S" = 30 seconds, "PT1M" = 1 minute
  steps: HowToStep[];
};

export function howToSchema(input: HowToInput) {
  return {
    "@type": "HowTo",
    "@id": `https://montaic.com/tools/${input.slug}#howto`,
    name: input.title,
    description: input.description,
    totalTime: input.totalTime,
    supply: [
      {
        "@type": "HowToSupply",
        name: "Property details (address, bed/bath, square footage, features)",
      },
    ],
    tool: [{ "@type": "HowToTool", name: "Montaic" }],
    step: input.steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
    inLanguage: "en-US",
    mainEntityOfPage: `https://montaic.com/tools/${input.slug}`,
  };
}
```

**Note:** This function returns an object without `"@context"`. If you're adding it to an existing `@graph` array, that's correct — the parent `@graph` block has the `@context`. If embedding as a standalone `<script type="application/ld+json">`, wrap it:

```ts
const standalone = {
  "@context": "https://schema.org",
  ...howToSchema({ ... }),
};
```

### A3.2 — Wire up the top 5 tool pages

Deploy in this order (highest value first):

#### 1. `/tools/mls-description-generator`

```ts
howToSchema({
  slug: "mls-description-generator",
  title: "How to Generate an MLS Listing Description with Montaic",
  description: "Generate a compliant, voice-matched MLS listing description in 30 seconds using Montaic's AI-native tool. No prompt engineering required.",
  totalTime: "PT30S",
  steps: [
    {
      name: "Enter the property details",
      text: "Input the property address, bedroom and bathroom count, square footage, year built, and any standout features. Montaic auto-pulls neighborhood and market context from your location.",
    },
    {
      name: "Select or upload your writing style",
      text: "Pick a saved writing style profile, or upload one of your past listings to calibrate the tone. Montaic learns your voice on the first upload and sharpens it with every use.",
    },
    {
      name: "Generate",
      text: "Montaic produces a complete MLS-compliant listing description in your writing style, automatically Fair Housing checked, in about 30 seconds. The output respects your MLS's character limit.",
    },
    {
      name: "Review, edit, and publish",
      text: "Edit any line inline, regenerate specific sections, or approve the output and copy it directly into your MLS system. Every generation is logged for your records.",
    },
  ],
})
```

#### 2. `/free-listing-generator`

**Note:** This page already has a HowTo from the A6 bundle. Check if it's present before adding a duplicate. If A6's HowTo is already there, **skip this page** — don't create a second HowTo on the same URL.

```bash
curl -s https://montaic.com/free-listing-generator | grep -o '"@type":"HowTo"'
```

If it returns a match, move to page 3. If not, add:

```ts
howToSchema({
  slug: "../free-listing-generator", // adjust the @id URL accordingly
  title: "How to Grade Your MLS Listing Description for Free",
  description: "Paste your existing listing description and get an instant quality score with actionable feedback in 10 seconds.",
  totalTime: "PT10S",
  steps: [
    {
      name: "Paste your listing description",
      text: "Copy your current MLS listing description and paste it into the grader input field.",
    },
    {
      name: "Click Grade",
      text: "Montaic analyzes your description against readability, keyword coverage, Fair Housing compliance, and emotional engagement benchmarks.",
    },
    {
      name: "Review your score and feedback",
      text: "Get a detailed score breakdown with specific, actionable suggestions for improving each section of your listing.",
    },
  ],
})
```

#### 3. `/tools/real-estate-social-media-generator`

```ts
howToSchema({
  slug: "real-estate-social-media-generator",
  title: "How to Generate Real Estate Social Media Posts with Montaic",
  description: "Turn one listing into a full week of branded social content across Instagram, Facebook, and LinkedIn in about a minute.",
  totalTime: "PT1M",
  steps: [
    {
      name: "Enter the listing details or paste your MLS description",
      text: "Start from a new listing or paste your existing MLS copy. Montaic extracts the key selling points and property features automatically.",
    },
    {
      name: "Choose the platforms and post types",
      text: "Select which platforms you want content for (Instagram, Facebook, LinkedIn) and how many variants of each.",
    },
    {
      name: "Generate",
      text: "Montaic produces platform-appropriate posts with correct character limits, hashtag suggestions, and your writing style applied to each.",
    },
    {
      name: "Review and schedule",
      text: "Edit any post inline, save to your content library, or copy directly to your scheduling tool.",
    },
  ],
})
```

#### 4. `/tools/property-fact-sheet-generator`

```ts
howToSchema({
  slug: "property-fact-sheet-generator",
  title: "How to Create a Property Fact Sheet PDF with Montaic",
  description: "Generate an institutional-grade one-page property fact sheet in PDF format from a single listing input.",
  totalTime: "PT45S",
  steps: [
    {
      name: "Enter the listing and upload photos",
      text: "Input the property details and upload the hero image and up to 5 supporting photos. Montaic handles layout and sizing.",
    },
    {
      name: "Pick a template",
      text: "Choose from residential, luxury, commercial, or minimal templates. Each is designed for print and screen, with your branding applied.",
    },
    {
      name: "Generate the PDF",
      text: "Montaic produces a designed one-page PDF fact sheet with property details, photos, and your contact block. Ready to email or print.",
    },
    {
      name: "Download or share",
      text: "Download the PDF, share via a branded link, or add it to the listing's marketing package automatically.",
    },
  ],
})
```

#### 5. `/tools/commercial-real-estate-listing-generator`

```ts
howToSchema({
  slug: "commercial-real-estate-listing-generator",
  title: "How to Generate a Commercial Real Estate Listing with Montaic",
  description: "Generate institutional-quality commercial property descriptions covering cap rate, NOI, tenant mix, and investment highlights.",
  totalTime: "PT45S",
  steps: [
    {
      name: "Enter the commercial property details",
      text: "Input the property type, square footage, cap rate, NOI, tenant information, and any investment highlights or value-add opportunities.",
    },
    {
      name: "Select the listing format",
      text: "Choose between LoopNet-style, CoStar-style, or custom format. Each output is optimized for the platform's character limits and search ranking.",
    },
    {
      name: "Generate",
      text: "Montaic produces a complete commercial listing description with financial highlights, property features, and location context in about 45 seconds.",
    },
    {
      name: "Review and publish",
      text: "Edit inline, regenerate specific sections, or copy directly to your listing platform.",
    },
  ],
})
```

### A3.3 — Embedding approach

For each tool page, add the HowTo to the page's JSON-LD. Two options depending on what exists:

**If the page already has a `@graph` array** (e.g., from A2 breadcrumbs or A1.5 publisher references):

```tsx
const pageSchema = {
  "@context": "https://schema.org",
  "@graph": [
    breadcrumbSchemaFromPath("tools/mls-description-generator", "MLS Description Generator"),
    howToSchema({ slug: "mls-description-generator", ... }),
    // any other existing schema objects
  ],
};

<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }}
/>
```

**If the page has separate `<script>` tags for each schema**, add a new one:

```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify({
      "@context": "https://schema.org",
      ...howToSchema({ slug: "mls-description-generator", ... }),
    })
  }}
/>
```

Either approach works. Be consistent with whatever pattern the page already uses.

### A3 validation

After deploying:

```bash
# MLS description generator
curl -s https://montaic.com/tools/mls-description-generator | grep -o '"@type":"HowTo"'

# Social media generator
curl -s https://montaic.com/tools/real-estate-social-media-generator | grep -o '"@type":"HowTo"'

# Fact sheet generator
curl -s https://montaic.com/tools/property-fact-sheet-generator | grep -o '"@type":"HowTo"'

# Commercial listing generator
curl -s https://montaic.com/tools/commercial-real-estate-listing-generator | grep -o '"@type":"HowTo"'
```

All four should match (the free-listing-generator may already have HowTo from A6 — confirm but don't duplicate). Then paste each URL into the [Rich Results Test](https://search.google.com/test/rich-results) and confirm "How-to" is detected with the correct step count (4 steps each).

---

## A8 — og:image Generation (60 minutes)

**Context:** Only the homepage currently has an og:image. The other 221 pages ship blank social previews on LinkedIn, Twitter, iMessage, Slack, and every AI engine that displays citation thumbnails. This is a compounding visibility loss every time anyone shares a Montaic URL.

### A8.1 — Create the OG image route

**Approach:** Use `@vercel/og` (or `next/og` if on Next.js 14+) to generate branded PNG images on-demand from URL parameters. One route serves every page.

**Install:**

```bash
npm install @vercel/og
```

(If already available via `next/og`, skip the install.)

**File:** `app/og/route.tsx` (or `app/api/og/route.tsx` depending on your App Router structure)

```tsx
import { ImageResponse } from "next/og";
// or: import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") || "Montaic";
  const subtitle =
    searchParams.get("subtitle") || "AI-native listing content";
  const category = searchParams.get("type") || "default";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          background: "#0b0b0f",
          padding: "80px",
          color: "#f0ece3",
        }}
      >
        {/* top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "22px",
            textTransform: "uppercase",
            letterSpacing: "4px",
            color: "#8a8a8a",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                width: "10px",
                height: "10px",
                background: "#c9a84c",
                borderRadius: "50%",
                marginRight: "14px",
              }}
            />
            Montaic
          </div>
          <div>{category}</div>
        </div>

        {/* title block */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: "88px",
              lineHeight: "0.95",
              letterSpacing: "-0.02em",
              fontStyle: "italic",
              color: "#f0ece3",
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: "34px",
                marginTop: "28px",
                color: "#c9a84c",
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {/* footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "20px",
            color: "#8a8a8a",
          }}
        >
          <div>montaic.com</div>
          <div>AI-native listing platform</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
```

**Test immediately after creating the route:**

```
http://localhost:3000/og?title=MLS+Description+Generator&subtitle=AI-drafted+listing+copy+in+30+seconds&type=tool
```

Should render a branded 1200x630 PNG with the title in large italic text, the gold subtitle, the Montaic wordmark top-left, and the category label top-right.

### A8.2 — Wire into page metadata

For each page type, add the OG image URL to the `generateMetadata` function (or static `metadata` export). The OG route accepts `title`, `subtitle`, and `type` params.

**Tool pages** (`app/tools/[slug]/page.tsx`):

```ts
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // ... existing metadata logic ...
  return {
    // ... existing fields ...
    openGraph: {
      // ... existing openGraph fields ...
      images: [
        {
          url: `https://montaic.com/og?title=${encodeURIComponent(toolTitle)}&subtitle=${encodeURIComponent(toolSubtitle)}&type=tool`,
          width: 1200,
          height: 630,
          alt: toolTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      images: [
        `https://montaic.com/og?title=${encodeURIComponent(toolTitle)}&subtitle=${encodeURIComponent(toolSubtitle)}&type=tool`,
      ],
    },
  };
}
```

**Market pages:**
```ts
url: `https://montaic.com/og?title=${encodeURIComponent(marketName)}&subtitle=${encodeURIComponent("Real estate market data")}&type=market`
```

**Blog posts:**
```ts
url: `https://montaic.com/og?title=${encodeURIComponent(postTitle)}&subtitle=${encodeURIComponent("Montaic Blog")}&type=blog`
```

**Compare pages:**
```ts
url: `https://montaic.com/og?title=${encodeURIComponent(compareTitle)}&subtitle=${encodeURIComponent("Side-by-side comparison")}&type=compare`
```

**Agent pages:**
```ts
url: `https://montaic.com/og?title=${encodeURIComponent(agentName)}&subtitle=${encodeURIComponent(agentTitle || "Real Estate Agent")}&type=agent`
```

**Static pages** (pricing, free-listing-generator, fair-housing-compliance-checker):
```ts
url: `https://montaic.com/og?title=Pricing&subtitle=Free+to+start.+Pro+at+%24149%2Fmo.&type=pricing`
url: `https://montaic.com/og?title=Free+Listing+Grader&subtitle=Grade+your+MLS+copy+in+10+seconds&type=free-tool`
url: `https://montaic.com/og?title=Fair+Housing+Compliance+Checker&subtitle=Instant+Fair+Housing+Act+review&type=tool`
```

### A8.3 — Helper function (optional convenience)

To reduce boilerplate across pages, add a helper to `lib/schema.ts` or a new `lib/og.ts`:

```ts
const BASE_URL = "https://montaic.com";

export function ogImageUrl(title: string, subtitle: string, type: string) {
  return `${BASE_URL}/og?title=${encodeURIComponent(title)}&subtitle=${encodeURIComponent(subtitle)}&type=${encodeURIComponent(type)}`;
}

export function ogMetadata(title: string, subtitle: string, type: string) {
  const url = ogImageUrl(title, subtitle, type);
  return {
    openGraph: {
      images: [{ url, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image" as const,
      images: [url],
    },
  };
}
```

Then in any page:

```ts
import { ogMetadata } from "@/lib/og";

export const metadata: Metadata = {
  title: "MLS Description Generator",
  ...ogMetadata("MLS Description Generator", "AI-drafted listing copy in 30 seconds", "tool"),
};
```

### A8 validation

After deploying:

```bash
# Check the OG route directly
curl -s -o /dev/null -w "status=%{http_code} content-type=%{content_type}\n" "https://montaic.com/og?title=Test&subtitle=Test&type=test"
# Expected: status=200, content-type=image/png

# Check that tool page metadata includes og:image
curl -s https://montaic.com/tools/mls-description-generator | grep -o 'og:image'
curl -s https://montaic.com/tools/mls-description-generator | grep -o 'twitter:card'

# Check that blog post has og:image
curl -s https://montaic.com/blog/best-ai-listing-description-generator | grep -o 'og:image'
```

Then validate visually:
1. **LinkedIn Post Inspector** — https://www.linkedin.com/post-inspector/ — paste a Montaic URL, confirm branded image renders
2. **Twitter Card Validator** — https://cards-dev.twitter.com/validator — same check
3. Test at least one URL from each page type (tool, market, blog, compare, agent)

---

## Full deploy sequence

1. Deploy A3 (HowTo utility function + top 5 tool pages)
2. Validate A3 via Rich Results Test on each tool page
3. Deploy A8 (OG image route + metadata wiring)
4. Validate A8 via LinkedIn Post Inspector on at least 3 page types

---

## Known risks

- **Free-listing-generator already has HowTo from A6.** Check before adding. Do NOT create a duplicate HowTo on the same page.
- **`@vercel/og` font loading:** The default system fonts may not include Playfair Display or DM Mono. The image will still render with fallback fonts (serif, monospace). For exact brand fonts, you'd need to load font files via the `fonts` option in `ImageResponse` — this is a polish step, not a blocker. Ship with system fonts first.
- **OG image caching:** Social platforms aggressively cache OG images. If you update the route's design after sharing a URL, the old image may persist on LinkedIn/Twitter for hours. Use `?v=2` or similar cache-busting param if needed during development.
- **`runtime = "edge"` requirement:** The OG image route must run at the edge for Satori (the rendering engine) to work. Make sure the file exports `export const runtime = "edge"`.

---

## Out of scope

- **A4** — BlogPosting schema upgrade (hero image, keywords, word count). Next bundle.
- **A5** — SoftwareApplication + AggregateRating (gated on collecting reviews).
- **A10** — Entity registration (Wikidata, Crunchbase, etc.). Off-site work.
- **A11** — Fair Housing pillar article. Content work.
- **Remaining 20+ tool page HowTos** — The top 5 unlock 80% of the AEO citation value. The long tail can be batched in a follow-up pass using the same utility function.

---

## When you're done

Save the validation output for:
- Rich Results Test on at least 3 of the 5 tool pages (should show "How-to" with 4 steps each)
- LinkedIn Post Inspector screenshot on at least 1 tool page and 1 blog post (should show branded image)
- OG route returning 200 with `content-type: image/png`

Then tell Lance:

> "A3 and A8 deployed and validated. [X] tool pages have HowTo schema, og:image route live across all page types. 0 errors. Returned to Claude."

---

## Questions?

If tool page URLs or component paths differ from what I assumed, adapt accordingly. The HowTo schema *shape* and the OG image route *pattern* are what matter — how they're wired into the specific codebase is up to you. If any tool page has a significantly different user flow than the 4-step pattern above, adjust the steps to match reality.
