# A3 — HowTo Schema for Tool Pages

**What it does:** Marks up the tool pages (MLS Description Generator, Fact Sheet Generator, etc.) as structured how-to guides. AI engines preferentially cite HowTo-marked content when answering "how do I..." queries.

**Where it goes:** On every page under `/tools/*` and `/free-listing-generator`. That's 25+ tool pages and 27+ listing-type variants.

**Time to implement:** 30 minutes to build the template, 5-10 min per tool page to wire in specifics.

**Impact:** High. This is the single biggest AEO citation hook for informational queries like "how to write an MLS listing description."

---

## Why this specifically matters for Montaic

The keyword report flagged informational queries ("how to write an MLS listing description," "how long should a listing description be," "how to use AI for real estate listings") as Cluster D — the AEO gold mine. These queries get answered by ChatGPT and Perplexity more often than they get clicked. Pages with HowTo schema get cited preferentially because the model already has pre-structured steps to quote.

Montaic's tool pages naturally describe a process ("enter details → pick voice → generate → review"). They're perfect HowTo candidates. They just aren't marked up as such.

---

## The templated function

```typescript
// lib/schema.ts (addition)

type HowToStep = {
  name: string;
  text: string;
  image?: string;
};

type HowToInput = {
  slug: string;          // e.g. "mls-description-generator"
  title: string;         // e.g. "How to generate an MLS listing description with Montaic"
  description: string;
  totalTime: string;     // ISO 8601 duration, e.g. "PT30S" = 30 seconds
  steps: HowToStep[];
  outputImage?: string;  // URL of a sample output screenshot
};

export function howToSchema(input: HowToInput) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": `https://montaic.com/tools/${input.slug}#howto`,
    "name": input.title,
    "description": input.description,
    "totalTime": input.totalTime,
    "supply": [
      {"@type": "HowToSupply", "name": "Property details (address, bed/bath, square footage, features)"}
    ],
    "tool": [
      {"@type": "HowToTool", "name": "Montaic"}
    ],
    "step": input.steps.map((s, i) => ({
      "@type": "HowToStep",
      "position": i + 1,
      "name": s.name,
      "text": s.text,
      ...(s.image ? {"image": s.image} : {}),
    })),
    ...(input.outputImage ? {"image": input.outputImage} : {}),
    "inLanguage": "en-US",
    "mainEntityOfPage": `https://montaic.com/tools/${input.slug}`,
  };
}
```

---

## Sample: MLS Description Generator

```typescript
const mlsHowTo = howToSchema({
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
});
```

---

## Sample: Social Media Generator

```typescript
const socialHowTo = howToSchema({
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
      text: "Select which platforms you want content for (Instagram post, Instagram caption, Facebook post, LinkedIn update) and how many variants of each.",
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
});
```

---

## Sample: Fact Sheet Generator

```typescript
const factSheetHowTo = howToSchema({
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
});
```

---

## Priority deployment order

You have 25+ tool pages. Not all are equally important. Wire HowTo schema up in this order:

1. **`/tools/mls-description-generator`** — highest-volume query, most valuable
2. **`/free-listing-generator`** — zero schema currently, biggest gap
3. **`/tools/real-estate-social-media-generator`** — high-intent
4. **`/tools/property-fact-sheet-generator`** — differentiated (nobody else does this)
5. **`/tools/commercial-real-estate-listing-generator`** — high commercial intent, low competition
6. **`/tools/fair-housing-compliance-checker`** — aligned with positioning pivot
7. Remaining 20 tool pages — can be batched over 1-2 weeks

For the 25+ listing-type variants under `/tools/listing-generator/*` (luxury-homes, waterfront-properties, etc.), they can share a templated HowTo with the property type substituted in. One template, 25 applications.

---

## Validation

After deploying on the first tool page:

1. [Rich Results Test](https://search.google.com/test/rich-results) → should detect HowTo with correct step count
2. Check that `totalTime` is in ISO 8601 format (`PT30S` = 30 seconds, `PT1M` = 1 minute)
3. If using the `image` field on steps, make sure the images actually exist at those URLs
4. Monitor Google Search Console → Enhancements → HowTo in 2-3 weeks for indexed HowTo pages

---

## Effort estimate

- Write the utility function: 10 min
- Write the first full HowTo object (MLS generator): 15 min (including copy polish)
- Apply to the top 5 priority tool pages: 45 min
- Template for the 25 listing-type variants: 20 min
- Batch the remaining 20 tool pages: 1-2 hours

**Total for the top 5 pages: ~70 minutes.**
**Total for full coverage across all tool pages: ~3-4 hours.**

You can do the top 5 today and batch the rest next week. The top 5 alone will unlock the informational query AEO cluster.
