# Never Ranked. Social

Internal working directory for social media posts. Not deployed.
The build pipeline (scripts/build.sh) only rsyncs the curated DIRS
list, and `social/` is intentionally excluded.

## Structure

```
social/
  README.md                this file
  calendar.md              the queue (chronological, with status)
  voice-quickref.md        distilled voice rules for fast reference
  sizes.md                 platform image / video dimensions (the lookup)
  performance-playbook.md  what stops scrolls, drives engagement, and converts
  posts/
    YYYY-MM-DD-{slug}/
      caption.md           platform-specific captions
      hero-prompt.md       visual brief (Stitch prompt or design spec)
      hero.{png,jpg}       the actual visual once generated
      alt-text.md          accessibility alt text
      platforms.md         where it ships (IG / LinkedIn / X / FB / Threads), scheduled date, status
```

## Pre-publish checklist (the 5-second check from the playbook)

Every post passes these before it ships:

1. Does the first line / first visual beat stop the scroll?
2. Does it pass the swap test? (Replace "Never Ranked" with any
   competitor — does it still make sense? If yes, it is too generic.)
3. Does it name the creative lever? (Reframe, Specificity,
   Confession, Tension Hold, Format Surprise, Visible Mechanic.)
4. Does it have a specific number, name, or quoted phrase?
5. Is the conversion path clear and low-pressure?

Five for five = ship. See `performance-playbook.md` for the
full reasoning behind each rule.

## How to draft a new post in Claude Code

1. Pick a theme (a stat, a quote, a customer story, a category insight)
2. `mkdir social/posts/YYYY-MM-DD-{slug}` and ask Claude to draft caption.md
3. Ask Claude to validate against `voice-quickref.md`
4. Use Stitch to generate the hero (or design separately and drop it in)
5. Fill in alt-text.md and platforms.md
6. Add the entry to calendar.md with status `draft`
7. When posted, update calendar.md status to `posted` with the live URLs

## Voice non-negotiables (full version in voice-quickref.md)

- No em dashes anywhere (titles, captions, alt text)
- No semicolons in prose
- No banned words: transform, unlock, empower, elevate, leverage, seamless,
  cutting-edge, dominate, Welcome to, We help you
- No emojis on website pages or LinkedIn or X. Emojis allowed in IG captions
  only, sparingly, and only when they earn their place.
- Italic Playfair mid-sentence emphasis is the signature treatment when
  visuals carry typography
- Specificity wins. Name engines, name prompts, name numbers.

## Visual DNA (matches neverranked.com)

- Background: `#121212` deep charcoal
- Gold accent: `#e8c767` (with `#bfa04d` dim variant)
- Cream text: `#fbf8ef`
- Headlines: Playfair Display, italic for emphasis
- Body / data: DM Mono
- Labels: Barlow Condensed, ALL CAPS, .18em letter-spacing
- Subtle film grain overlay, vignette at edges
- Hairlines for dividers, never heavy borders

## Platform conventions

| Platform | Tone | Length | Hashtags | Emojis | Links |
|---|---|---|---|---|---|
| LinkedIn | Editorial, founder-voice | 800–1500 chars | 0–3 minimal, end | None | First comment |
| Instagram | Tighter, visual-led | 100–300 chars hook + body | 5–8 in caption | Sparingly, only if earned | Bio link |
| X / Threads | Punchy, single insight | 240 chars main, threadable | 0–2 | None | End of thread |
| Facebook | Closer to LinkedIn | 400–800 chars | 0–2 | None | Inline |

## Skills to invoke

- `/marketing:draft-content` · first draft per platform
- `/marketing:campaign-plan` · when planning a series
- `/brand-voice:brand-voice-enforcement` · validate against rules before posting
- `/sales:create-an-asset` · when the post is also a sales asset
