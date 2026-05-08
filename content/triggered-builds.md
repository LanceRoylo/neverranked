# Triggered Builds

Internal queue. Things to build when specific triggers fire.
Not a wish list. Each entry has a clear trigger condition, the
build scope, the estimated effort, and the reason it is gated
on the trigger rather than being built now.

Lives under `content/` which is not in `scripts/build.sh` DIRS.
Never deploys.

---

## Active triggers

### Engine changelog: first real entry
- **Trigger:** Citation tracker has accumulated 4+ consecutive weeks of the same control prompt set across all six engines
- **What to build:** Run a diff query, identify any prompt where the top-3 cited sources changed week-over-week. For each material change, fill the template at `content/engine-changelog/_template.md` with the actual data. Publish to neverranked.com/engine-changelog as a public proof-of-work feed.
- **Effort:** 2 hours when triggered. Recurring weekly thereafter.
- **Why gated:** Cannot publish observations we have not actually measured. Premature entries kill credibility the moment a journalist asks for the underlying data.

### Public scan persistence: migrate scan events from KV (90d) to D1 (permanent)
- **Trigger:** Scan volume crosses 100/day sustained for 14 days, OR a paying customer asks for industry-wide benchmark numbers we cannot answer with current data.
- **What to build:** New `public_scans` table in dashboard D1. Schema-check writes to it via shared-secret API on each scan. Industry classifier auto-tags the domain. Backfill from existing KV data before the 90d window expires.
- **Effort:** 1 day. Light migration, light wiring.
- **Why gated:** The data lives in KV with 90d TTL today, which is fine for current volume. Moving it to D1 only matters when we have enough scans for cross-customer benchmarks to be statistically meaningful.

### llms.txt scoring integrated into schema-check
- **Trigger:** llms.txt deployed to neverranked.com production AND CLI tool stable for 7 days (no error reports)
- **What to build:** Port logic from `scripts/llms-txt-check.mjs` into `tools/schema-check/src/index.ts`. Add llms.txt section to the public scan UI alongside schema and OG checks. Surface as a new component in the AEO score (5-10 points). Store llms.txt observations in event KV for future benchmarking.
- **Effort:** 1 day
- **Why gated:** Want the CLI tool battle-tested before merging into the public scan flow. Also want our own llms.txt live first so the marketing claim is honest.

### llms.txt standard page on neverranked.com
- **Trigger:** Marketing site has a /standards/ route or the homepage is updated to link a standalone HTML page
- **What to build:** Convert `content/llms-txt/standard.md` to a polished HTML page at `neverranked.com/standards/llms-txt`. Add to nav. Submit to sitemap. Becomes a high-authority page that ranks for "llms.txt" queries.
- **Effort:** 4 hours
- **Why gated:** Marketing site routing pattern needs to be decided first (currently flat directory of HTML files; /standards/ would be a new pattern)

### State of AEO 2026 — Hawaii edition
- **Trigger:** 6+ Hawaii audits in `audits/` AND 4+ Hawaii leaderboards published (community banking already shipped)
- **What to build:** Full PDF report aggregating all Hawaii vertical scan data. Distribution percentiles per vertical. Schema coverage trend lines. Engine-by-engine citation share averages. Becomes the canonical reference. Submitted to PRWeb + sent to local press.
- **Effort:** 2 weeks
- **Why gated:** Need a credible sample size of audits across 4+ verticals before the report has substance.

### Per-vertical leaderboard pipeline
- **Trigger:** First publication of Hawaii community banking leaderboard succeeds AND 3+ requests for similar leaderboards in other verticals
- **What to build:** Generalize `content/leaderboards/hawaii-community-banking-2026-05.md` into a template + script pipeline. Auto-pull scores from check.neverranked.com for any list of domains. Auto-rank, auto-format, auto-publish. Reduces leaderboard production to 30 minutes per vertical.
- **Effort:** 2 days
- **Why gated:** First leaderboard needs to land publicly and prove the pattern before scaling.

### Reverse-engineer citations — Phase 2 worker
- **Trigger:** First customer with weekly citation tracking running 4+ weeks AND citation_runs has 10+ "competitor cited, client not cited" rows on tracked-corpus prompts
- **What to build:** Per `content/design/reverse-engineer-citations.md` — diff worker, customer-facing UI route, nightly cron, dashboard tab. Schema already shipped in migration 0067.
- **Effort:** 2 days when triggered.
- **Why gated:** Need real data flowing through citation_runs before the diff job has anything meaningful to surface. Building it dry would produce a pretty UI with empty findings.

### Audit-as-content engine — publish first post
- **Trigger:** Marketing site routing for /blog/ is set up AND audit-to-blog.mjs has been used to generate 3+ teardowns for review
- **What to build:** Wire `content/blog/*.md` through the marketing site build pipeline. Add /blog/ landing page. Submit sitemap. Schedule monthly publication cadence.
- **Effort:** 4 hours.
- **Why gated:** Want a backlog of 3+ posts before launch so the blog has weight on day one.

### Hawaii community banking leaderboard — publish publicly
- **Trigger:** ASB meeting concludes + 14-day pre-publication notice window expires (regardless of whether ASB signs)
- **What to build:** Publish `content/leaderboards/hawaii-community-banking-2026-05.md` and `methodology.md` as `neverranked.com/leaderboards/hawaii-community-banking` and `neverranked.com/leaderboards/methodology`. Add to sitemap. Add a small "Updated weekly" badge linking to the methodology. Wire weekly auto-update from the cron that already runs.
- **Effort:** 4 hours (markdown → marketing site routes, sitemap, weekly cron tie-in)
- **Why gated:** Cannot ambush the category lead by publishing without notice. The 14-day window is the structural alignment that turns the leaderboard from awkward to inevitable.

### Vertical exclusivity activation
- **Trigger:** MVNP signs the wholesale pilot.
- **What to build:** Add a `vertical_lockouts` table tracking which categories are reserved for which agency partner. Update the prospect intake flow to check lockouts before sending outreach. Update the sales pitch to mention the lockouts as a feature, not a limitation.
- **Effort:** 4 hours.
- **Why gated:** No partners signed yet. Building the lockout table before there is anything to lock is busywork.

### Roadmap copy + dashboard reports: rewrite to the Clarity Principle (HIGH PRIORITY)

- **Trigger:** Hawaii Theatre asks "what does this mean?" once, OR the next paying customer onboards, OR Lance has a focused 2-4 hour block. Whichever comes first.
- **Why this is high priority:** Hawaii Theatre's roadmap was just reviewed (2026-05-07) and the items read as developer-only. "Add og:title, og:description, og:image to all pages" is gibberish to a small business owner. "YOU SHIP THIS" + jargon they don't understand = customer feels stuck. The dashboard becomes useless and they escalate to Lance asking "what does this mean," which makes Lance the helpdesk.
- **The principle to apply:** `content/operating-principles.md` — the Clarity Principle.
- **What to build:**
  - **Phase 1 (~2 hours, ships first):** Rewrite the top 5 most-frequent roadmap item types using the three-layer pattern (plain English + how-to-by-platform + collapsed technical detail). Top 5: OG tags, Organization schema, FAQPage schema, canonical tags, H1 hierarchy. Hits 80% of what customers actually see on first scan.
  - **Phase 2 (~4-6 hours, follow-up):** Extend the pattern to the remaining ~25 roadmap item types.
  - **Phase 3 (~ongoing):** Apply the same lens to the dashboard's other surfaces — citation reports, signal cards, NPS prompts, alerts. Anything customer-facing.
- **Where the copy lives:** `dashboard/src/routes/roadmap.ts` (item description / fix / why fields), plus the auto-generated content from `lib/aeo-scan.js` red flags. Also the audit auto-populator at `scripts/audit-generate.mjs` — the schema review and roadmap sections it generates need this treatment too.
- **Effort:** Phase 1 ~2 hrs. Phase 2 ~4-6 hrs. Phase 3 ongoing per surface.
- **Reference / origin:** Hawaii Theatre dashboard review on 2026-05-07. Three roadmap items shown ("Add Open Graph meta tags," "Fix: No og:image tag," "Fix: No AggregateRating detected") all violated the Clarity Principle. Lance: "If we're not doing the work then we have to make it extremely easy for them to understand. That's what makes us different."

### AI software factories: spec/test-driven generation across all pipelines

- **Trigger:** Phase 2 (closed-loop variant testing) ships AND post-launch we observe a category of generation failure that's expensive to catch by eye (e.g., a misfire pattern slips through 5+ times before being noticed). At that point spec/test harnesses pay back.
- **Origin:** YC video "How to build an AI native company from the ground up" (Diana, partner), watched 2026-05-06. Argument: humans write specs + tests, agents generate implementation, agents iterate until tests pass. Strong AI's repo cited as an example of "no handwritten code, just specs and test harnesses."
- **What to build:**
  - **Generator factory.** The cold-email generator already has primitive software-factory shape (BANNED_TOKENS check, FAB_PATTERNS_INLINE check, validateOutreachOutput, regenerate-on-fail with feedback). Extend the same pattern to other generation surfaces: audit deliverable narrative, blog post drafts, social captions, schema deployment payloads.
  - **Schema deployment factory.** When NR ships JSON-LD to a client site, the work currently passes through Lance's eyes. Spec-driven version: prospect URL + scan + ICP -> agent generates schema -> validation harness checks (against schema.org spec, against the prompt-defined ICP rules, against deliverability constraints) -> agent regens until valid -> ship. Same loop pattern.
  - **Audit deliverable factory.** Once the audit auto-populator ships (separate item below), the per-section content is a candidate for spec/test pattern: the spec defines what each section must contain (e.g., "schema review must list at least 3 missing types with code examples"), tests validate, agent regenerates failing sections.
- **Effort:** ~6-10 hours per surface to extend the spec/test pattern. Compounds over time — every new generation surface gets the same harness pattern.
- **Why gated on Phase 2:** Two reasons. (1) Spec/test factories work best when there's a measured win condition. Cold email's win condition is reply rate, which Phase 2 will measure properly. Without Phase 2, the spec is "Lance squints and says it looks right," which is the same human-judgment loop we're trying to remove. (2) Adding the pattern to every surface at once is over-engineering. Wait for the first surface beyond cold-email to hit a measurable failure mode that human review keeps catching but agents can't currently — that's the right moment to extend.
- **Reference:** generator.js validateOutreachOutput already does this for cold email at lines ~404-455. Use it as the canonical pattern when extending.

### Dashboard "hand-raisers to reach out to" recommendation: filter beyond scan count

- **Trigger:** Whenever check.neverranked.com dashboard is being touched, OR when manually-flagged prospects from the recommendation list keep turning out to be ICP mismatches.
- **Origin:** 2026-05-06. The dashboard recommended reaching out to 8 hand-raisers based on multiple self-scans alone. Of the 4 we generated drafts for (cpb.bank, inpacwealth.com, helloagaincoffee.com, maxssportsbar.com), 3 turned out to be wrong-ICP on review:
  - **CPB Bank** — publicly traded, decisions go through agency-of-record + procurement. $750 audit is rounding error to them and a procurement nightmare. The "5 scans" was almost certainly an employee or vendor testing the tool, not a buyer.
  - **Hello Again Coffee** — local coffee shop. AEO matters less than Google Maps + Yelp + Instagram for foot traffic. Owner's not a buyer for $750 audit + monthly retainer.
  - **Max's Sports Bar** — same problem. Wrong ICP for the offer.
  - **InPac Wealth** — actually a fit (small RIA, founder reads email), but never sent.
  - All 4 drafts deleted to keep the work surface clean.
- **What to build:** Sharpen the recommendation engine. Don't just count scans. Apply ICP filters before flagging:
  - Headcount under 50 (skip publicly traded, skip enterprises)
  - Decision-maker title detected (Founder / Owner / Principal / CEO at small biz, NOT distributed enterprise marketing roles)
  - Vertical match against NR's playbook list (dental, law, financial advisor, real estate, HVAC, restaurant, etc. — not sports bars or coffee shops)
  - Maybe also: "score below 40" filter (huge improvement headroom matters more than 25 vs 30)
- **Effort:** ~2-3 hours dashboard worker changes + ICP filter spec.
- **Why gated:** The recommendation engine is currently low-stakes (it just shows a panel; nothing auto-fires). The cost of bad recommendations is wasted founder time generating drafts for wrong-ICP prospects. Worth fixing when the dashboard is being touched anyway, not as a standalone push.

### Capture rate optimization on check.neverranked.com

- **Trigger:** Either of these — (a) fix the capture rate before the next 100 scans run (cheap, high ROI), OR (b) hold until we have a baseline of 200+ scans with the current capture flow to run an A/B test on email gate placement.
- **Origin:** Free-check dashboard flagged 1% capture rate vs 5-15% benchmark on 2026-05-06.
- **What to build:**
  - **Move the email gate higher in the report.** Currently gates at the end of the full report. Test gating after one specific high-tension section (e.g., "we found N specific gaps, drop your email to see them and the fix list").
  - **Test stronger CTA copy.** "Get my full 90-day fix list" or "Send me the 6-engine citation report" beats "Email me the report."
  - **Add scarcity / specificity to the gate.** "We've run X scans this week. Get in line for the report." (Honest only if the volume claim is real.)
  - **Track conversion at each gate variant via the dashboard.** Use `send_log.note_variant` pattern from the outreach repo to record which gate variant the visitor saw.
- **Effort:** ~1-2 hours dashboard worker changes + new gate component.
- **Why gated:** Lance flagged this from the dashboard recommendation list. It's a fast win whenever we get to it. Doesn't need to wait, just needs prioritization.

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
