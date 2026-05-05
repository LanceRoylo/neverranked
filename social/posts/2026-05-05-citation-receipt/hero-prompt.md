# Visual brief — citation receipts (five engines)

## Concept

A row of five "citation cards," one per engine. Each card shows
the engine name, the prompt that was asked, the answer, and a
status tag. The visual format we built for the Stitch
explorations — receipts as the centerpiece. This is the strongest
visual format Never Ranked has.

## Layout

- IG: 1080 × 1350 (vertical, fits five stacked cards)
- LinkedIn carousel: 1200 × 1500 each, five separate slides (one
  card per slide), or a single 1200 × 1500 with all five stacked

## Composition

Top of card: Barlow Condensed eyebrow, ALL CAPS, gold
`#e8c767`: `WHAT WE TRACK · MAY 2026`

Center: Playfair italic, gold mid-sentence emphasis:
`Five engines. *One answer.* You are cited or you are invisible.`

Below, FIVE small cards in a vertical stack (or horizontal row
on LinkedIn carousel):

```
┌──────────────────────────────────────────┐
│ [ENGINE WORDMARK in Playfair]            │
│                                          │
│ PROMPT                                   │
│ "best gift wrapping in orlando"          │ <- mono, quoted
│                                          │
│ ANSWER                                   │
│ Three local services were named.         │ <- mono, 2 sentences
│ Cited domain: papergoatpost.com.         │ <- gold underline
│                                          │
│ [CITED] or [MISSING]                     │ <- bottom tag
└──────────────────────────────────────────┘
```

Card border: 1px gold-wash hairline. Background: subtle gold-wash
tint (`rgba(232,199,103,.04)`).

Five cards: ChatGPT (cited), Perplexity (missing), Gemini (cited),
Google AI Overviews (missing), Claude (cited). Mix the tags so
the visitor sees the binary outcome.

Bottom of post: Barlow eyebrow gold: `CHECK.NEVERRANKED.COM`

## Visual rules

- No emojis. No clip-art. No engine logos that need licensing.
  Use Playfair italic engine names instead.
- Type carries the message. No illustrations.
- Cards should feel like printed financial filings, not SaaS
  feature cards. Restraint over decoration.

## Reusability

Save this as the template. Every future receipts post is the same
visual with different prompt, different domains, different mix of
CITED / MISSING. The format is the brand asset.

## Generation

Stitch prompt: paste this entire file. Specify `MOBILE` for the
IG vertical, `DESKTOP` for the LinkedIn carousel.
