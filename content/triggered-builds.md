# Triggered Builds

Internal queue. Things to build when specific triggers fire.
Not a wish list. Each entry has a clear trigger condition, the
build scope, the estimated effort, and the reason it is gated
on the trigger rather than being built now.

Lives under `content/` which is not in `scripts/build.sh` DIRS.
Never deploys.

---

## Active triggers

### Outreach Phase 2: closed-loop self-learning system

- **Trigger (revised 2026-05-06):** T1 sends >= 100. Brought forward from "all three touches >= 100" because the 100/day volume ramp gets us to T1=100 in ~2 weeks instead of 6+. Run `node scripts/learning-readiness.js` in the outreach repo any time to check the gap.
- **What to build (5 learning surfaces, in leverage order):**
  1. **Subject A/B.** Generate 2-3 subject variants per send. Log which the prospect saw (use existing `send_log.note_variant` column — built but unused). Attribute opens by variant. Bandit weights future variants toward winners.
  2. **Body angle A/B.** Same shape for body. Generate variants for T0/T1/T2, attribute replies, weight winners.
  3. **ICP feedback.** Tag every Apollo-fetched prospect with the ICP key it came from (already stored in `notes.apollo_id`; need to also stamp the ICP key). Track reply rate per ICP. Auto-bias future Apollo fetches toward winning ICPs, demote losers. Surfaces which segments are productive vs which are dead.
  4. **Send-time optimization.** Vary send hour within the daily-pipeline window. Attribute opens by send hour bucket. Auto-shift toward winners.
  5. **Vertical-shift detection.** Rolling 30-day reply rate per vertical. Alert when it drops >25% week-over-week. Catches saturation / topic fatigue before it tanks results silently.
- **Effort:** ~6-10 hours Claude Code for #1-#2 (the lift); +2-3 hours for #3-#5 if shipped together.
- **Run cost:** ~3x API spend per generation (3 candidate bodies vs 1) = ~3¢ per prospect instead of 1¢. Bandit logic runs locally, no infra cost.
- **Why gated:** Until sample sizes per touch are meaningful (100+ sends), any "winning variant" is noise. Premature ML on cold outbound is a known anti-pattern: wrong winners get amplified, optimization happens on randomness, results get worse before they get better. Phase 1 collects the baseline; Phase 2 starts when there is a real signal to optimize against.
- **Phase 1 reference:** Multi-touch sequence shipped 2026-05-06 in `/Users/lanceroylo/Desktop/neverranked-outreach/`. Bodies stored in `packages.followup_dm` (T1 bump), `followup_2` (T2 new hook), `followup_3` (T3 break-up). Cadence T1=+4d / T2=+10d / T3=+18d. Send log actions: `followup_1_sent` / `followup_2_sent` / `followup_3_sent`. Apollo API automation shipped same day (`scripts/apollo-fetch.js`, daily cron Step 0). `send_log.note_variant` column already exists, unused — that is the latent infrastructure waiting for Phase 2.
- **Readiness checker:** `node scripts/learning-readiness.js` prints the current gap to the trigger. Run weekly after the 100/day ramp completes (~2026-05-14).

### Hermes Agent autonomous research layer
- **Trigger:** First paid customer signs (any tier: $750 audit, Pulse, Signal, Amplify)
- **What to build:** Phase A (VPS + Hermes Agent + Slack integration) + Phase B (daily prospect research digest, ICP-driven, posted to Slack DM at 7am Hawaii)
- **Effort:** ~4-6 hours Claude Code work + ~30 min Lance VPS provisioning
- **Run cost:** $8-16/month (VPS + Claude Haiku via API or Hermes 4 via Together AI)
- **Why gated:** Premature optimization for a 1-3 pitches/week founder. Becomes valuable when prospect volume needs to scale and Lance is the bottleneck on research time.
- **Spec already drafted in:** session 2026-05-05 conversation. Recreate from "Standard setup at $74-192/year" pattern.

### Dashboard auto-QA for blog posts
- **Trigger:** 3+ paid customers OR $5K MRR
- **What to build:** Wire blog drafts through the dashboard's existing 3-pass validation pipeline (factual / tone / quality) so new posts get auto-QA'd before they ship instead of relying on manual checklist runs
- **Effort:** ~2-3 hours Claude Code work
- **Why gated:** Manual QA via `content/blog/qa-checklist.md` is fine at 1 post/week. Automating it pays back when post velocity increases AND the QA work starts feeling tedious.

### Blog cadence ramp
- **Trigger:** 5+ paid customers OR consistent organic blog traffic >1K/month
- **What to build:** Move from 1 post/week to 2/week. Update `content/blog/calendar.md` cadence rules. Plan twice the topic backlog.
- **Effort:** Planning shift, no engineering. Production volume change.
- **Why gated:** 1/week is the right cadence for a founder-led agency at current scale. Doubling the cadence is meaningful operator burden — only worth it when the existing posts are clearly driving leads.

### FAQPage backfill on the 16 remaining blog posts
- **Trigger:** Whenever a focused 6-8 hour session opens up
- **What to build:** Add FAQPage schema (visible HTML + JSON-LD) to the 16 existing posts that still lack it. Same pattern used in `what-is-aeo`, `aeo-pricing`, `best-aeo-agency` (the three patched in Phase 1).
- **Effort:** ~30 min per post × 16 = 8 hours, batchable in 4-post chunks
- **Why gated:** Phase 1 demo proved the pattern works. Backfill is mechanical work that pays back as AI engines retrain (90-day cycle). Not urgent, not unimportant.

### Hamada pitch follow-up
- **Trigger:** The standing meeting actually happens
- **What to build:** Walk through the pitch live with Shawn, scope the audit if greenlit, prepare the actual audit deliverable (PDF format, schema completeness report, competitor citation matrix on Honolulu financial advisor queries)
- **Effort:** Pitch walkthrough is conversational. Audit delivery: ~3-4 hours Claude Code work to produce.
- **Why gated:** Pitch sent. Meeting on calendar. Don't pre-build the audit before he says yes — wasted work if he passes.

### Sean Levy follow-up (TWS Paperie)
- **Trigger:** Sean replies to the pitch with anything other than "no thanks"
- **What to build:** Run the free audit on twspaperie.com (per the pitch, comped). PDF deliverable in 48 hours. Schema completeness report, six-engine citation matrix on Orlando gift-wrapping queries, competitor map.
- **Effort:** ~2-3 hours Claude Code work
- **Why gated:** Audit was offered as a no-charge follow-up. Don't run it before he asks; let him drive.

### Darrell Chock follow-up
- **Trigger:** Darrell replies expressing interest in the partnership
- **What to build:** Schedule a walkthrough call (or async exchange if he prefers). Prepare partnership onboarding (white-label dashboard configuration, first restaurant client identified, contract template if needed).
- **Effort:** ~2-4 hours depending on his response
- **Why gated:** Partnership pitch sent. He may respond, may not. Wait for signal.

---

## Conditional / observational triggers

These do not have a build scope yet — they are signals to watch.

### Email open tracking lights up unexpectedly
- **Trigger:** A pitch URL gets multiple opens from distinct IPs (signal that the prospect forwarded internally)
- **What to do:** Mention casually in follow-up: "saw the brief got passed around, happy to walk through with whoever you'd like." Don't be creepy about it.

### A competitor (Profound, Athena, E.A. Buck) gets a press hit or funding
- **Trigger:** News surfaces about a category competitor's growth event
- **What to do:** Write a post that uses the news as a hook ("the AEO category just got more competitive, here's what it means for small businesses").

### AI engines update their citation surfacing behavior
- **Trigger:** OpenAI / Anthropic / Google announce a change to how their AI products surface external content
- **What to do:** Update `content/blog/voice-quickref.md` recurring statistics with new data. Possibly write a category education post about the change.

---

## Closed triggers (kept for history)

(empty — none retired yet)

---

## How to use this file

When considering "should I build X?":

1. Search this file for X. If it has a trigger, has the trigger fired? Yes → build. No → wait.
2. If X is not in this file and feels premature, add it here with a trigger condition.
3. When a trigger fires, move the row to a new section "In flight" while building. Move to "Closed triggers" with completion date when done.

Keeping this file disciplined prevents the founder trap of building everything that sounds clever and shipping less than 50% of what gets built.
