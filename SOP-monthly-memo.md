# SOP: Monthly delta memo

**Audience:** Lance, future Atlas, any future operator running the monthly cadence for a paying customer.
**Status:** living document. Update when a monthly memo cycle surfaces a pattern this doc does not cover.
**Last updated:** 2026-05-25 (initial draft).

---

## Purpose

The monthly delta memo is the recurring deliverable for the $1,500/month ongoing engagement. It is the moment the customer hears what moved, what did not, and what the data points at for the next month. The memo is Lance's interpretation layer on top of the dashboard's continuous data layer. The dashboard surfaces signals daily. The memo turns signals into prioritized action with strategic framing.

A good monthly memo: the customer reads it on Monday, sees their senior strategist on Tuesday, and the strategist already knows what work needs to ship that week. A weak monthly memo: the customer reads it, files it, never references it again.

This doc covers the workflow from "monthly cycle ready to write" to "memo delivered and customer briefed."

---

## When to write

The monthly memo fires on the 25th of each calendar month for engagements that started before the 1st of the month. Customers whose engagement kicked off mid-month get their first monthly memo on the first 25th that lands at least 21 days after kickoff.

This timing is deliberate. The 25th gives 5-7 days before the next 1st-of-month dashboard reset, which lets the customer act on the memo before the next measurement cycle starts. Avoids landing the memo on a Friday whenever possible.

---

## Pre-memo prep (Atlas or Lance, 30 min)

1. **Pull the previous monthly memo** for this customer. The new memo will reference what was prioritized last month and report honestly on whether those moves landed.
2. **Pull the customer's last 30 days of dashboard data.** Specifically:
   - Mention share by week (4 weekly snapshots)
   - Per-AI-tool mention counts by week
   - Per-query coverage (which of the 18 questions mentioned the customer in week 1, week 2, week 3, week 4)
   - Position-in-answer changes
   - New third-party hosts that started appearing for this category
   - Drift alerts that fired during the month
3. **Pull the cohort delta.** Which cohort competitors gained mentions, which dropped, which had no change. The customer cares about cohort-relative movement more than absolute movement.
4. **Note any cohort additions or category structural changes** that happened during the month (cohort expansion, new AI tool added, methodology change). The customer needs to know if a number moved because their work moved it or because the measurement surface shifted.
5. **Read the customer's brand-brain file** (`templates/customer-brand-brain-template.md` cloned per customer; see SOP-customer-onboarding.md Day 5). Specifically: section 5 (recommendation trajectory, what's been recommended vs what they shipped vs what moved), section 7 (open threads), and section 8 (personalities and preferences). The brand-brain is the institutional knowledge that makes a high-quality memo possible without re-deriving context every month. After writing the memo, **update the brand-brain** with this month's observed events: add the month's row to section 6 (citation trajectory), close completed open threads from section 7 and move them to section 5, surface any new threads.

---

## The memo structure (target 6-8 sections, 4-6 pages PDF or markdown)

### 1. The one-paragraph honest read

Open with a single paragraph the customer reads in 30 seconds. What moved this month? What did not? What does the data point at?

Example shape:
> *"This month: your firm gained mentions on 3 additional questions (now mentioned on 7 of 18 vs 4 of 18 last month). The gain came primarily from the SmartAsset profile work your team shipped on the 8th. Microsoft Copilot remains at zero, consistent with the cohort-wide pattern. Cohort competitor masudalehrman.com gained 12 mentions; their content push on retirement-planning articles is showing up in Perplexity and Google AI Overviews. Recommended next-month focus below."*

If the customer reads nothing else, they should know after this paragraph: (1) the direction, (2) the cause, (3) the cohort context, (4) the recommendation framing.

### 2. What moved

Specific gains and drops since last month. Tables and short bullets. Each row should answer "what changed AND why we think it changed."

| Question | Last month | This month | Δ | Likely cause |
|---|---|---|---|---|
| "Hawaii financial advisor for inherited wealth" | 0 mentions | 2 mentions | +2 | The October article shipped to Hawaii Business Magazine |
| "best wealth manager in Hawaii" | 0 mentions | 0 mentions | flat | No editorial work this month targeting head queries |

Use the "likely cause" column observationally, not as causal claim. "Likely cause" means "the timing correlates and the work touched this surface." Causation requires pre-registered experiments.

### 3. Per-AI-tool report

7 short rows. What did this AI tool say about you this month? Where did it cite your site, where did it not? Did training-data presence change in Claude or Gemma?

### 4. Cohort movement

Top 5-10 cohort competitors, their mention counts this month, the delta. Surface the firms that moved most (gained or dropped). The customer needs the cohort context to interpret their own movement.

### 5. New observations worth naming

Anything that surfaced this month that did not exist in earlier measurements. New third-party hosts AI started citing. New cohort firms that surfaced in coverage. New buyer questions worth adding to the locked set (rare; locked questions stay locked, but the customer should know if the buyer surface is shifting).

### 6. What the data points at for next month

Three to five specific recommendations, ordered by leverage. Each one names:
- The condition we observed
- The work the data points at
- The expected timeline for observable change

Example:
> **1. SmartAsset profile depth.** The SmartAsset listing started getting AI citations on the 8th, but only for the "fee-only" question subset. The other 12 questions still show competitors' SmartAsset profiles, not yours. Recommended: extend the SmartAsset profile to include the buyer scenarios for the 12 missing questions. Expected observable change in 3-4 weeks if AI tools re-crawl the SmartAsset profile during that window.

This is the prioritization layer the dashboard cannot provide. Sequencing, what to do FIRST, what to skip this month, what to defer.

### 7. Strategic framing (when appropriate)

Sometimes the memo needs to step back from the per-question detail and name a category-level pattern the customer should think about. Examples:
- "The cohort's Microsoft Copilot gap is starting to close (1 firm gained Copilot presence this month). Worth considering a focused push."
- "Three competitors started citing Wikipedia entries for their named principals this month. We do not yet have a Wikipedia entry for [customer's named principal]; worth considering."
- "AI tool X just released a new version that weights structured data more heavily. Worth checking your structured data is current."

Skip this section if there is nothing strategic to name. Better to have no strategic section than a forced one.

### 8. Cross-category context (when relevant)

If the customer's category has cross-category implications worth naming, surface them here. Example: "Banking-category data we now have suggests the on-site work that pays off for banks does NOT pay off for wealth firms at the same rate; your category's gains will continue to come more from off-site than on-site."

Skip when not relevant.

### 9. What did not move (the honest section)

If the customer's team shipped work this month that the data does not yet show movement on, name it honestly. Do not soften. Examples:
- "The named-attorney bylines published in September have not yet shown up in AI citations. This is consistent with the 6-12 month timeline for training-data signals; the August byline shipped first is now appearing in Claude."
- "The Microsoft Copilot push has not produced any movement. Bing organic ranking has not shifted; the gap remains."

A good memo names what did not work as cleanly as what did. The customer trusts the memo more because of that section.

### 10. Methodology note

A short paragraph at the end naming any methodology changes this month. Cohort additions, AI tool changes, measurement-window shifts. The customer should never be surprised by a number change they cannot trace.

---

## After the memo ships (Lance, 15 min)

1. **Send the memo as both PDF and markdown.** Customer chooses how they want to consume it. PDF for forwarding to senior strategist or board. Markdown for internal teams that work in plain text.
2. **Schedule a 15-min follow-up** within 7 days if the memo flagged anything strategic. Optional, customer can decline. This is the conversation that turns "interesting read" into "we shipped the work."
3. **Update the customer's dashboard pointer** ("next monthly memo: [date+1 month]") so the dashboard reflects the new schedule.
4. **File the memo** in the customer's record so next month's memo can reference it cleanly.

---

## Quality bar (what makes a memo good)

| Sign of a good memo | Sign of a weak memo |
|---|---|
| Opens with a 1-paragraph honest read the customer absorbs in 30 seconds | Opens with methodology recap or pleasantries |
| "Likely cause" columns are observational, never causal claims | "Our work caused" or "we drove" appears anywhere |
| Specific firm names, specific question text, specific URLs | Generic phrasing like "competitive landscape" or "your category" |
| What did not move is named honestly, including the customer's own shipped work | What did not move is omitted or softened |
| Recommendations are sequenced (do X first, then Y) | All recommendations presented as equal-priority |
| Cross-category context surfaces when there is something to surface | Every memo has a forced cross-category paragraph regardless |
| Methodology notes name any number-changing changes transparently | Number changes appear without explanation |

---

## Common pitfalls

1. **The recap-only memo.** Memo just lists what changed without interpretation. Customer reads it, does not know what to do next. Always include "what the data points at for next month."
2. **The causation creep.** Memo language drifts toward "our work drove" or "we caused the lift." Stay observational. The work shipped, the data moved, the timing correlates. That is the most we say.
3. **The hype memo.** Memo overstates gains, downplays drops. Customer trust erodes the first time they catch the spin. Section 9 (what did not move) is the trust anchor; never skip it.
4. **The methodology surprise.** Customer notices a number changed and we did not flag the cohort expansion or methodology shift that caused it. Always lead with methodology notes if any moved.
5. **The wall-of-text memo.** Memo is 12 pages of dense prose. Customer skims, files, moves on. Target 4-6 pages with tables, bullet structure, and clear section breaks. The 1-paragraph open is doing the heaviest lifting.
6. **The strategist-replacement memo.** Memo tries to do the senior strategist's job by recommending specific copy, specific page edits, specific exact next moves. That is the strategist's job; the memo names the condition and the strategist names the response. Crossing that line erodes the agency relationship for agency-channel engagements.

---

## When Atlas takes this role

The monthly memo is the highest-leverage automation candidate for Atlas (the Lance-judge-layer agent). Atlas can:
- Pull the data layer cleanly (already structured in the dashboard's underlying tables)
- Generate sections 2-6 (per-AI-tool report, cohort movement, observations, recommendations) from templates trained on Lance's past memos
- Draft section 1 (the honest read) in Lance's voice

What Atlas should not yet do without Lance review:
- Section 7 (strategic framing) requires judgment about what is strategically relevant for this specific customer in this specific moment
- Section 9 (what did not move) requires the discipline to name honestly even when the customer's team would prefer it softened
- Section 10 (methodology note) requires knowing when a number-changing methodology change happened

Workflow when Atlas matures: Atlas drafts the full memo, Lance edits sections 7-9, sends.

---

## When to update this SOP

- A new customer engagement surfaces a memo pattern this doc does not cover.
- A category-specific finding emerges that should be a standard memo section for that category.
- Atlas matures enough to handle section 7-9 with acceptable quality, in which case the workflow updates.
- A memo we shipped produces a customer reaction (positive or negative) worth learning from. Add the lesson here.
