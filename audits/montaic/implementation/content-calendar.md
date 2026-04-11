# Montaic Content Calendar

**Purpose:** Answer "what's next" for Montaic's blog in one file. Not a spreadsheet. A living doc that replaces the ad-hoc "figure out the next piece when the last one ships" pattern.

**Updated:** 2026-04-11
**Cadence:** one pillar article every 2 weeks
**Current pipeline state:** A11, A12, A13 SHIPPED 2026-04-10. A14 landed 2026-04-11 as `draft: true` at `/blog/chatgpt-53-nashville-listings`, pending Lance's second read and flip to `draft: false`. A15 in Drafting slot (topic #2 narrow variant, Fair Housing cluster return per A14 override catchup commitment).

---

## Cadence

**Proposal: one pillar article every 2 weeks.**

At steady state, four pieces are in flight at any moment. Each piece moves through the pipeline in order.

| Slot | What happens here | Target duration | Who owns it |
|---|---|---|---|
| Drafting | Claude drafts, Lance reviews frame + lever, Claude writes Phase 3 | ~1 week | Claude + Lance |
| Voice pass | Lance reads end-to-end, fixes anything that sounds off, runs voice-check.sh | 2 to 3 days | Lance only |
| With Claire | Publish handoff pasted, schema wired, `draft: true` held | 1 to 3 days | Claire |
| Live | `draft: false`, `verify-deploy.sh` clean, Rich Results Test 0 errors | ongoing | Never Ranked verification |

### Why 2 weeks

1. **AEO land-grab window.** AI engines are training on 2025 and 2026 content right now. The topical authority patterns Montaic establishes this year compound for years. Every 2-week gap is a piece Montaic did not ship into that window.
2. **Sustainable.** One week drafting plus one week production per piece leaves room for the voice pass without sacrificing Montaic product work, client conversations, or the coffee shop.
3. **Cluster discipline.** Pairs of cluster pieces ship about a month apart. That is tight enough to signal topical focus to Google and the engines, loose enough to absorb news hooks and client input.

### Why not faster

1-week cadence forces Claude to draft every week, Lance to voice-pass every week, Claire to publish every week. No slack for strategic work, product decisions, or real-world input. Quality collapses by piece 4.

### Why not slower

4+ week cadence means Montaic's topical authority builds at half the rate of competitors who ship on 2-week pairs. In an AEO land-grab, half-rate is functionally losing ground.

---

## Pipeline state

Updated every time a piece moves. Last update: 2026-04-11.

**Drafting slot:** A15 "The 1989 HUD Word List Is Withdrawn. Here Is What Replaced It." Master doc at `A15-hud-word-list-withdrawn.md`. Phase 1 locked. Phase 2 open (provenance research and post-2010 case law selection).
**Voice pass slot:** empty.
**With Claire slot:** A14 "We Ran 53 Nashville Listings Through ChatGPT. Here Is What Happened." Landed at `/blog/chatgpt-53-nashville-listings` as `draft: true` on 2026-04-11 (listing-pipeline-ai commit `0ed99f7`). Pending Lance's second read and flip to `draft: false`. Back-propagation to A13's `mentions` array is deferred until the flip.
**Live slot:**
- A11 "Fair Housing AI Compliance Agents" at `/blog/fair-housing-ai-compliance-agents`. Shipped pre-2026-04-10. Reciprocal mentions pointing at A13 added 2026-04-10.
- A12 "Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026" at `/blog/fair-housing-listing-description-rules`. Shipped 2026-04-10. Reciprocal mentions pointing at A13 added 2026-04-10.
- A13 "Why Zillow Listings All Sound the Same (And Why It's Costing Agents Leads)" at `/blog/zillow-listings-all-sound-the-same`. Shipped 2026-04-10. Opens Listing Differentiation cluster. Mentions A11 and A12 for cross-cluster bind. Grader-data section populated with a 53-listing Nashville run (average 4.6 out of 10, 31 listings scored 3 or 4, nothing cracked 7, "beautiful" in 38% and "spacious" in 34% and "stunning" in 21%).

**Cross-cluster schema bind is live in both directions.** A11 and A12 schemas carry `mentions` pointing at A13, and A13 carries `mentions` pointing at A11 and A12. Fair Housing cluster and Listing Differentiation cluster are linked as a single topical graph. A14 adds a third edge from Listing Differentiation into Fair Housing (mentions A11 and A12) but the reciprocal back-prop from A13 to A14 is held until A14 flips from `draft: true` to `draft: false`.

---

## Candidate backlog

Five topics ranked by fit for the A13 slot. Each candidate has a frame, a named creative lever, a primary citation source, and a cluster assignment.

Every candidate has been pre-evaluated against the Hello Momentum tests: swap test (would it feel wrong if a competitor published it), lever test (can you name the creative mechanism), authenticity test (is this a real observation Lance has or is it research-sourced).

---

### #1 PROMOTED TO A13 (2026-04-10): Why Zillow Listings All Sound the Same (And Why It's Costing Agents Leads)

**Status:** LOCKED. Master working doc at `A13-zillow-listings-all-sound-the-same.md`. Phase 1 complete. Phase 2 blocked on two inputs (see master doc).
**Cluster:** NEW. Listing Differentiation.
**Lever:** outsider triangulation (the coffee shop + photography/video + Redfin/Zillow-browsing vantage Lance locked in for A12 Section 9)
**Primary citation source:** comparative textual analysis of the top 50 most-viewed Zillow listings in a mid-size market. Original research Montaic can generate with the existing listing grader tool. Plus 1 or 2 secondary citations on scroll-depth behavior from real estate marketing research.
**Frame (2 sentences):** Every Zillow listing description opens with "Welcome home" or "Beautiful" or "Pride of ownership." That is not the agents' fault, and the fix is not "write better." It is that every listing description tool on the market trained on the same boilerplate corpus, and the only way to write a listing that sounds like you is to use a tool that actually trained on you.

**Why it wins the ranking:**

- **Clearest commercial hook.** Leads, not compliance. First Montaic piece to lead with revenue instead of risk.
- **Opens a new cluster.** Does not cannibalize A11 and A12's Fair Housing keyword surface. Expands Montaic's topical authority instead of stacking it.
- **Authentic.** Lance actually noticed this from browsing Zillow and Redfin. Not research-sourced. Passes the authenticity test.
- **Product bridge is built in.** "Montaic writes in your writing style" is the literal answer to the problem the piece describes. No forced pivot.
- **No new legal research.** Unlike Fair Housing deep-dives, this piece can be written from observation plus the existing Montaic grader output. Lower research burden, faster draft.
- **Passes the swap test.** No competitor has Lance's three vantages at once, so no competitor could write this specific piece without it feeling wrong.

**Risks:**

- Requires Montaic to run 50 listings through the grader to generate the comparative data. That is ~2 hours of tool time before drafting starts.
- Claim "costing agents leads" needs at least one credible source linking listing quality to lead conversion. If that source does not exist, the frame softens to "losing attention" which is weaker.

---

### #2 PROMOTED TO A15 (2026-04-11, narrow variant): The 1989 HUD Word List Is Withdrawn. Here Is What Replaced It.

**Status:** LOCKED as A15 narrow variant. Master working doc at `A15-hud-word-list-withdrawn.md`. Phase 1 locked. Phase 2 open (provenance research and case law selection).
**Cluster:** EXISTING. Fair Housing (third pillar, cluster return after A14 override).
**Lever:** Contrarian correction plus Specificity.
**Primary citation source:** the 1989 HUD memo provenance (to be confirmed), 42 U.S.C. § 3604(c), 24 C.F.R. § 100.75 (already cited in A12), two to three post-2010 Fair Housing advertising enforcement cases.
**Frame (2 sentences):** Fair Housing training still hands out a word list derived from a 1989 HUD staff memorandum that was never a rule, stopped being maintained in the 2000s, and was never formally replaced. The piece explains where the list came from, why it was withdrawn, what actually governs Fair Housing listing language today, and which phrases current enforcement catches that the 1989 list missed.

**Narrow variant scope:**

The A14 master doc flagged topic #2's research burden as potentially too heavy for a single cadence cycle. The narrow variant scopes the piece to the provenance correction plus the three-part current authority framework (statute, regulation, post-2010 case law) and defers the exhaustive withdrawal-timeline research. Target length 2100 words, narrower than A14's 2300.

**Why narrow variant works:**

- A12 already did 42 U.S.C. § 3604(c) and 24 C.F.R. § 100.75 research. Reuse.
- A11 already framed the statutory authority. Reuse.
- The narrow variant only needs new work on 1989 memo provenance (2 to 3 hours) and post-2010 case law selection (3 to 4 hours).
- The piece is a correction, not an encyclopedia. Narrowness is feature, not bug.

**Why this wins the A15 slot:**

- Honors the A14 override catchup commitment. A14 extended Listing Differentiation. A15 restores Fair Housing alternation.
- Three-pillar Fair Housing cluster signal (A11 plus A12 plus A15).
- Authentic Lance observation: he saw the 1989 list still circulating in training materials while building A12.
- Commercial hook lands with specificity. "Montaic screens against the current statute, the regulation, and the post-2010 case law. Not the withdrawn 1989 list."

---

### #3 PROMOTED TO A14 (2026-04-10, adapted as three-way comparison): We Ran 53 Nashville Listings Through ChatGPT. Here Is What Happened.

**Status:** LOCKED and SHIPPED as A14 on 2026-04-11 (`draft: true`, pending Lance flip). Master working doc at `A14-chatgpt-53-nashville-listings.md`. Adapted from the original "What ChatGPT Gets Wrong" frame into a controlled three-way comparison (53 Nashville originals vs ChatGPT gpt-4o-mini vs Montaic default path) because the Nashville 53 dataset from A13 was still fresh and reusable.
**Cluster:** EXISTING. Listing Differentiation (second pillar, compounds A13).
**Lever:** Contrast plus Specificity (numbers-on-the-table three-way comparison).
**Primary citation source:** three-way comparison dataset at `listing-pipeline-ai/apps/dashboard/scripts/zillow-50-nashville-three-way.json`. ChatGPT averaged 3.6 out of 10. Zillow originals averaged 4.6. Montaic averaged 5.1. Plus A13's citation stack reused (Zillow 2016, Iowa State 2023, Verbalized Sampling 2025, Price of Format 2025, NAR 2025).
**Override note:** A14 overrode the default cluster alternation policy. A15 restores the alternation with Fair Housing topic #2 as the catchup commitment.

---

### #4: Yacht Listing Descriptions: Why Real Estate Playbooks Fail at Sea

**Status:** unlocked, depends on yacht vertical decision
**Cluster:** NEW. Marine / Yacht Content.
**Lever:** product scope (opens Montaic's yacht broker vertical)
**Primary citation source:** yacht broker industry content, the handful of yacht listing description guides that exist, Montaic's yacht-specific fields and use cases
**Frame (2 sentences):** Every guide on how to write a great listing description assumes real estate. Yachts are different, the buyer is different, the specs are different, the emotional pull is different, and the compliance framework is different.

**Why #4 not higher:**

- Depends on whether Montaic is pushing the yacht vertical now or waiting for a larger yacht customer base. This is not an A13 decision. It is an A15 or A16 decision.
- Opens a completely new audience. Risk of audience fragmentation before the real estate cluster has compounded.

---

### #5: The MLS Description Playbook Most Agents Don't Know About

**Status:** unlocked, parking lot
**Cluster:** NEW. Listing Differentiation (same as #1 if that cluster is promoted).
**Lever:** insider/outsider triangulation
**Primary citation source:** NAR Fair Housing advertising resources (live), MLS description best-practice guides from top brokerages, Montaic observations from listings passed through the grader
**Frame (2 sentences):** Most agents learned MLS description writing from a one-day training or a broker handout. Neither covers the structural order that works for scroll-depth, the specific phrases that trigger Fair Housing review vs. the ones that pass, or the sentence length patterns real estate portals actually prioritize.

**Why #5 not higher:**

- Directly product-adjacent. Could be a pillar for Montaic's tool pages.
- Lever overlaps with #1 so these two compete for the same slot in the Listing Differentiation cluster.
- Better as A14 or A15 than A13 because #1 is more distinctive (the Zillow framing is a stronger hook).

---

## Open strategic questions

These are flagged for Lance's attention but not blocking A13.

### 1. Yacht vertical timing

Does Montaic's yacht broker vertical get its own cluster start (topic #4) in the next rotation, or does the blog stay focused on real estate until the yacht customer base is larger? Not an A13 decision. A15 or A16 decision. Flagging now so it is on the radar.

### 2. Cluster alternation policy

**Default:** alternate clusters as they are promoted. A11 and A12 were Fair Housing. A13 opens Listing Differentiation. A14 or A15 returns to Fair Housing (topic #2). The alternation signals topical range while still compounding cluster authority.

If that policy breaks down (e.g., a news hook forces three Fair Housing pieces in a row), revisit. Default is the starting point, not the commitment.

**Override history:**

- **A14 override (2026-04-10).** A14 stayed in Listing Differentiation instead of returning to Fair Housing. Three reasons: one-shot marginal-cost dataset economics, topic #3 passed Hello Momentum tests stronger than topic #2, cluster compounding signal. Full rationale in the A14 master doc.
- **A15 restoration (2026-04-11).** A15 returns to Fair Housing with topic #2 narrow variant. The narrow scope addresses the research burden concern that originally pushed topic #2 out of the A14 slot. Alternation is restored starting at A15.
- **A16 decision (open).** Default is alternation back to Listing Differentiation. News-hook pieces can jump the queue per the news-hook policy.

### 3. News-hook vs. evergreen mix

**Default:** evergreen pieces. News hooks (HUD guidance updates, DOJ settlements, new case law) can jump the queue and replace the next drafting slot if the news is time-sensitive.

**Limit:** no more than one news-hook piece per quarter. Evergreen compounds, news hooks decay.

---

## Update protocol

This doc is a living file. Update rules:

1. **After every publish.** Move the published piece to the Live slot. Shift the next piece into With Claire. Shift the next into Voice Pass. Shift the next into Drafting. Update the "Last update" date.
2. **After every voice pass.** Update the Voice Pass slot with the actual pass date.
3. **When topic backlog is added or reordered.** Update the ranking rationale, not just the order. Leaving the old rationale attached to a new order produces drift.
4. **After A13 locks.** Promote the winning topic to a real A13 master working doc at `audits/montaic/implementation/A13-{slug}.md` using the A11 pillar stub as the starting point.
5. **After A14 ships.** Review whether 2-week cadence held. If pieces slipped, revise the cadence down to 3 weeks in this doc. Do not pretend a missed cadence is still on target.

---

## Next action

**A15 Phase 2: research.**

A15 Phase 1 is locked at `A15-hud-word-list-withdrawn.md`. Two Phase 2 blockers are open:

1. **1989 memo provenance.** 2 to 3 hours of archive research (Wayback Machine, law review secondary sources, FHEO records) to confirm the exact provenance of the 1989 HUD advertising memo or document its absence. Claude can drive.
2. **Post-2010 case law selection.** 3 to 4 hours to select two or three Fair Housing advertising enforcement cases that show the stale-list problem in both directions (phrases the statute caught that the list missed, and phrases the list over-flagged that case law cleared). Claude can drive.

Total Phase 2 budget: 5 to 7 hours. Target completion before the cadence target of 2 weeks from A14 ship.

**Parallel track: A14 ship-out housekeeping** (Lance-owned, not blocking A15):

1. Second read of the A14 staged URL at `https://montaic.com/blog/chatgpt-53-nashville-listings`.
2. Flip `draft: true` to `draft: false` in `posts.ts`. Same commit adds A14 to A13's `mentions` array using the snippet in `A14-claire-paste-this.md`.
3. Run `./scripts/verify-deploy.sh` against the live URL.
4. Run Rich Results Test for BlogPosting and FAQPage extraction.
5. Update this content calendar: move A14 from With Claire slot to Live slot.

**Post-publish housekeeping for the Fair Housing cluster and A13** (optional, deferred):

1. **Submit A11, A12, A13, A14 URLs to Google Search Console** for re-indexing. 2 minutes in the GSC dashboard. Accelerates how fast the updated schema propagates to Google's index.
2. **Amplify the Nashville three-way headline as a standalone asset.** "53 Nashville listings. Three tools. ChatGPT averaged 3.6 out of 10. Montaic averaged 5.1." That delta is a marketing asset bigger than A14 alone and worth independent mileage on LinkedIn, Twitter, and the homepage footer.
3. **Track AI search citation emergence.** Query ChatGPT, Perplexity, and Google AI Overviews in 2 to 6 weeks with questions A13 and A14 were designed to answer. Log which of the four cluster posts get cited.
