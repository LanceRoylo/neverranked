# Montaic Content Calendar

**Purpose:** Answer "what's next" for Montaic's blog in one file. Not a spreadsheet. A living doc that replaces the ad-hoc "figure out the next piece when the last one ships" pattern.

**Updated:** 2026-04-11
**Cadence:** one pillar article every 2 weeks
**Current pipeline state:** SIX PILLARS LIVE. A11, A12, A13 shipped 2026-04-10. A14 shipped 2026-04-11. A15 shipped 2026-04-11. A16 shipped 2026-04-11. Both clusters at three pillars each: Fair Housing (A11, A12, A15) and Listing Differentiation (A13, A14, A16). Pipeline empty. Next piece is A17 (voice calibration experiment, Candidate D from the A16 rescoring block).

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

**Drafting slot:** empty. A17 next (voice calibration experiment, Candidate D).
**Voice pass slot:** empty.
**With Claire slot:** empty.
**Live slot:**
- A11 "Fair Housing AI Compliance Agents" at `/blog/fair-housing-ai-compliance-agents`. Shipped pre-2026-04-10. Reciprocal mentions pointing at A13 added 2026-04-10.
- A12 "Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026" at `/blog/fair-housing-listing-description-rules`. Shipped 2026-04-10. Reciprocal mentions pointing at A13 added 2026-04-10.
- A13 "Why Zillow Listings All Sound the Same (And Why It's Costing Agents Leads)" at `/blog/zillow-listings-all-sound-the-same`. Shipped 2026-04-10. Opens Listing Differentiation cluster. Reciprocal mention to A14 added 2026-04-11.
- A14 "We Ran 53 Nashville Listings Through ChatGPT. Here Is What Happened." at `/blog/chatgpt-53-nashville-listings`. SHIPPED 2026-04-11 (listing-pipeline-ai commit `b91587c`). Second Listing Differentiation pillar. Back-propagation to A13 mentions array landed in same commit.
- A15 "HUD Just Quietly Withdrew Nine Fair Housing Guidance Documents. Here Is What Still Applies to Your Listings." at `/blog/hud-2026-fair-housing-guidance-withdrawal`. SHIPPED 2026-04-11 (listing-pipeline-ai commit `f1d2cca`). Third Fair Housing pillar. Back-propagation to A11 and A12 mentions arrays landed in same commit. News-hook piece on Federal Register Notice 2026-06624.
- **A16 "Why 96 Percent of ChatGPT Listings Open With the Same Two Words" at `/blog/96-percent-chatgpt-listings-opening`. SHIPPED 2026-04-11 (listing-pipeline-ai commit `cc425e8`). Third Listing Differentiation pillar. Back-propagation to A13 and A14 mentions arrays landed in same commit. Introduces the three-sentence rule. Evergreen.**

**Cross-cluster schema bind is live in both directions.** A11, A12, and A15 carry reciprocal `mentions` within the Fair Housing cluster. A13, A14, and A16 carry reciprocal `mentions` within the Listing Differentiation cluster. A14 mentions A11 and A12 for cross-cluster bind. A15 mentions A14 for cross-cluster bind. A16 mentions A12 for cross-cluster bind. Nine live edges across two clusters, six live pillars total. Both clusters symmetric at three pillars each.

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

### #2 PROMOTED TO A15 (2026-04-11, PIVOTED to news-hook same day, count corrected same day): HUD Just Quietly Withdrew Nine Fair Housing Guidance Documents. Here Is What Still Applies to Your Listings.

**Status:** LOCKED as A15 news-hook pivot with count correction. Master working doc at `A15-hud-2026-guidance-withdrawal.md`. Phase 1 locked 2026-04-11. Phase 2 all blockers CLOSED 2026-04-11. Phase 3 draft complete 2026-04-11 at `A15-draft.md`. Phase 4 Claire handoff stub complete 2026-04-11 at `A15-claire-paste-this.md`. Ready for Lance voice pass and Claire publish.
**Cluster:** EXISTING. Fair Housing (third pillar, cluster return after A14 override).
**Lever:** News hook plus Specificity plus Count correction.
**Primary citation source:** HUD Gibbs memo (signed September 17, 2025), Federal Register Notice 2026-06624 (published April 6, 2026, pages 17291-17292), 42 U.S.C. § 3604(c), 24 C.F.R. § 100.75 (already cited in A12), post-2010 Fair Housing advertising enforcement cases as needed for current-authority mapping.
**Frame (2 sentences):** On April 6, 2026, the Federal Register published Notice 2026-06624. Trade press reported eight withdrawn fair housing guidance documents, but the underlying HUD memo (effective September 17, 2025, 201 days before the Federal Register caught up) actually withdraws nine, including a 2024 guidance on advertising through digital platforms that sits directly on top of Montaic's customer base. The piece corrects the count, names the timeline gap, walks each of the nine items against the statute and regulation that still cover the same territory, and explains why Montaic's compliance layer did not change when HUD narrowed the guidance layer.

**Pivot history:**

A15 was originally scoped as a narrow-variant correction of "the 1989 HUD word list" (topic #2 original framing). Phase 2 Blocker 1 research on 2026-04-11 revealed three facts that invalidated the original thesis and corrected a public-record error: (a) the artifact was not a 1989 memo but 24 C.F.R. Part 109, a formal regulation rescinded May 1, 1996 via directive FR-4029-F-01, (b) HUD published Notice 2026-06624 on April 6, 2026 announcing the withdrawal, and (c) the underlying Gibbs memo actually withdraws nine guidance documents (not eight as NAHRO and LeadingAge reported), and the memo took effect September 17, 2025, 201 days before the Federal Register caught up. The news hook is five days old, directly overlaps Montaic's cluster via item #9 (digital platforms advertising guidance, April 29, 2024), and Montaic becomes the first publisher to anchor the accurate count. A15 pivoted same day. The 1989 through 1996 history becomes a one-paragraph context subsection in the body rather than the whole thesis.

**Why news-hook pivot works:**

- A12 already did 42 U.S.C. § 3604(c) and 24 C.F.R. § 100.75 research. Reuse for the current-authority mapping.
- A11 already framed the statutory authority. Reuse.
- News-hook window is five days old. No competitor has published the corrected-count nine-item mapping yet.
- Item #9 is "Guidance on Application of the Fair Housing Act to the Advertising of Housing, Credit, and Other Real Estate-Related Transactions through Digital Platforms" (April 29, 2024). Direct overlap with Montaic's customer base.
- Count correction ("nine, not eight") is a durable authority signal. First publisher to anchor the accurate number becomes the citation source.
- Commercial hook is the strongest Fair Housing hook Montaic has had: "Montaic never cited the withdrawn guidance as authority, so our compliance layer did not change."

**Why this wins the A15 slot:**

- Honors the A14 override catchup commitment. A14 extended Listing Differentiation. A15 restores Fair Housing alternation.
- Three-pillar Fair Housing cluster signal (A11 plus A12 plus A15).
- News-hook velocity. Notice 2026-06624 is five days old. Every day of delay is compounding lost.
- Commercial hook lands with specificity. "Montaic screens against 42 U.S.C. § 3604(c), 24 C.F.R. § 100.75, and a case law corpus. Withdrawn guidance does not change what we check because we never cited guidance as authority."
- Invokes the news-hook-per-quarter policy (below) at max strength.

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
- **A15 restoration (2026-04-11).** A15 returns to Fair Housing. Originally scoped as topic #2 narrow variant ("1989 HUD word list correction"). Same-day pivot to news-hook frame on Federal Register Notice 2026-06624 after Phase 2 research surfaced two findings that invalidated the original thesis. Cluster alternation restoration is preserved. News-hook policy invoked (see below). Full rationale in the A15 master doc.
- **A16 decision (open).** Default is alternation back to Listing Differentiation. News-hook pieces can jump the queue per the news-hook policy.

### 3. News-hook vs. evergreen mix

**Default:** evergreen pieces. News hooks (HUD guidance updates, DOJ settlements, new case law) can jump the queue and replace the next drafting slot if the news is time-sensitive.

**Limit:** no more than one news-hook piece per quarter. Evergreen compounds, news hooks decay.

**Q2 2026 news-hook invocation (2026-04-11).** A15 pivoted to news-hook frame on Federal Register Notice 2026-06624 (published April 6, 2026). This is the Q2 2026 news-hook slot. No further news-hook piece can ship in Q2 2026 without explicit revisit of this limit. A16 returns to evergreen per default.

---

## A16 candidate re-scoring (2026-04-11)

**A16 Phase 1 frame lock (2026-04-11):** Candidate C PROMOTED TO A16. Candidate E ABSORBED into A16 as a body section. Candidate D held for A17. Candidate B parked for A18 or later. Candidate F parked for Q3 2026 news-hook slot. Candidate A held as serviceable backup. Master doc at `audits/montaic/implementation/A16-96-percent-chatgpt-opening.md`.

**A16 Phase 2 CLOSED (2026-04-11, commit 16b8731):** all three blockers complete in roughly 90 minutes versus 2.5-hour scoped estimate. Key finding not named in A14: ChatGPT's 53 outputs are a single point mass in the 3-4 score bucket, zero variance above mediocre. Phase 1 frame amended to include the score-distribution finding, the three-sentence rule as refined mechanism, a three-outlier positive example set (replacing single Brentwood case study), and three new external citations (Shumailov Nature 2024, Strong Model Collapse ICLR 2025, Attributing Mode Collapse in Fine-Tuning 2025). Factual correction applied: Brentwood listing does not open with the dollar figure, the $45K Pella fact is in sentence two, and the grader explicitly flagged the opening as generic.

**A16 Phase 3 drafting COMPLETE (2026-04-11):** body-only draft at `audits/montaic/implementation/A16-draft.md`, 2514 words across 9 body sections plus 6-Q FAQ plus closing, target range 2000 to 2600. Voice-check fails on filler-phrase grep (6 hits: 5 occurrences of the two-word opening phrase and 1 occurrence of the rare-opportunity variant) under the A14 known-exception precedent because the banned phrases are the subject of analysis, quoted as evidence, not used in authorial voice. A14-draft.md ships with 11 filler phrase hits under the same precedent. Phase 4 (Claire handoff and schema wiring) next.

The original backlog (#1 through #5) was scored under A13 conditions, before A13, A14, and A15 actually locked. The cluster state has changed. Fair Housing is now a three-pillar cluster (A11 plus A12 plus A15). Listing Differentiation is at two pillars (A13 plus A14). A16 returns to Listing Differentiation per alternation default and returns to evergreen per news-hook policy.

A13 and A14 also produced an asset the original backlog did not anticipate: the 53 Nashville three-way dataset (Zillow originals, ChatGPT gpt-4o-mini, Montaic default). That dataset is reusable for A16 without a new data-collection run, which changes the effort math for any data-driven frame.

### Candidates considered

Six candidates were walked against the Hello Momentum four-test battery. Two are backlog items (refreshed). Four are new frames surfaced from the A13/A14 data state.

**Candidate A (from backlog): #5 MLS Description Playbook, refreshed with Nashville 53 data.**
- Frame: the structural and phrase patterns that actually score above 6/10, grounded in the three-way dataset.
- Swap test: weakest of the six. A best-practices playbook is the category competitors write most often. The data anchor helps but does not fully protect the frame.
- Lever test: "Structural Playbook plus Empirical Grounding." Nameable but not distinctive.
- Authenticity test: partial. The data is Lance's. The playbook structure is not a Lance observation, it is a synthesis.
- So What test: strong. Agents can copy specific patterns on Monday morning.
- Verdict: serviceable. Not the strongest A16 frame under HM lens.

**Candidate B (from backlog): #4 Yacht Listing Descriptions.**
- Frame: real estate playbooks fail at sea, and the yacht listing category has different compliance, different buyers, and different emotional levers.
- Swap test: strong. Nobody is writing this from a Montaic-adjacent angle.
- Lever test: "Vertical Pivot plus Contrast."
- Authenticity test: partial. Lance is not a yacht broker. Montaic has yacht-specific product fields but the outside observation is secondhand.
- So What test: medium. Narrow audience.
- Verdict: defer. Opening a third cluster when Listing Differentiation is only at two pillars fragments topical authority. Park for A18 or later, after Listing Differentiation hits three pillars.

**Candidate C (new frame): "Why 96 Percent of ChatGPT Listings Open With the Same Two Words".**
- Frame: take the single sharpest finding from the A14 Nashville dataset (96 percent of ChatGPT outputs opened with the same two-word phrase) and turn it into the headline. Walk the other five or six most-overused patterns (the adjective "stunning" in 81 percent, the adjective "spacious" in 81 percent, the phrase "dream home" in 68 percent, the verb "boasts" in 66 percent, the literal phrase "MLS Description:" in 6 outputs). Each pattern gets a one-paragraph forensic read on why ChatGPT produces it and what the structural alternative looks like.
- Swap test: strong. Nobody has the three-way Nashville dataset. The 96 percent figure is Montaic-first.
- Lever test: "Data Mining plus Specificity." Same lever family as A14.
- Authenticity test: strong. Lance ran the experiment, Lance owns the numbers.
- So What test: strong. "Stop opening your listings with the phrase every ChatGPT output starts with." Direct Monday-morning action with a specific replacement.
- Effort: low. Reuses A14 data. No new tool runs required. Draft could start immediately after Phase 1 lock.
- Risk: listicle framing. Mitigated by leading with the narrative of the 96 percent finding rather than a numbered list.
- Verdict: strongest A16 candidate under HM lens. Ranks first.

**Candidate D (new frame): "The Voice Calibration Experiment" (fourth dataset run).**
- Frame: take the same 53 Nashville listings from A14, run them through Montaic's voice-locked path using Lance's own past listings as the style sample, and compare scores across four datasets (Zillow, ChatGPT, Montaic default, Montaic voice-locked). A14 explicitly promised this was where the gap widens further.
- Swap test: very strong. Nobody else has the voice-locked path.
- Lever test: "Controlled Follow-up Experiment plus Numbers on the Table."
- Authenticity test: has a structural issue. The voice sample has to come from somewhere. The cleanest source is Lance's own past listings, which creates a founder-on-founder-style question that needs addressing explicitly in the piece.
- So What test: very strong. Shows the actual lift from upgrading to the voice-locked path.
- Effort: medium. Requires roughly 2 hours of tool time to run the voice-locked path on 53 listings, plus grader pass. Infrastructure exists from A14.
- Risk: reads as product marketing. Could be the third or fourth Listing Differentiation pillar rather than the third.
- Verdict: strong frame, better as A17 or A18. Ranks second.

**Candidate E (new frame): "The $45,000 Window Listing" case study.**
- Frame: single-property deep dive on the strongest Montaic output from A14 (Brentwood property, Pella windows, 7/10 score). Walks the specific choices that lifted the score and generalizes the lesson: dollar figures beat adjectives.
- Swap test: strong. Specific property, specific score, specific grader notes. No competitor can write this piece.
- Lever test: "Case Study plus Specificity."
- Authenticity test: very strong. Lance ran the data and picked the example.
- So What test: medium. "Be specific" is a common lesson. The piece has to earn the lesson with a fresh mechanism, not just restate it.
- Effort: very low. Reuses A14 data.
- Risk: one listing is narrow. Better as a sidebar or section inside Candidate C than as its own pillar.
- Verdict: absorb into Candidate C as a body section rather than ship as a standalone A16. Ranks fifth.

**Candidate F (new frame, parked): Fair Housing news-hook follow-up to A15.**
- Frame: six-month look ahead on the enforcement and rulemaking sequence that surfaced during A15 research (EO 14281, January 14 2026 disparate impact proposed rule, DOJ v. Meta June 27 2026 sunset, the September 16 2025 FHEO enforcement priorities memo).
- Swap test: strong if published before the rulemaking closes.
- Lever test: "Calendar Piece plus Specificity."
- Verdict: blocked by the news-hook-per-quarter policy. Q2 2026 slot was used by A15. Park for Q3 2026 (earliest A18 or A19). Ranks sixth for A16 purposes but should stay in the queue for Q3.

### A16 ranked recommendation

1. **Candidate C: the 96 percent opening.** Strongest frame under HM lens, reuses existing data, evergreen, cluster-compatible, passes all four tests at max strength, lowest effort to draft.
2. **Candidate D: voice calibration experiment.** Strong frame, requires one data-run investment. Better positioned as the A17 climax of the Listing Differentiation cluster than as the third pillar.
3. **Candidate A: MLS Playbook refreshed.** Serviceable backup.
4. **Candidate E: the $45,000 window listing.** Absorb as a body section in Candidate C.
5. **Candidate B: Yacht listing descriptions.** Defer to A18 or later.
6. **Candidate F: Fair Housing Q3 news-hook follow-up.** Blocked by news-hook policy until Q3 2026.

### Open questions for Lance on A16

1. **Candidate C versus Candidate D.** If the goal is taste-score maximization, C wins on all four tests. If the goal is commercial yield (demonstrating product premium), D has a stronger product bridge. Recommend C for A16 and D for A17 so the cluster compounds on data before it compounds on product demo.
2. **Absorbing Candidate E into Candidate C.** If C is approved, the $45,000 window listing fits naturally as a "positive example" section showing what an above-6/10 listing actually does. Confirm whether you want E merged or held for a later standalone pillar.
3. **Listicle risk on Candidate C.** Frame must lead with the narrative of the 96 percent finding, not a numbered list. Headline grammar should mirror A13 and A14 ("Why 96 Percent..." not "10 Phrases..."). Confirm acceptable.
4. **Yacht timing revisit.** Candidate B is deferred. If Montaic's yacht customer base is growing faster than the content calendar assumes, revisit the defer. Otherwise park until Listing Differentiation cluster hits three pillars.

No A16 topic locks until Lance approves one of these candidates. This block is a decision doc only. It does not commit to a frame.

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

**A15 Phase 3: draft (news-hook frame with count correction, full research memo loaded).**

A15 Phase 1 is locked and Phase 2 is fully closed at `A15-hud-2026-guidance-withdrawal.md`. All three Phase 2 blockers CLOSED 2026-04-11:

1. **Blocker 1 CLOSED.** Gibbs memo and FR Notice 2026-06624 fetched, nine items documented (trade press miscounted at eight), 201-day gap between memo effective date and Federal Register publication logged, three-criteria framework captured.
2. **Blocker 2 CLOSED.** Nine-item current-authority mapping complete. Each withdrawn item mapped to the statute, regulation, and case law that still covers the same territory. Item #9 (digital platforms guidance, April 29, 2024) deep read captured the HUD concrete violation examples that validate Montaic's phrase-level grader. Five cross-cutting context shifts documented: EO 14281 (April 23, 2025 meritocracy order), September 16, 2025 FHEO enforcement priorities memo, January 14, 2026 HUD proposed rule eliminating 24 C.F.R. § 100.500, EO 13988 rescission, EO 13166 rescission via EO 14224.
3. **Blocker 3 CLOSED.** Enforcement action audit in the 201-day gap window confirms no HUD or DOJ enforcement action filed between September 17, 2025 and April 6, 2026 cited any of the nine withdrawn guidance documents. DOJ v. Meta settlement (S.D.N.Y. 2022) still active through June 27, 2026. November 25, 2025 Secretary Turner letter on criminal screening and December 11, 2025 FHEO investigation of City of Boston indicate FHEO is operating on statute and regulation directly rather than on the withdrawn guidance.

Phase 3 draft target: 2026-04-18 (seven days after Phase 1 lock) to preserve the news-hook window.

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
