---
title: "Naming the AEO measurement framework"
author: Lance + Claude
date: 2026-05-09
status: working draft, decision pending
---

# Naming the framework

NeverRanked has built a thing that no other AEO company ships. It
needs a name so it can be cited, sold, and referenced by people who
were not in the room when it was built. This doc lays out four
finalist candidates, the dimensions to choose between, and a
recommended pick.

## What the thing actually is

A reproducible measurement system for AI search citations. It runs
weekly across NR's tracked client universe and produces:

- A standing report on what AI engines cite, classified by source
  type (Wikipedia, Reddit, Google Maps, news wires, AEO competitor
  publications, AI grounding infrastructure, plus 9 more)
- Per-client baselines that double as case-study artifacts
- Per-source action briefs (when the gap is Wikipedia, do this;
  when it is Reddit, do this; when it is news, do this)
- A public hub at neverranked.com/state-of-aeo where the same
  numbers anyone can reproduce from the public schema
- A digest pipeline that puts the latest industry headline in
  every customer's weekly email

The thing is more than the report. It is the standing measurement,
the methodology, the source-type taxonomy, the brief library, and
the cron that keeps it fresh, all together. The report is the
artifact. The framework is the apparatus that makes the report
inevitable.

## Naming dimensions to choose between

Five axes. A name lands on each one whether the namer intends it
or not.

1. **Authority claim.** Does the name claim to be the standard, or
   does it position alongside other indices?
2. **Time implication.** Does the name suggest a snapshot, a
   stream, or an ongoing system?
3. **Subject framing.** Is the named entity the report, the
   methodology, the apparatus, or the data?
4. **Discoverability.** Does the name beat a search? "AEO Index"
   has SEO competition; "The Standing Brief" has none.
5. **Voice fit.** Does it sound like NR? NR's brand voice is
   confident, technical, slightly literary. It is not earnest tech
   marketing.

## Four finalists

### A. The Citation Index

**Frame:** Like the S&P 500 or the Magic Quadrant. A standing
measurement everyone references.

- Pros: Familiar shape. Lance can say "as of this week's Citation
  Index..." in a sentence and listeners parse it instantly. The
  word "Index" carries authority weight.
- Cons: SEO competition. "Citation Index" is the canonical name
  for academic citation databases (Web of Science, Scopus). NR
  would be muddying water with established terminology.
- Voice fit: Strong. Confident, factual.
- Discoverability: Weak. Search results dominated by Web of
  Science.
- What it forecloses: positioning the framework as something
  novel. "Index" implies comparable peers exist.

### B. The Citation Standard

**Frame:** Like the FAA flight-safety standard or the OWASP Top 10.
A reference document that practitioners use.

- Pros: Aligns with NR's existing /standards/ surface (methodology,
  llms-txt, agent-readiness already live there). Implies external
  applicability beyond NR clients. Strong agency-friendly framing.
- Cons: "Standard" implies broad adoption that does not yet exist.
  Premature for a framework with two tracked clients. Sets up
  competitor ammunition: "what makes it a standard?"
- Voice fit: Solid.
- Discoverability: Medium. "Citation standard" has some academic
  use but is open in the AEO context.
- What it forecloses: Lance can never use this name unless he is
  ready to defend the standard claim publicly.

### C. The Citation Tape

**Frame:** Like a financial ticker tape. Continuous, real-time,
factual, indifferent.

- Pros: Distinctive. Nobody else uses this framing in AEO. The
  tape metaphor implies the data flow is the product, not the
  weekly report. Sounds technical without being dry. Matches the
  cron-driven, accumulating nature of citation_runs.
- Cons: Tape is a fading metaphor. People under 35 may not parse
  it without explanation. Gets confused with podcast vocabulary
  ("the tape" = a recording).
- Voice fit: Strong. Slightly literary, indifferent in a way that
  feels like NR.
- Discoverability: Excellent. Zero competition.
- What it forecloses: Pivoting toward a one-shot annual report
  brand. Tape is by definition continuous.

### D. The Tracked Universe

**Frame:** The phrase Lance and the State of AEO report already
use. Expanded to be the framework name itself.

- Pros: Lance already says it. The State of AEO report already
  uses the phrase. It captures the actual scope (everything we
  track) in three words. Distinctive without being clever. Signals
  that the framework grows with each new client onboarded, which
  is true.
- Cons: Sounds slightly cosmic. Could read as overstatement coming
  from a 2-client tracked set. Sales-facing, the listener has to
  make a conceptual leap to understand it as a methodology rather
  than a data set.
- Voice fit: Strong. Already tested in NR's voice.
- Discoverability: Excellent. Zero competition.
- What it forecloses: Other companies adopting NR-style tracking
  for their own audiences. The phrase implies one tracked
  universe, NR's. Difficult to white-label.

## The dimension that matters most right now

**Voice fit + discoverability**, ahead of authority claim, because
NR is in the build-the-moat phase, not the defend-the-standard
phase. The framework needs a name that:

- Sounds like NR speaking, not like a generic SaaS marketing team
- Returns NR pages on a clean search query
- Does not over-claim authority before the data set has matured
- Survives weekly cadence without sounding stale

By those criteria, **C (The Citation Tape)** and **D (The Tracked
Universe)** beat A and B.

The choice between C and D is whether the framework is a stream or
a survey. Tape says stream. Universe says survey. The actual data
flow is a stream (citation_runs accumulating row by row) but the
deliverable Lance shows in a meeting is a survey (here is what we
saw last week). Both are correct, and the tiebreaker is what works
better in a sentence.

Test sentences:

- "Per this week's **Citation Tape**, ASB is named in 0% of
  retrievals across the relevant query set."
- "Per this week's **Tracked Universe** report, ASB is named in
  0% of retrievals across the relevant query set."

The Tape sentence is shorter, sharper, and lands harder.

## Recommendation

**The Citation Tape.**

It is distinctive, voice-aligned, discoverable, technically precise
(the data is literally a continuous stream), and works in a
sentence. The tape metaphor is fading but not dead, and the people
who recognize it are exactly the audience NR is targeting (banking,
agency leadership, technical founders).

The State of AEO report becomes "the weekly Citation Tape report."
The methodology becomes "the Citation Tape methodology." The
public surface at neverranked.com/state-of-aeo gets a sub-headline
that names it. The digest email block can lead with "Latest from
The Citation Tape:" and listeners know what they are about to
read.

Backup pick if Lance reads "tape" and immediately rejects: **The
Tracked Universe**, with the understanding that white-labeling
becomes harder.

## What changes once a name is picked

Small set of edits, all single-shot:

1. `state-of-aeo/index.html` -- subtitle / hero adds the name
2. `scripts/state-of-aeo-publish.mjs` -- README copy
3. `dashboard/src/state-of-aeo.ts` -- email block eyebrow
4. `reports/state-of-aeo/state-of-aeo-2026-05-10.md` -- masthead
5. `content/strategy/moat-research-2026-05.md` -- update synthesis
   layer references
6. May 18 meeting deck / leave-behind

Two-pass plan: rename and ship in one commit, then a follow-up
that updates external references (sitemap descriptions, schema
metadata, JSON-LD). The actual rename is mechanical once Lance
picks.

## Decision

Lance picks one of: **The Citation Tape** (recommended), **The
Tracked Universe** (backup), **The Citation Standard** (if Lance
is willing to defend the standard claim), **The Citation Index**
(weakest, mainly listed for completeness).

If Lance hates all four, the next round explores a different
framing axis: action-language ("The AEO Briefing"), instrument-
language ("The Visibility Meter"), or institution-language ("The
NeverRanked Almanac"). This doc is the conversation starter, not
the final answer.
