# A5 — SoftwareApplication + AggregateRating

**What it does:** Marks Montaic up as a rated software product. This is the single biggest AI-citation trust signal — when ChatGPT or Perplexity are asked "is Montaic any good," they cite pages with explicit ratings more often than unrated ones.

**Where it goes:** On the homepage, pricing page, and every comparison page. Currently SoftwareApplication exists on home and pricing, but WITHOUT aggregateRating.

**Time to implement:** 20 minutes for the template + 1-2 hours to collect real reviews.

**Impact:** HIGH, gated on collecting real reviews first.

---

## Critical prerequisite: real reviews

**Don't fake ratings.** Schema ratings with no backing reviews is one of the few schema patterns Google actively penalizes if detected, and AI engines will eventually cross-check aggregate ratings against platforms like Capterra and G2.

Before you deploy AggregateRating schema, you need at least **5 real reviews** from actual Montaic users. Ideally 10+. Each review should be:
- From a verifiable real person (LinkedIn-verifiable agent ideally)
- Specific enough to be credible (mentions at least one feature or outcome)
- Star-rated 1-5 or numeric
- Stored somewhere auditable (a reviews table in your DB, a Notion doc, a Capterra profile, etc.)

**How to collect them this week:**

1. Email every paying Pro/Broker customer today with a 2-minute review ask:

```
Subject: 2 minutes — honest Montaic feedback

Hi [name],

I'm asking 10 Montaic users for honest 2-minute feedback and yours matters to me.

Could you answer just these:

  1. Star rating 1-5
  2. One sentence on what Montaic has been useful for
  3. One sentence on what's annoying or missing

No sugarcoating. I want the real answers.

If it's easier, reply with voice memo.

Thanks,
Lance
```

2. Aim for 5-10 responses in 72 hours
3. Any rating below 4 is VALUABLE — address the issue, then ask if you can publish with their edit

Once you have the reviews, store them in a `reviews/` folder as individual `.md` files with frontmatter (name, rating, date, verified). Don't inline them into schema directly — you'll want to regenerate aggregate ratings as new reviews come in.

---

## The schema block (once you have reviews)

```typescript
// lib/schema.ts (addition)

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
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": "https://montaic.com/#software",
    "name": "Montaic",
    "applicationCategory": "BusinessApplication",
    "applicationSubCategory": "Content Generation",
    "operatingSystem": "Web",
    "url": input.url || "https://montaic.com",
    "description": "AI-native listing content platform for real estate professionals. MLS descriptions, social posts, fact sheets, and marketing copy in your writing style, with Fair Housing compliance scanning built in.",
    "publisher": {"@id": "https://montaic.com/#organization"},
    "offers": [
      {
        "@type": "Offer",
        "name": "Free",
        "price": "0",
        "priceCurrency": "USD",
        "description": "3 listings with MLS descriptions and Fair Housing screening. No credit card required.",
        "availability": "https://schema.org/InStock"
      },
      {
        "@type": "Offer",
        "name": "Pro",
        "price": "149",
        "priceCurrency": "USD",
        "description": "Unlimited listings, all content types, writing style calibration, comp analysis, positioning briefs, fact sheets, AI follow-ups.",
        "availability": "https://schema.org/InStock",
        "priceSpecification": {
          "@type": "UnitPriceSpecification",
          "price": "149",
          "priceCurrency": "USD",
          "unitCode": "MON",
          "referenceQuantity": {"@type": "QuantitativeValue", "value": 1}
        }
      },
      {
        "@type": "Offer",
        "name": "Broker",
        "price": "299",
        "priceCurrency": "USD",
        "description": "Everything in Pro plus writing style cloning, commercial property compliance, team seats, priority support.",
        "availability": "https://schema.org/InStock",
        "priceSpecification": {
          "@type": "UnitPriceSpecification",
          "price": "299",
          "priceCurrency": "USD",
          "unitCode": "MON",
          "referenceQuantity": {"@type": "QuantitativeValue", "value": 1}
        }
      }
    ],
    "featureList": [
      "MLS-compliant listing descriptions",
      "Writing style calibration",
      "Fair Housing compliance scanning",
      "Character-limit aware output",
      "Social media content generation",
      "Property fact sheet PDFs",
      "Commercial real estate support",
      "Voice-cloned output (Broker tier)"
    ],
    "screenshot": "https://montaic.com/og/product-screenshot.png",
    "softwareVersion": "2026.1",
  };

  if (count > 0) {
    base.aggregateRating = {
      "@type": "AggregateRating",
      "ratingValue": avg.toFixed(1),
      "bestRating": "5",
      "worstRating": "1",
      "reviewCount": count,
      "ratingCount": count,
    };
  }

  if (input.includeIndividualReviews && count > 0) {
    base.review = reviews.slice(0, 5).map(r => ({
      "@type": "Review",
      "author": {"@type": "Person", "name": r.name},
      "datePublished": r.date,
      "reviewBody": r.body,
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": r.rating.toString(),
        "bestRating": "5",
        "worstRating": "1",
      },
    }));
  }

  return base;
}
```

---

## Usage

On the homepage and pricing page:

```typescript
import reviews from "@/data/reviews.json";

const softwareSchema = softwareApplicationSchema({
  reviews,
  includeIndividualReviews: true,  // embed top 5 review objects on home/pricing
});
```

On comparison pages (`/compare/montaic-vs-chatgpt` etc.), use the same function but don't include individual reviews (the schema is just for entity recognition):

```typescript
const softwareSchema = softwareApplicationSchema({
  url: "https://montaic.com/compare/montaic-vs-chatgpt",
  reviews,
  includeIndividualReviews: false,
});
```

---

## Store reviews as structured data

Create `data/reviews.json` with your real reviews:

```json
[
  {
    "name": "Sarah Chen",
    "rating": 5,
    "body": "I was skeptical about AI for listings but Montaic actually sounds like me. Saves me 2-3 hours per listing and the Fair Housing check caught something I would have missed.",
    "date": "2026-03-15",
    "verified": true
  },
  {
    "name": "Marcus Delgado",
    "rating": 4,
    "body": "Great for standard residential. Wish it had better support for commercial listings but Broker tier is supposed to fix that.",
    "date": "2026-03-20",
    "verified": true
  }
]
```

Keep this file in git. Every time a new real review comes in, add it. The aggregate rating updates automatically.

---

## What NOT to put in the schema

- **Made-up review counts.** "We have 5,000 users so let's show 5-star average of 100 reviews." No. Only list reviews you can produce on demand.
- **Employee reviews.** Won't pass a credibility audit.
- **AI-generated reviews.** Google and Perplexity both detect these now.
- **Reviews without specific use cases.** Generic "great product!" is worse than no reviews — it looks fake.

---

## What about existing users who haven't reviewed yet?

Two honest options:

**Option A — Show aggregate without reviewCount pressure.** If you only have 5 reviews, show `reviewCount: 5`. It's small but honest. AI engines will cite it as "early-stage product with strong reviews" which is still better than no rating.

**Option B — Use `interactionCount` instead of ratings (no-review variant).** If you don't have reviews yet but DO have real usage metrics, you can use `interactionStatistic`:

```json
"interactionStatistic": {
  "@type": "InteractionCounter",
  "interactionType": {"@type": "UseAction"},
  "userInteractionCount": 31000
}
```

This tells AI engines "31,000 agents have used this" without needing reviews. But only use this if you can back up the number. It's also what ListingAI appears to be doing.

---

## Effort estimate

- Write the utility function: 15 min
- Write review-collection email + send: 15 min
- Wait 24-72 hours for responses: 0 active time
- Add reviews to `data/reviews.json`: 15 min
- Deploy schema on home + pricing + compare pages: 20 min
- Validate: 5 min

**Total active time: ~70 min. Calendar time: 2-3 days** (bottlenecked on review collection).

The review-collection step is the critical path. Start it TODAY even if you don't deploy the schema until next week. Every day without real reviews is a day you can't honestly add AggregateRating.
