# Montaic Content Calendar

**Purpose:** Answer "what's next" for Montaic's blog in one file. Not a spreadsheet. A living doc that replaces the ad-hoc "figure out the next piece when the last one ships" pattern.

**Updated:** 2026-04-10
**Cadence:** one pillar article every 2 weeks
**Current pipeline state:** A12 with Claire, A13 drafting slot open (topic lock needed)

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

Updated every time a piece moves. Last update: 2026-04-10.

**Drafting slot:** OPEN. A13 awaiting topic lock (see backlog below).
**Voice pass slot:** empty.
**With Claire slot:** A12 "Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026". Handoff at `A12-claire-paste-this.md`. Awaiting Claire session.
**Live slot:** A11 "Fair Housing AI Compliance Agents" at `/blog/fair-housing-ai-compliance-agents`. verify-deploy last-confirmed clean.

---

## Candidate backlog

Five topics ranked by fit for the A13 slot. Each candidate has a frame, a named creative lever, a primary citation source, and a cluster assignment.

Every candidate has been pre-evaluated against the Hello Momentum tests: swap test (would it feel wrong if a competitor published it), lever test (can you name the creative mechanism), authenticity test (is this a real observation Lance has or is it research-sourced).

---

### #1 RECOMMENDED: Why Zillow Listings All Sound the Same (And Why It's Costing Agents Leads)

**Status:** unlocked, ready to promote to A13
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

### #2: The HUD Advertising Word List Doesn't Exist Anymore. Here's What Replaced It.

**Status:** unlocked, next Fair Housing cluster slot
**Cluster:** EXISTING. Fair Housing (deepens A11/A12).
**Lever:** deep research + contrarian framing
**Primary citation source:** the 1989/1995 HUD memo history, FHEO Handbook 8025.1 (already cited in A12), the case law that replaced the list, state fair housing commission enforcement records
**Frame (2 sentences):** Every Fair Housing training still hands out "the HUD Word List." That list is from 1989, it was withdrawn quietly in the 2000s, it is no longer published on hud.gov, and the piece explains what the list was, why it was withdrawn, and what the current legal authority actually is.

**Why #2 not #1:**

- Stays in the Fair Housing cluster, which is good for cluster discipline but risks saturating that keyword surface before the cluster has earned its authority
- Research burden is heavy. Tracking the Word List withdrawal timeline requires primary source digging that could easily turn into a 2-week research project by itself.
- Commercial hook is compliance, which is the same hook as A11 and A12. Less differentiation than #1 for Montaic's positioning.

**When to promote:** after A13 lands and the Listing Differentiation cluster is established. Likely A14 or A15.

---

### #3: What ChatGPT Gets Wrong About Your Listing

**Status:** unlocked, parking lot
**Cluster:** NEW. AI Content Quality.
**Lever:** direct product demo + AEO discourse
**Primary citation source:** side-by-side examples of ChatGPT default listing descriptions vs. Montaic-generated descriptions, with specific failure modes (Fair Housing hits, bland openings, wrong audience framing, scroll-depth drops)
**Frame (2 sentences):** Agents have been pasting "write me an MLS description for a 3-bed 2-bath" into ChatGPT for two years now. This piece shows what ChatGPT actually produces, what is wrong with it, and why the failure modes are predictable enough that the correct fix is not a better prompt but a different tool.

**Why #3 not higher:**

- Overlaps with A12's operational framing. A12 already shows what Fair Housing failures look like.
- The "AI discourse" angle risks dating quickly. ChatGPT changes every 6 months. Specific examples age out.
- Better as a cluster-support piece than a cluster-starter. Works well as A14 or A15 inside the Listing Differentiation cluster.

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

**Lock A13 topic.**

Default pick: #1 "Why Zillow Listings All Sound the Same (And Why It's Costing Agents Leads)."

Alternative: #2 "The HUD Advertising Word List Doesn't Exist Anymore. Here's What Replaced It." if cluster discipline beats new-cluster-velocity as the current priority.

Once locked, promote the topic into a real A13 master working doc using the A11 pillar stub and run the same Phase 1 → Phase 2 → Phase 3 → Phase 4 sequence that shipped A12.
