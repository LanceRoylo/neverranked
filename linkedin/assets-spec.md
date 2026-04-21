# NeverRanked — LinkedIn Visual Assets

Two PNGs generated from HTML sources. Both use the live site's typography (Playfair Display + Barlow Condensed + DM Mono) and palette (#080808 background, #c9a84c gold).

---

## Files

| File | Size | Use |
|---|---|---|
| `logo-300.png` | 300 × 300 | Company Page logo |
| `cover-1128x191.png` | 1128 × 191 | Company Page cover image |

LinkedIn specs:
- **Logo:** square, minimum 300×300, PNG or JPG, under 4MB. This file is exact-fit.
- **Cover:** 1128×191 is the desktop-safe area. Mobile crops differently, so all content in this file is centered inside the safe zone.

---

## Design rationale

- **Logo** mirrors the favicon: italic gold "N" in Playfair, centered on near-black, soft film grain overlay. Readable at 32px (favicon scale) through 300px (LinkedIn avatar scale).
- **Cover** uses the site's hero headline "Never Ranked. Until now." with "Until now." as italic gold. Small mark on the left doubles as a wordmark lockup. The grain + vignette are lifted from `og-source.html` so the LinkedIn page feels continuous with the site.

Both pass the Blind Brand Test (from HM quality benchmarks): cover the name and the visual language alone signals NeverRanked.

---

## Regenerating

Sources live next to the PNGs.

```bash
cd /Users/lanceroylo/Desktop/neverranked
node linkedin/render.mjs
```

Dependencies: `@playwright/test` (already in the project).

---

## Upload order

1. Logo first. LinkedIn propagates it to every surface (search results, post attribution, employee tagging).
2. Cover second. Re-check on mobile after upload, the center-weighted composition handles the crop but eyeball it once.
3. Tagline and About text before any posts go live, otherwise the first-impression click from a post lands on an unfinished page.
