# Social Media Image + Video Sizes

Reference for LinkedIn and Instagram, the two platforms Never
Ranked is publishing on. Sources cross-referenced May 2026:
Sprout Social, Buffer, official platform help centers.

If a number conflicts between sources, pick the one that
displays at full quality on a current iPhone (most viewers).

---

## TL;DR — what to ask Stitch for

| Use | Size | Aspect | Notes |
|---|---|---|---|
| **LinkedIn feed (personal or company), default** | **1080 × 1350** | 4:5 portrait | Dominates more screen than square, beats landscape on engagement |
| LinkedIn feed, alternate | 1080 × 1080 | 1:1 square | Use when the design is symmetrical |
| LinkedIn feed, landscape | 1920 × 1080 | 16:9 | Use only when content is genuinely wide (charts, carousels, screenshots) |
| LinkedIn link preview / OG image | 1200 × 627 | 1.91:1 | This is what shows when a URL is pasted, NOT for feed image posts |
| LinkedIn document carousel | 1200 × 1500 per page | 4:5 PDF | Up to 300 pages, PDF only |
| LinkedIn video | 1920 × 1080 | 16:9 (or 1:1 / 9:16) | Up to 10 min, MP4 |
| **Instagram feed, default** | **1080 × 1350** | 4:5 portrait | Same dominant size as LinkedIn — content can match |
| Instagram feed square | 1080 × 1080 | 1:1 | Older standard, still fine, fills less screen |
| Instagram feed landscape | 1080 × 566 | 1.91:1 | Smallest in feed, lowest engagement, avoid unless needed |
| **Instagram Stories** | **1080 × 1920** | 9:16 | Keep 310px safe zone top + bottom (UI overlay) |
| **Instagram Reels** | **1080 × 1920** | 9:16 | Keep 480px safe zone top + bottom (3:4 grid crop) |
| Instagram carousel | 1080 × 1350 or 1080 × 1080 | All slides match | Pick 4:5 unless content forces square |

---

## LinkedIn

### Feed image post (personal or company)

- **Recommended:** 1080 × 1350 px (4:5 portrait) or 1080 × 1080 px (square)
- **Landscape:** 1920 × 1080 px (16:9)
- **Min resolution:** 552 × 276 px (avoid going below 1080 wide)
- **Max file size:** 5 MB per image
- **Max images per post:** 9
- **Format:** JPG, PNG, GIF (non-animated)
- **Why portrait wins:** LinkedIn's mobile feed (where most viewing happens) renders portrait at full width with more vertical real estate, compressing landscape into a smaller block. Portrait stops the scroll longer.

### Document / PDF carousel

- **Per-page size:** 1200 × 1500 px (4:5)
- **Max pages:** 300
- **Format:** PDF
- **Use case:** Multi-slide insight posts, decks, case studies. The format LinkedIn rewards most generously in the algorithm right now.

### Video

- **Recommended:** 1920 × 1080 (16:9), 1080 × 1080 (1:1), or 1080 × 1920 (9:16 vertical)
- **Length:** 3 sec to 10 min
- **Max file size:** 5 GB
- **Format:** MP4 (preferred), MOV
- **Vertical (9:16) is increasingly favored on mobile feed.** If choosing one ratio for video, vertical wins.

### Link preview / OG image

- **Size:** 1200 × 627 (1.91:1)
- **This is what auto-pulls when a URL is shared, NOT what feed image posts should use.**
- The neverranked.com `og.jpg` is 1200 × 630, which is correct for this use.

### Profile and company page assets

- **Personal profile photo:** 400 × 400 px (displayed circular)
- **Personal profile cover/banner:** 1584 × 396 px
- **Company page logo:** 300 × 300 px
- **Company page cover:** 1128 × 191 px

---

## Instagram

### Feed posts

- **4:5 portrait (RECOMMENDED):** 1080 × 1350 px
- **Square:** 1080 × 1080 px
- **Landscape:** 1080 × 566 px (1.91:1)
- **Max file size:** 8 MB per image (in-app), up to 30 MB via API
- **Max images per post (carousel):** 20 (up from older 10 limit)
- **Format:** JPG, PNG
- **Why portrait wins:** Same logic as LinkedIn but stronger. Instagram's feed is mobile-first, vertical-first. 4:5 takes the most screen. Landscape posts get measurably less engagement.

### Carousel

- **Same dimensions as feed:** 1080 × 1350 (preferred) or 1080 × 1080
- **All slides must match the same aspect ratio.** Mixing is not allowed.
- **Up to 20 slides.**
- **Use case:** Step-by-step explainers, before/after, list-style insight posts. Carousels currently outperform single images on engagement.

### Stories

- **Size:** 1080 × 1920 px (9:16)
- **Safe zone:** Keep critical content (text, logos, faces) within the central 1080 × 1300 area. Reserve **310 px from the top** (profile photo, name, close button) and **310 px from the bottom** (link sticker, action buttons).
- **Max file size:** 30 MB image, 4 GB video
- **Duration (video):** Up to 60 sec per story segment
- **Format:** JPG, PNG, MP4

### Reels

- **Size:** 1080 × 1920 px (9:16)
- **Safe zone:** Keep content within central 1080 × 960 area. Reserve **480 px from the top** and **480 px from the bottom** so the cover renders cleanly when the Reels grid (3:4) crops to a smaller frame.
- **Cover image:** 1080 × 1920, but the grid view will crop to 1080 × 1440 (3:4). Design the cover with the grid crop in mind.
- **Length:** 15 sec to 90 sec
- **Max file size:** 4 GB
- **Format:** MP4, MOV
- **Note:** "You cannot edit a Reels cover photo after upload." Get it right the first time.

### Profile

- **Profile photo:** 320 × 320 px (displays at 110 × 110)

---

## Cross-platform reuse

If you want one image to work on both LinkedIn AND Instagram feed,
**generate it at 1080 × 1350 (4:5 portrait)**. Both platforms accept
it natively. Both put it at full feed width. The same source file
can ship to both with no re-export.

For Stories and Reels, you have to commit — those are 1080 × 1920
vertical with safe zones. Not interchangeable with feed posts.

---

## What this means for our Stitch generations

When asking Stitch for a social visual:

- **For a single feed image** that runs on both LinkedIn and Instagram:
  ask for "1080 × 1350, 4:5 vertical portrait."
- **For a feed-only LinkedIn post** where you want maximum width:
  ask for "1920 × 1080 landscape" only if the content is wide
  (e.g. a chart, a comparison). Otherwise default to 1080 × 1350.
- **For Stories or Reels:** ask for "1080 × 1920 vertical with 310px
  safe zones top and bottom" (Stories) or "480px safe zones" (Reels).
- **For LinkedIn document carousels (multi-slide PDFs):** ask for
  "1200 × 1500 per slide, 4:5, design for PDF export."

Stitch's `DESKTOP` device-type defaults to landscape ratios. For
social, the better request is `MOBILE` device type with explicit
dimension constraints in the prompt.

---

## File size discipline

Both platforms compress aggressively on upload. To minimize
quality loss:

- **Start at 2x the target dimension** if the source is from
  Stitch or another generator, then downscale to spec before
  upload (preserves detail through their compression pipeline).
- **JPEG quality 85–90** for photographs and dark + gold editorial
  designs like ours. PNG only when transparency is essential.
- **Keep files under 1 MB** if possible. Both platforms re-encode,
  but smaller starting files compress more cleanly.
- **No alpha transparency in feed images.** Both platforms render
  on a white or black background depending on theme, so
  transparency creates inconsistent edges.

---

## Last verified

May 2026. Re-verify quarterly. Platform specs change without
much notice and the algorithm preferences (which sizes get more
reach) shift even faster than the dimension specs themselves.
