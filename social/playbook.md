# Never Ranked. Social Production Playbook

**The repeatable loop for shipping a Never Ranked social post that converts.**

This playbook is the Never Ranked-specific application of the Hello Momentum production loop. The general loop (the five gates and why they exist) lives in:

- `/Users/lanceroylo/Desktop/AI-Agency/hello-momentum-agency/strategic-framework/PRODUCTION_LOOP.md`

Read that first if you have not. This document defines what each gate looks like for Never Ranked.

---

## The Loop, Applied to Never Ranked

### Gate 1 — Strategy

The desired audience shift for almost every NR post is the same: an SMB owner or a marketing lead opens neverranked.com and runs the free 30-second URL check. Free check conversion is the only metric that matters at the top of the funnel. Pulse, Audit, and Amplify pull from that pool downstream.

**Levers that work for NR (in order of historical performance):**
1. Specificity. A real category, a real city, a real number from a real audit run.
2. Confession. Admitting something Lance got wrong about SEO that other agencies will not admit.
3. Visible Mechanic. Showing the eight-signal grid, the score, the gauge — the diagnostic the audience has not seen before.
4. Reframe. The new scoreboard is "are you named or not," not "where do you rank."

**Levers that do not work (and have been tried):**
- Tension Hold. Long, slow setups die on LinkedIn.
- Format Surprise. NR's distinctiveness is the visual system, not the format. Surprises feel off-brand.

### Gate 2 — Approval

Lance approves every post before it is rendered. The plan he sees includes:
- The lever named explicitly
- The headline / kicker, verbatim
- The caption, verbatim
- The visual composition described top-to-bottom
- Any anonymization decisions (especially for cold-prospect demos)
- The honest-claims audit (which numbers are anchored where)

If Lance has not seen the caption text and the headline text before render, the plan is not complete.

### Gate 3 — Honesty

Three failure modes have happened on this brand and must be guarded against:

1. **Invented stats.** "We tested 47 sites" with no batch run behind it. If Lance has not personally run the audit at that scale, the post does not claim that scale. Use real numbers from the D1 scan_results table, real demos from the inbox, or reframe to a method ("every business I run this on") that is honest if true.

2. **Engine-count drift.** NR tracks SIX engines: ChatGPT, Claude, Gemini, Perplexity, Google AI Overviews, Microsoft Copilot. Older copy says four. Every new post must name all six when listing engines. Cold emails, captions, and image text all check this.

3. **Anonymization for cold prospects.** A cold-email recipient who has not signed is not a public testimonial. Use real city, real category, real score, no brand name. The post stays credible without burning the deal.

**Where to verify claims:**
- Scan averages → query `dashboard/migrations/...` schema, run `wrangler d1 execute neverranked-app --remote --command "SELECT ..."`
- Demo moments → Lance's Gmail or recent audit runs
- Competitor pricing → the honest-comparison block on the homepage (verified May 2026)

### Gate 4 — Render

The Never Ranked visual system, locked:

- **Background:** `#080808` (post posters) or `#0c0c0c` (website hero)
- **Gold:** `#c9a84c` (primary), `#e8c767` (warm), `#bfa04d` (dim)
- **Text:** `#fbf8ef` (post posters) or `#e8e6df` (site)
- **Line:** `#222`
- **Fonts:** Playfair Display (italic, 400–900), Barlow Condensed (400–700, all-caps treatments), DM Mono (300–500, body and meta)
- **Texture stack:** grain layer (8% opacity, mix-blend overlay) + gold-wash radial gradient + outer vignette
- **Frame:** 70px inset, 1px border at `rgba(251,248,239,.10)`
- **Section labels:** `§ ALL-CAPS · 0.38em letter-spacing · gold §`
- **Hero headline:** Playfair italic, 60–76px, gold accent on the punch word
- **Sub-line:** DM Mono, 16–18px, 78% white
- **Visual signatures:** the gauge dial, the 8-signal grid, the broadcast diagram, the stacked-circles halo on every glowing dot. These appear on the website. They appear in posts. The signature is what makes a post recognizable as NR before the wordmark is read.

**The render pipeline:**

```
linkedin/
  post-NN-{slug}-source.html      ← HTML poster source, brand-locked
  captions/post-NN-{slug}.txt     ← caption, paste-ready
  post-NN.md                      ← lever rationale + posting notes
  render.mjs                      ← Playwright bundle, deviceScaleFactor 2
  images/post-NN-{slug}.png       ← rendered output
```

To render: `node linkedin/render.mjs` from repo root.

The source HTML loads the same Google Fonts the website loads. The render waits for `document.fonts.ready` before screenshotting. If a font is not painting, the render fails honest, not silent.

**Reference posts to lift from when starting a new one:**
- `linkedin/post-01-scorecard-source.html` — ChatGPT-mock conversation card
- `linkedin/post-03-scorecard-source.html` — entity-audit scorecard with gauge + signal grid

### Gate 5 — Cleanup

When working on a new post, drift will surface in adjacent files. Common patterns on NR:

- Old captions naming four engines (run `grep -rn "four.*engine" linkedin/ social/ content/`)
- Stale CTAs pointing at `check.neverranked.com` or `app.neverranked.com/checkout/audit` when the canonical conversion path is now the URL check on the homepage
- Old engine lists in cold-email templates Lance hand-types (not in the repo, but worth flagging when spotted)

Drift gets a spawned task. It does not get silently fixed in the same commit as the new post. The focused ship stays focused.

---

## Cadence

- **Personal LinkedIn:** 3 posts per week, rotating image and text formats. Lance posts. Tue / Wed / Thu, 8–10am or 12–1pm in target audience timezone.
- **Company LinkedIn:** 1 post per week. Seed posts queued in `linkedin/captions/company-*.txt`.
- **Other surfaces** (X, Threads, IG): downstream of the LinkedIn beat. The poster image often works cross-platform with caption tweaks. See `social/posts/YYYY-MM-DD-{slug}/platforms.md` for cross-posting patterns.

---

## Posting Mechanics (LinkedIn-specific)

- Paste the URL `neverranked.com` as plain text in the post body. Do not let LinkedIn render the preview card — it suppresses reach by 30–40%.
- Optional: paste the URL again in comment one for the engagement bump.
- Hashtags: max 2–3. Suggested: `#AEO #SEO #AnswerEngineOptimization`. Do not stack more.
- Reply rhythm: when scores roll in, respond within 24 hours with one specific fix per comment. Do not pitch in public replies. Pulse / Audit conversations move to DMs.

---

## Pre-publish Check (the 5-second version)

1. Lever named?
2. Swap test passed?
3. Every number traceable to a real source?
4. Visual loaded with NR fonts and palette, not a template?
5. Conversion path clear and to the free 30-second check?

Five for five = ship. Anything less = back to the gate that failed.

---

## Reference

- HM creative principles: `/Users/lanceroylo/Desktop/AI-Agency/hello-momentum-agency/knowledge-base/creative-intelligence/CREATIVE_PRINCIPLES.md`
- HM quality benchmarks: `/Users/lanceroylo/Desktop/AI-Agency/hello-momentum-agency/knowledge-base/creative-intelligence/QUALITY_BENCHMARKS.md`
- HM production loop (this playbook's parent): `/Users/lanceroylo/Desktop/AI-Agency/hello-momentum-agency/strategic-framework/PRODUCTION_LOOP.md`
- NR voice rules: `social/voice-quickref.md`
- NR performance lessons: `social/performance-playbook.md`
- NR post sizes by platform: `social/sizes.md`
