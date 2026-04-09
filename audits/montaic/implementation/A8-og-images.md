# A8 — og:image Generation (Site-wide)

**What it does:** Ensures every page on Montaic has a proper OpenGraph image for social shares and AI engine thumbnails. Currently only the homepage has one; the other 221 pages are shipping blank previews.

**Where it goes:** Every page type. Implemented once as a template system; applied automatically to every URL.

**Time to implement:** 2-3 hours for the full automated system, 30 minutes for a manual fallback that covers the top 10 pages.

**Impact:** HIGH. Blank og:images mean blank social previews on LinkedIn, Twitter, iMessage, Slack, Facebook, and every AI engine that displays a thumbnail beside its citation.

---

## Three approaches, pick one based on stack

### Approach 1 — `@vercel/og` (if you're on Vercel or Next.js)

This is the ideal approach. `@vercel/og` is a library that generates PNG images on-demand using JSX + Satori (browser-compatible layout engine). Zero design work, fully templated, instant generation.

**Install:**
```bash
npm install @vercel/og
```

**Create `app/og/[type]/route.tsx`:**

```typescript
import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") || "Montaic";
  const subtitle = searchParams.get("subtitle") || "AI-native listing content";
  const type = searchParams.get("type") || "default";

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
          fontFamily: "Playfair Display",
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
            fontFamily: "Barlow Condensed",
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
          <div>§ {type}</div>
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
                fontFamily: "DM Mono",
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
            fontFamily: "DM Mono",
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
    }
  );
}
```

**Usage in page metadata:**

```typescript
// app/tools/mls-description-generator/page.tsx
export const metadata: Metadata = {
  openGraph: {
    images: [
      {
        url: `https://montaic.com/og/tool?title=${encodeURIComponent("MLS Description Generator")}&subtitle=${encodeURIComponent("AI-drafted listing copy in 30 seconds")}&type=${encodeURIComponent("tool")}`,
        width: 1200,
        height: 630,
        alt: "Montaic MLS Description Generator",
      },
    ],
  },
};
```

**Benefits:**
- Every page gets a unique, branded OG image with its own title
- Zero design work — images are templated JSX
- On-demand generation, no pre-rendering
- Cached by Vercel edge network after first generation
- Runs in ~50ms per image

---

### Approach 2 — Static pre-generation at build time

If you're not on Vercel or want to avoid runtime generation, you can generate OG images as static PNGs at build time using a Node script.

```typescript
// scripts/generate-og-images.ts
import { ImageResponse } from "next/og";
import fs from "fs/promises";
import path from "path";

const pages = [
  { slug: "", title: "Montaic", subtitle: "Your next listing, ready in 30 seconds", type: "home" },
  { slug: "pricing", title: "Pricing", subtitle: "Free to start. Pro at $149/mo.", type: "pricing" },
  { slug: "free-listing-generator", title: "Free Listing Grader", subtitle: "Grade your MLS copy in 10 seconds", type: "free-tool" },
  // ... all 222 pages
];

async function generateAll() {
  for (const page of pages) {
    const image = new ImageResponse(
      // same JSX as Approach 1
      // ...
    );
    const buffer = await image.arrayBuffer();
    const filePath = path.join("public", "og", `${page.slug || "home"}.png`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from(buffer));
    console.log(`Generated: ${filePath}`);
  }
}

generateAll();
```

Run once per deploy. OG images are committed to `/public/og/` as static PNGs.

**Benefits:** No runtime cost, works on any hosting, images are deterministic.
**Tradeoff:** You have to re-run the script whenever page titles change.

---

### Approach 3 — Manual templated images (fastest short-term fix)

If you need something shipped today and can come back for automation later, create **one** branded OG image per page TYPE (not per page):

- `og-home.png` — for the homepage
- `og-tool.png` — for all 25+ tool pages (generic)
- `og-market.png` — for all 50+ city pages (generic)
- `og-compare.png` — for all 8 compare pages
- `og-blog.png` — for all 55 blog posts
- `og-marine.png` — for all marine pages

Then point pages by type at the appropriate image:

```typescript
// app/tools/[slug]/page.tsx
export const metadata: Metadata = {
  openGraph: {
    images: [{
      url: "https://montaic.com/og-tool.png",
      width: 1200,
      height: 630,
    }],
  },
};
```

**This is worse than Approaches 1 and 2** because every tool page shares the same image — but it's **100x better than blank previews**, and it can ship in 30 minutes with a Figma session.

---

## Image specs (regardless of approach)

- **Size:** 1200×630 pixels (Facebook/Twitter/LinkedIn standard, also used by Google and most AI engines)
- **Format:** PNG (preferred) or JPG
- **File size:** Under 300KB ideally, hard limit 1MB
- **Contrast:** High contrast typography, legible at small thumbnail sizes (Twitter shows OG images as small as 300×157)
- **Brand:** Wordmark + one distinctive color cue (Montaic should use its gold accent)
- **Title:** Short, 4-8 words max, uppercase or italic serif
- **Safe area:** Keep important content in the inner 1000×500 — some platforms crop the edges

---

## Meta tags to pair with the image

The OG image URL goes in two places in the `<head>`:

```html
<meta property="og:image" content="https://montaic.com/og/tools/mls-description-generator.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Montaic MLS Description Generator" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://montaic.com/og/tools/mls-description-generator.png" />
<meta name="twitter:image:alt" content="Montaic MLS Description Generator" />
```

If you're using Next.js `generateMetadata`, this gets generated automatically from the `openGraph` and `twitter` keys.

---

## Validation

After deploying:

1. **LinkedIn Post Inspector** — https://www.linkedin.com/post-inspector/ — paste any Montaic URL and see the preview. Should show your OG image.
2. **Twitter Card Validator** — https://cards-dev.twitter.com/validator — same check for Twitter.
3. **Facebook Sharing Debugger** — https://developers.facebook.com/tools/debug/ — same for Facebook.
4. **iMessage test** — paste a link into iMessage to a friend and check the preview renders.
5. Repeat for at least one page per type (home, tool, market, compare, blog).

---

## The single biggest win from this fix

Every time anyone shares a Montaic URL on LinkedIn, Twitter, iMessage, Slack, Facebook, or via AI engine citation with a thumbnail — the branded image appears. **Right now, 95% of those shares are blank.** After this fix, they're all branded.

The citation impact compounds: AI engines learn that pages on montaic.com have thumbnails, and those thumbnails start appearing in Perplexity, Google AI Overview citation cards, and ChatGPT browse mode results.

---

## Effort estimate

**Approach 1 (`@vercel/og`):**
- Install + write the route: 45 min
- Wire up one page to test: 10 min
- Roll out to all page types: 30 min
- Deploy + validate: 15 min
- **Total: ~100 minutes**

**Approach 2 (static build-time):**
- Write the build script: 60 min
- First generation run: 5 min
- Wire into deploy pipeline: 15 min
- **Total: ~80 minutes**

**Approach 3 (manual per type):**
- Create 6 OG images in Figma or Canva: 20 min
- Upload to `/public/og/`: 5 min
- Wire up metadata templates: 20 min
- **Total: ~45 minutes**

**My recommendation:** Do Approach 3 today for a quick ship, then Approach 1 next week for the long-term solution. Don't let perfect block good.
