# Carousel slide specs (6 slides, 1080x1350 each)

Pure AEO category education. No client references. Rebuilt 2026-05-11 PM after the earlier draft leaned on Hawaii Theatre as proof; the client story is saved for the May 18 Citation Tape launch.

Shared visual system across all slides:

- Background: charcoal (#0a0908)
- Primary text: off-white (#fbf8ef)
- Accent (gold): #c9a84c
- Highlight gold: #e8c767
- Danger (red): #c5544a (sparingly, only on the "SEO" side of slide 2)
- Brand mark bottom-left: serif italic "Never Ranked" in gold
- Slide counter bottom-right: gold mono "1 / 6", "2 / 6", etc.

---

## Slide 1 - HOOK

**Purpose:** Earn the swipe. Single-frame frustration-release.

**Visual:** Mostly empty charcoal canvas. Lots of whitespace.

**Center, massive serif (~92px), off-white, two lines:**

```
Your website is fine.
AI engines just can't read it.
```

**Below, smaller condensed-caps gold:**

```
SWIPE -->
```

(Provided as `source-1.html` for immediate rendering.)

---

## Slide 2 - REFRAME (SEO vs AEO)

**Purpose:** Set the new mental model. The reframe that earns the rest of the carousel.

**Top eyebrow** (gold caps, small): `SEO vs AEO`

**Center, two-column grid:**

| **SEO** | **AEO** |
|---|---|
| Ranks pages | Generates citations |
| Optimizes for Google | Optimizes for 7+ engines |
| Title tags, backlinks | Schema, llms.txt, agent-readiness |
| 25 years old | 18 months old |
| Mature playbook | Up for grabs |

Each row: left column muted red-tinged, right column off-white.

**Below the table, single serif italic line, gold:**

```
AEO is not SEO with a new name.
It's a different game.
```

---

## Slide 3 - WHAT AI ENGINES ACTUALLY READ (the mechanism)

**Purpose:** Make the invisible visible. Show what AI engines parse when they decide what to cite.

**Top eyebrow** (gold caps, small): `WHAT AI ENGINES READ`

**Center visual concept:** A vertical stack of three blocks, each showing a tiny code/data fragment with a one-line label.

Block 1 (top):
```
<script type="application/ld+json">
  { "@type": "FAQPage", ... }
</script>
```
Label below: **Schema** -- tells engines what the page is about

Block 2 (middle):
```
# llms.txt
> Brand voice, products, key URLs
```
Label below: **llms.txt** -- the new robots.txt for AI agents

Block 3 (bottom):
```
{ "action": "ReserveAction", "target": "..." }
```
Label below: **Agent-readiness** -- lets AI agents act on behalf of users

**Closing line, white serif, centered:**

```
Three layers. Most sites ship zero of them.
```

---

## Slide 4 - THE SILENT PENALTY

**Purpose:** Loss aversion. Make the cost of inaction concrete without naming a client.

**Top eyebrow** (gold caps, small): `THE FAILURE MODE`

**Center, three short lines in serif:**

```
There is no error message.

No ranking drop.

Just silence.
```

**Below, smaller white:**

```
When AI engines can't parse your site, they don't tell you.
They cite a competitor instead.
```

**Bottom accent line, condensed caps gold:**

```
THE WEBSITE LOOKS FINE TO YOU.
THE ENGINES SEE NOISE.
```

This slide is the emotional fulcrum. No specific data, just the failure mode named plainly.

---

## Slide 5 - THE FIVE SCHEMA TYPES (the educational meat, the saved slide)

**Purpose:** Earn the save. Give viewers something specific they can reference and share.

**Top eyebrow:** `THE FIVE MOST-MISSING SCHEMA TYPES IN 2026`

**Center, numbered vertical list (large serif, gold numbers, white labels, description below each):**

```
1. FAQPage
   Answers the "best X for Y" queries AI engines route on.

2. BreadcrumbList
   Tells engines where this page sits in your site's hierarchy.

3. Article
   Marks editorial content as such. Without it, AI treats blogs as marketing.

4. Event
   Time-bound content. Booking flows and dates depend on it.

5. AggregateRating
   Embedded review signal AI engines weight heavily.
```

**Below the list, condensed caps:**

```
NONE COST MONEY.
ALL ARE INVISIBLE TO USERS.
```

---

## Slide 6 - CTA (the invitation)

**Purpose:** Convert dwell into action.

**Top eyebrow** (gold caps, small): `FREE`

**Center, massive serif, gold:**

```
What's your
AEO score?
```

**Below, mono in a terminal-style box (matches existing card visual language):**

```
$ check.neverranked.com
```

**Below the URL box, white serif italic, smaller:**

```
No signup. No card. Scan any URL.
Drop a domain in the comments -- I'll run it.
```

**Bottom-left:** brand mark as usual.
**Bottom-right slide counter:** replace with `6 / 6 + 1 open-weight engine`

---

## When ready to render all 6 slides

Copy `source-1.html` six times (`source-2.html` through `source-6.html`). Swap content per the specs above. Run `node render.mjs --all` to produce `card-1.png` through `card-6.png` at 1080x1350.

Upload to Instagram as a carousel in numerical order.
