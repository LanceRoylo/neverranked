---
title: "ASB + MVNP May 18 meeting rehearsal"
meeting_date: 2026-05-18
prepared: 2026-05-11
status: prep material, not for distribution
---

# ASB + MVNP May 18 rehearsal

For Lance to read the night before. Not a deck. Not a script. A
playbook of likely moments, objections, and confidence anchors so
nothing in the room is a surprise.

## What you walk in with

- The audit deck PDF (`audits/asb-hawaii-2026-05/audit.pdf`)
- The evidence appendix PDF (`content/meeting-evidence/asb-2026-05-18.pdf`)
- The composite packet PDF (`content/meeting-evidence/asb-2026-05-18-packet.pdf`)
- A laptop with the dashboard open at `/admin/citations/neverranked`
  (live demo readiness)
- A laptop with `check.neverranked.com` open in another tab
  (free-tool live demo readiness)
- The Hawaii Theatre case study URL as a follow-up resource
  (`neverranked.com/case-studies/hawaii-theatre`)

## What the room is doing

You're talking to two parties at once:

1. **Mark Cunningham + ASB stakeholders.** Banker brain. Want
   verifiable, audit-able, compliance-friendly. Looking for risk
   signals more than upside. Will not commit in the room.
2. **MVNP team.** Agency brain. Want to know how this fits their
   current playbook, what the resell economics look like, and
   whether Lance is a credible operating partner. Will care about
   wholesale terms, who owns the client relationship, and what
   the ongoing service load looks like for them.

Both audiences need different things at different moments. Read
the room. ASB wants methodology + risk + compliance answers.
MVNP wants partnership + economics + control answers.

## The walkthrough flow (your suggested order)

### Moment 1: Open with the finding

Don't open with the methodology. Open with what's wrong.

> "ASB is named in zero percent of AI engine citations across
> the Hawaii community banking query set. First Hawaiian Bank
> and Bank of Hawaii get named by default. Same gap shows up
> on Reddit consumer threads, news wire mentions, and Wikipedia
> entity entries. This is not a marketing failure. It's a
> citation infrastructure gap."

That sentence is the meeting. Everything else explains it or
fixes it. If they nod, keep going. If they push, the audit deck
has the citation matrix to back it up.

### Moment 2: The local proof point

Before they ask "have you fixed this for anyone real," lead with
the answer.

> "Six weeks ago, Hawaii Theatre had a 45 out of 100 AEO score
> and zero AI citations. Ten days after we deployed five schema
> categories, Perplexity named them on 14 of 19 tracked queries.
> The CEO of Hawaii Theatre Center approved that as a public
> case study. It's live at neverranked.com/case-studies/hawaii-theatre.
> The same playbook applies to ASB."

This is the moment the room shifts. You're no longer pitching a
new methodology. You're pointing at a Honolulu venue they
probably know with verifiable before/after numbers.

### Moment 3: The methodology (only if asked)

Don't volunteer the methodology unless someone asks "how do you
measure that." If asked:

> "We track seven AI engines. Six are commercial APIs. The
> seventh is Gemma, Google's open-weight model. Closed APIs
> can change behind the scenes; Gemma's weights are public,
> so anyone, including your compliance team, can independently
> reproduce our citation numbers by running the same prompts
> against the same model. This is the only AEO platform doing
> both."

Then stop. Let it land. If MVNP pushes back, see "Objection 4"
below.

### Moment 4: The fix shape

Frame as three parallel tracks:

1. **Schema infrastructure.** FinancialService, AggregateRating,
   FAQPage, BreadcrumbList. The same five-category playbook that
   moved Hawaii Theatre. Deployed via a one-line snippet, no
   engineering work on ASB's site, no CMS changes.
2. **Reddit reply ops.** Two well-placed replies per week, named
   threads in the priority list, MVNP can execute under their
   own brand or under a NR-managed pseudonym. Compounds over
   90 days.
3. **News wire + Wikipedia entity work.** Press release
   distribution and Wikipedia entity entry maintenance are two
   of the highest-impact source-type actions. Wikipedia
   editorial is a known process; NR has the briefs.

Don't go deeper than this in the room unless they want detail.
Save the schema-by-schema breakdown for the follow-up call.

### Moment 5: The MVNP partnership shape

MVNP doesn't pay NR. MVNP resells NR.

> "Wholesale tier starts at $800 per Signal slot for an agency.
> MVNP keeps the retainer relationship with ASB; NeverRanked is
> a margin line. MVNP retail is $2,000/month per client at the
> Signal tier, so that's $1,200/month subscription margin per
> slot plus 3 to 8 hours of billable implementation work per
> month at MVNP's hourly rate."

If they push on what NR delivers vs what MVNP delivers, see
"Objection 5."

### Moment 6: The ask

Two parallel asks. Don't try for both, but offer both:

A. **For ASB**: "Let's run a free audit on `asbhawaii.com` with
   six to twelve pages of vertical-specific findings, including
   the deployment plan. Yours to keep. No charge. No pitch on
   the call back. If you want NR to do the deployment, that's a
   separate conversation."

B. **For MVNP**: "Pilot partnership for the Hawaii market, first
   agency to sign gets geography exclusivity. We onboard ASB
   together as the first joint client. If it works for ASB, we
   bring two or three more MVNP clients in over the next 90
   days. If it doesn't, the audit work is yours either way."

Pick the ask that fits the room. If Mark is engaged, A. If
MVNP is engaged, B. Both is the best outcome.

## Likely objections + crisp answers

### Objection 1: "How is this different from SEO?"

> "Same goal, different machine. SEO optimizes for what Google's
> 2010-era algorithm cared about (keywords, backlinks, page
> speed). AEO optimizes for what AI engines read first (structured
> data, machine-readable facts, source-type signals). Most of the
> SEO you've done still works for traditional Google. None of it
> shows up to ChatGPT or Perplexity unless the schema layer is
> there. Your current SEO is necessary but not sufficient."

### Objection 2: "How do we know your numbers are real?"

> "Run them yourself. Six of our seven engines are commercial
> APIs you can query directly. The seventh, Gemma, is an open-
> weight model whose weights are public. Same prompt, same model,
> same answer. Your compliance team can replicate the citation
> count on their own machine. We're the only AEO platform built
> for that level of audit-ability."

### Objection 3: "Why hasn't ASB been doing this already?"

> "Because the work didn't exist as a category two years ago.
> AI engines weren't retrieving from third-party surfaces the
> way they do now. ChatGPT only added native web search in late
> 2024. AEO as a practice is roughly six months old as a
> measurable thing. ASB is not behind; ASB is at the moment
> when getting started matters most."

### Objection 4: "Isn't this just adding code to our website?"

> "It is, with one piece of nuance. Schema markup is structured
> fact about what your business already is, not new marketing
> claims. We are not adding disclosures, performance claims, or
> customer-facing copy. The compliance posture is the same as
> adding a Google Analytics tag or a meta description. We
> deploy via a one-line snippet, so no engineering work on
> asbhawaii.com is required."

### Objection 5: "What does MVNP actually do here vs NeverRanked?"

> "MVNP owns the client relationship, the strategy conversation,
> and the integration with the broader marketing program. NR
> ships the schema deployment, the weekly citation tracking,
> and the Reddit reply briefs. Think of NR as the AEO toolchain
> MVNP plugs into to deliver something MVNP can't currently
> deliver. MVNP's hourly rate applies to the strategy work; the
> NR subscription covers the infrastructure layer. The pilot
> agreement keeps roles clear."

### Objection 6: "What if the citation lift doesn't happen?"

> "Two answers. First, the lift is measurable from the first
> weekly run after deployment. The Hawaii Theatre case study
> shows what that looks like (45 to 95 in ten days). Second, if
> the lift doesn't materialize within 90 days, the audit work
> is still yours. The schema deployment, the source-type briefs,
> the Reddit reply ops list. You keep all of it. The downside
> is bounded; the upside is the citation share we can measure."

### Objection 7: "Why are you talking to ASB and not BoH or First Hawaiian?"

> "Two reasons. First, ASB is the bank our data identifies as
> having the largest visible gap; the others already have entity
> infrastructure in place. Second, we're a Hawaii-founded
> company. We'd rather build the first community bank case
> study with a local. Both First Hawaiian and Bank of Hawaii are
> already getting cited; we don't need to fix what's working
> for them to make a point. We need to fix what's not working
> for ASB."

### Objection 8: "We'd want to think about it. What's the timeline?"

> "The audit is the lowest-friction next step. Free, 72-hour
> turnaround, vertical-specific, yours to keep. The audit gives
> us both the data to talk through. After the audit, if the
> right move is the pilot, the kickoff is a 30-minute call to
> set up the schema deployment snippet on asbhawaii.com. From
> there, the first weekly citation run lands 7 days later. So
> the path from this meeting to first measurable data point is
> about 10 days. The path to first measurable citation lift is
> about 30 days."

### Objection 9 (from MVNP): "How does this affect our agency margin?"

> "Adds to it. NR retail is $2,000/month at the Signal tier.
> Wholesale to MVNP is $800/month. MVNP's margin per slot is
> $1,200/month plus 3 to 8 hours of billable implementation
> work per month at your hourly rate. For a 10-client book,
> that's $16K to $32K per month in new recurring revenue on
> top of existing retainers. No new headcount required; NR
> handles the deployment toolchain, MVNP handles the strategy
> and the relationship."

### Objection 10 (from MVNP): "What if we want to white-label it?"

> "Built for that. Agency mode hides the NR brand from end-
> client surfaces. Dashboard rebrands to MVNP. Emails go from
> MVNP. The citation reports carry MVNP's logo. NR is the
> underlying infrastructure, MVNP is the agency relationship."

## Confidence anchors (specific facts to cite from memory)

- ASB's AI citation share across tracked Hawaii community
  banking queries: **0%**.
- First Hawaiian Bank cited in **all 8** of the tracked
  prompts. Bank of Hawaii cited in **most**.
- The single most-cited third-party source across the entire
  tracked universe: **vertexaisearch.cloud.google.com** (Gemini's
  grounding-redirect layer).
- AEO services agencies (geekpoweredstudios, greenbananaseo,
  others) claim **28% of citation share** for AEO-services
  queries. Translation: when people ask AI for help with their
  bank's AI visibility, they see agencies named, not banks.
- News wires (PRNewswire, BusinessWire, etc.) appear in **8% of
  citations** across all tracked queries. Press release
  distribution compounds.
- Hawaii Theatre numbers: **45 to 95 in ten days, 14 of 19
  Perplexity citations.**
- Seven engines tracked: ChatGPT, Perplexity, Claude, Gemini,
  Microsoft Copilot, Google AI Overviews, **Gemma (open-weight)**.
- Reddit landscape: r/Hawaii's "First Hawaiian Bank continues to
  shock me" thread ranks at **priority 0.94** in the prioritized
  reply-ops list. ASB absent from that thread. Cleanest
  competitor-visible / client-absent gap in the Hawaii banking
  dataset.

## Things to NOT say in the room

- Anything that sounds like a guarantee on citation lift before
  the audit is delivered.
- Anything that compares ASB unfavorably to peers in a way that
  reads as criticism rather than diagnosis.
- The specific dollar figures of any other NR retainer outside
  the standard tiers ($497 / $2,000 / $4,500).
- Greg's name (the Hawaii Theatre CEO's name is not approved
  for public use; the bank/MVNP could ask "who" and the answer
  is "the leadership of Hawaii Theatre Center approved the
  case study, which is the relevant fact").
- Ticket sales numbers, revenue impact, or anything about
  Hawaii Theatre's business performance beyond the AEO score and
  citation count.
- Any direct quote from Greg (we don't have one).

## After the meeting

Within 2 hours of leaving, send Mark + MVNP follow-up email with:

1. The audit deck PDF (attach)
2. The evidence appendix PDF (attach)
3. The case study URL (in body)
4. A specific ask for the next step (audit kickoff, or 30-min
   follow-up call, or pilot scoping conversation).
5. Date-specific options for the next conversation. Don't ask
   "when works?". Offer two concrete slots.

If silence after 5 business days, soft follow-up referencing
something specific from the meeting (a question that came up,
a category they mentioned, the case study they engaged with).
Don't follow up with "checking in" energy.

## One last thing

You've done the work. The infrastructure is real. The case
study is approved. The data is reproducible. The methodology is
public. The pilot offer is fair on both sides.

The only thing the room is deciding is whether they trust the
operator across the table. Show up calm, specific, and
patient. You've earned the right to be in the room.
