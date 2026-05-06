# Blog Production System

Internal reference for producing AEO + SEO optimized posts on
neverranked.com/blog. Lives under `content/blog/` which is not
in `scripts/build.sh` DIRS, so nothing here deploys.

## What lives here

| File | What it is |
|---|---|
| `README.md` | This file. Entry point. |
| `verticals.md` | Comprehensive list of verticals we target, with audience profile, query intent, and citation surface for each |
| `template.md` | The canonical post structure. Schema bundle, section layout, FAQ format, citations, voice rules, length |
| `sources.md` | Reputable citation library. Organized by topic. Use these to back every factual claim. |
| `qa-checklist.md` | The three-layer QA gate every post passes before publishing |
| `calendar.md` | Editorial cadence. What publishes when. How to plan a quarter. |

## The system in one paragraph

Pick a vertical from `verticals.md`. Use `template.md` as the
structural starting point. Pull citations from `sources.md` for
every claim that needs backing. Run the draft through the three
QA layers in `qa-checklist.md` before it ships. Publish on the
cadence in `calendar.md`.

## Production cadence

**One post per week**, published Tuesday morning Pacific. Batch
production once a month: four posts in a focused two to three
hour session. The system removes friction so the founder time
spent is review and edit, not write from scratch.

## How to start a new post

1. Pick a vertical or topic from `verticals.md`. Cross-check
   against the `calendar.md` to make sure it has not been covered
   recently.
2. Open `template.md`. Copy the canonical structure.
3. Pull every claim through `sources.md` for citation. If a stat
   does not have a source, do not use it.
4. Draft the post in HTML matching the existing `blog/` post
   format (the structure of any current `blog/[slug]/index.html`).
5. Run the three QA layers in `qa-checklist.md`.
6. Save to `blog/[slug]/index.html`. Commit and push.
7. Add the slug to the calendar's "Posted" list with the live URL.

## Voice and craft non-negotiables

These come from the master quickref at `social/voice-quickref.md`.
Blog posts inherit them in full.

- No em dashes anywhere
- No semicolons in marketing copy
- No banned words: transform, unlock, empower, elevate, leverage,
  seamless, cutting-edge, dominate, Welcome to, We help you, Era
- Specificity over generics. Name engines, name prompts, name
  numbers.
- Italic Playfair mid-sentence emphasis is the signature. Use
  it in headlines and pull quotes.
- Tight. Cut every word that does not earn its place.

## What every post must have

| Element | Required | Notes |
|---|---|---|
| H1 with italic Playfair signature | Yes | "What is AEO" → "What is *AEO*?" |
| Word count 1500 to 2500 | Yes | Lower bound for AI citation weight, upper for reader patience |
| Article schema | Yes | Author Person schema linked, datePublished, dateModified |
| FAQPage schema with 6 to 10 Q&A | Yes | Visible on page (Google requirement) |
| BreadcrumbList schema | Yes | Home > Blog > Post |
| Organization schema | Yes | Reuse from index.html |
| Person schema for author | Yes | Lance Roylo, sameAs LinkedIn |
| Citations to reputable sources | Yes | At least 3 per post, inline links |
| One named creative lever | Yes | Reframe, Specificity, Confession, Tension Hold, Format Surprise, Visible Mechanic |
| Conversion CTA at the bottom | Yes | "Free scan at check.neverranked.com" or similar |
| Mobile-fix baseline (44px tap targets, async fonts) | Yes | Inherits from the existing `blog/` post template |

## How this connects to the dashboard QA system

Lance's dashboard already runs three-pass validation on content
drafts (factual grounding, tone check, quality gate, three
attempt regeneration). Blog posts can flow through that system
in two modes:

1. **Manual draft, dashboard QA on review.** Draft the post in
   Claude Code or any editor. Save HTML to `blog/[slug]/index.html`.
   Push. The dashboard's existing scan picks up the new post and
   runs the three passes against it. Surfaces any issues in the
   admin inbox for review.
2. **AI-drafted, dashboard QA inline.** Future state: draft is
   generated programmatically, runs through the three passes
   automatically, lands in the admin content review queue for
   approval. Out of scope for tonight, planned for a later session.

For now, mode 1 is the default. The QA checklist in `qa-checklist.md`
is the human-readable version of what mode 2 will eventually
automate.

## File update conventions

- Add new verticals to `verticals.md` as the program expands
- Add new sources to `sources.md` as you discover them. Tag them
  by topic so future posts find them fast.
- Update `calendar.md` after every publish (move from Planned to
  Posted)
- The template in `template.md` should evolve with what works.
  When a post pattern lands particularly well, extract the move
  into the template.
