# SOP: Scoping call → locked question set

**Audience:** Lance, future Atlas, any future operator running the engagement scoping.
**Status:** living document. Update when a scoping call surfaces a pattern this doc does not cover.
**Last updated:** 2026-05-25 (initial draft, after the 5-category seed: bank, med-spa, dental, law, wealth).

---

## Purpose

A scoping call has one job: produce a locked 18-question set that mirrors how the customer's buyers actually search in their category. Everything downstream (cohort, measurement, memo, drift detection) depends on this set. A weak set runs through the same 7-AI-tool measurement and produces useless data. A strong set produces findings like the Hamada brief.

This doc covers the workflow from "scoping call booked" to "hash-locked set running in production."

---

## The two paths

**Path A: Customer is in a category we have already locked.**
- Existing locked set applies. Confirm cohort + any customer-specific tweaks. Often done in 15 minutes.
- Customer-specific tweaks: usually one swap on the named-comparison query (#17) to use their actual top competitors instead of the seed cohort's.
- Skip to "Hash-lock" section below.

**Path B: Customer is in a NEW category we have not measured.**
- Need to design 18 questions from scratch. This is what the rest of this doc covers.

---

## Pre-call prep (Lance, 30 min before the call)

1. **Confirm the category is genuinely new.** Search `/Users/lanceroylo/Desktop/neverranked-outreach/dryrun/` for any existing runner that could apply. If a similar-shaped category exists, the locked set is a starting point.
2. **Pull two competitors** the customer likely knows. Don't list them on the call. They become pressure-test references after the call ("the customer named X, but did they mention Y, the obvious competitor in their space?").
3. **Read the customer's homepage** for 5 minutes. Note their stated buyer ("we work with growth-stage B2B SaaS founders"), their stated services, their stated geographic scope.
4. **Skim the methodology page** (`/methodology/`) so the query-set discipline is fresh in your head.
5. **Check the Plaud Note Pro is charged and recording-app is set up.** The Plaud transcribes the call automatically. It is what makes "dense notes, don't summarize, transcribe" achievable in real time without splitting your attention between listening and writing. The recorder is on for the buyer-shape interview (the 20 minutes that actually matter); the transcript becomes the verbatim raw material for section 4 of the customer's brand-brain file (per SOP-customer-onboarding.md Day 5).

---

## The call itself (30 min, customer + Lance)

### Recording and consent (first 60 seconds of the call)

Hawaii is a one-party consent state, so legally you can record any conversation you're part of without notifying the other party. But for a first-meeting professional context the customary move is to ask. Use this line in the first 60 seconds, before the agenda:

> *"I record meetings on a small device so I can give you accurate notes after. Want me to keep it off?"*

Three things this line does:

- Asks permission rather than informs (professional courtesy)
- Frames the recording as for their benefit (accurate notes after, which it is)
- Gives them an easy "actually yes, let's skip it" out if they want
- Signals you take notes seriously, which aligns with the observational-discipline brand

Most professional buyers say yes. The few who say no are signaling something worth knowing about the engagement; honor the no and take handwritten notes that call, then proceed.

If yes, hit record before the agenda begins. The recorder stays on through the buyer-shape interview. Stop after the 30 minutes wrap or earlier if the conversation drifts into pricing-objection or contract-detail territory (record only what is buyer-shape signal, not negotiation talk).

### Agenda

| Time | Topic |
|---|---|
| 0-5 min | Confirm the engagement shape. "$4,500 kickoff + $1,500/mo per category. You execute, we measure. Today's job is to lock the 18 questions and 3-7 competitors." |
| 5-25 min | Buyer-shape interview (the only part that matters). |
| 25-30 min | Confirm timing, scoping commitment, what they'll receive when. |

### The buyer-shape interview (the 20 minutes that actually matter)

Five questions, asked in this order. Take dense notes. Don't summarize, transcribe.

1. **"When a stranger to your business googles or asks AI for someone like you, what would they type? Not what should they type. What do they actually type?"**
   - Surfaces head queries.
   - Push back if they offer SEO-keyword-tool phrases ("best [service] in [city]"). Ask: "Who actually types it that way?"
2. **"What's the most specific buyer type you serve, and what would that specific buyer type type into AI?"**
   - Surfaces long-tail scenarios.
   - Example output: "Hawaii wealth manager for physicians" or "dentist in Honolulu open Saturdays."
3. **"What's the question a buyer asks AI when they're comparing you to specific named competitors? Who would they name?"**
   - Surfaces the named-comparison query (#17 in our pattern).
   - This is the only query in the wealth set where Hamada appeared. Important.
4. **"What buyer type would you LOVE to attract more of? What would that ideal buyer type into AI?"**
   - Surfaces aspirational long-tail queries.
   - Sometimes the customer realizes they have no content for this buyer. Note it.
5. **"What's a question buyers ask you in person that you bet they're also asking AI?"**
   - Surfaces unusual or service-specific queries that wouldn't come up in a generic discovery.

### What NOT to talk about on the scoping call

- Pricing details (already agreed).
- The teardowns (they can read those on their own).
- Specific competitors named in their cohort (you'll send those in the draft).
- The methodology depth (link to `/methodology/`, don't lecture).
- What the punch list will recommend (you don't know yet, you haven't measured).

---

## Post-call synthesis (Lance + Atlas/Claude, 1-2 hours)

1. **Pull the Plaud transcript** for the call. Light-edit pass to fix obvious transcription errors (proper names, jargon, numbers), but keep all the customer's actual phrasing intact. Save to `drafts/scoping-<customer-slug>.md` as the working file. This transcript also becomes the verbatim section 4 of the customer's brand-brain file when Day 5 of onboarding runs.
2. **Feed the notes to Atlas/Claude** with this exact prompt shape:
   > "Here are scoping call notes for [customer name], a [category description] business. Draft 18 buyer questions in the 8 head + 10 long-tail shape we use across categories. Match the voice of how their actual buyers would type the questions, not how SEO keyword tools rank phrases. Include exactly one named-comparison query using these competitors: [list]. Pressure-test the set against the 5 demand-surface coverage areas: [head intent / geographic / service-combined / trust-signal / value-conscious]."
3. **Atlas/Claude returns the draft.** Read it through twice. The 8 head should be variations on broad intent. The 10 long-tail should each capture a distinct buyer scenario or named comparison. No two queries should be near-duplicates.
4. **Pressure-test the draft against the call notes:**
   - Every buyer type the customer named: is there a query that would surface them?
   - Every service the customer named: is there a query that would surface that service?
   - Every competitor the customer named: are they reachable through at least one query (the named-comparison, or a service-specific query)?
   - The aspirational buyer type from question #4: is there a query for that?
   - Anything the customer said about how buyers ask in person: does the query set reflect it?
5. **If the draft fails any pressure-test, edit it.** Don't ship a set that misses a category the customer told you about.

---

## Customer review (24-48 hours after the call)

Email the draft set. Format:

```
Subject: Your locked question set for [category]

Below is the 18-question set we'll run across all 7 AI tools.
Once you confirm, we hash-lock it and measurement starts the
following week. After lock the set never changes. That's
how every run compares apples to apples.

HEAD QUERIES (8), broad buyer intent:
1. [query]
2. [query]
... etc

LONG-TAIL QUERIES (10), specific scenarios + named comparison:
9. [query]
...
17. [named-comparison query with your top competitors]
18. [query]

Two things to look for:
1. Anything missing: a buyer type or service we should be
   measuring that we're not?
2. Anything that doesn't sound like how your buyers actually
   talk? Swap it.

Reply with your edits or "lock it" and I'll start the kickoff.

Lance
```

### Common customer feedback patterns

- **"Add a query about [service]."** Almost always swap in for a long-tail. Total stays at 18.
- **"This sounds too generic."** Push back if their suggestions are SEO-keyword-tool phrases. Ask what their actual buyers type.
- **"Can we add more competitors to the named-comparison?"** Stay at exactly one named-comparison query but you can add more names to it. "FirmA vs FirmB vs FirmC vs FirmD" still counts as one query.
- **"What about [buyer type that didn't come up on the call]?"** Add the long-tail. Sometimes the post-call review surfaces things the call missed.
- **"This is fine."** Move to hash-lock.

---

## Hash-lock (Lance, 15 min)

1. **Create the runner.** Copy the closest existing runner (`dryrun/run-wealth-mgmt-hawaii.mjs` is a clean template). Rename to `run-<category>.mjs`.
2. **Replace the HEAD and LONGTAIL arrays** with the locked 18.
3. **Run the runner once with `--dry-run` or just hit it.** The first run prints the query-set hash. That hash is the lock.
4. **Update the cohort.** Open `dryrun/forensic/cohorts.mjs`, add the customer's category with the agreed competitors. Run once even with an empty cohort to get the first measurement going; recover unregistered candidates with `cohort-coverage.mjs` after.
5. **Note the hash in the customer record.** Future runs must produce the same hash. If the hash changes, the runs are no longer comparable and the discipline has been broken.
6. **Email the customer.** "Set locked. Hash: `[hash]`. Three-week kickoff starts [date]. First research memo arrives [date + 3 weeks]."

---

## Quality bar (what makes a query set good)

| Sign of a good set | Sign of a weak set |
|---|---|
| Queries sound like a person typing on their phone | Queries sound like an SEO keyword tool's report |
| Each long-tail captures a distinct buyer scenario | Several long-tails are near-duplicates of each other |
| The named-comparison includes the customer's actual top 2-3 competitors | The named-comparison is generic or uses obscure firms |
| At least one query captures an aspirational buyer type | Every query reflects existing customer base only |
| At least one query reflects something the customer told you about how buyers ask in person | The set could have been written without the scoping call ever happening |

---

## When to reuse an existing category's set

| Situation | Action |
|---|---|
| Same vertical, same geography, similar customer | Reuse the existing locked set, swap the named-comparison query for the customer's specific competitors. |
| Same vertical, different geography (e.g. "law firms in Maui" vs "law firms in Hawaii") | Reuse most queries, swap geographic references throughout. Re-lock as a new set. |
| Different vertical but adjacent (e.g. wealth-mgmt vs trust-and-estate-planning) | Use the existing set as a starting template, replace 30-50% of queries. Re-lock as a new set. |
| Truly different vertical | Design from scratch via the full scoping process above. |

---

## Common pitfalls

1. **The keyword-tool trap.** Customer offers SEO-keyword-tool phrases ("Hawaii financial advisor near me"). Push back. Ask what their actual buyers type. Real buyers usually type something more specific or more colloquial.
2. **Over-narrowing.** Customer wants all 18 queries to be hyper-specific to their ideal buyer. Push back. Need at least the 8 head queries to be broad enough to surface the demand surface AI is actually answering for.
3. **Under-narrowing.** Customer wants every query to be generic. Push back. The long-tail is where the closable competitive ground is. Generic queries are dominated by national brands and have no closable gap.
4. **The "everything the customer offers" trap.** Customer wants to cover all their services with one query each. Push back. The set is buyer-shaped, not service-shaped. If a service has no buyer searching for it, it doesn't earn a query.
5. **Including the customer's own brand name.** Never. Branded queries are a different measurement that we also report (does AI know you when asked directly), but they live separate from the demand-surface set.
6. **Editing the set after first measurement run.** Never. Hash-locked means hash-locked. If the set is genuinely wrong, retire it, design a new set, re-lock with a new hash, and start the run history over. Mid-run edits invalidate every comparison.

---

## What the customer sees vs. what actually happens

| What the customer sees | What actually happens |
|---|---|
| 30-min scoping call | Lance asks 5 questions, transcribes answers |
| "We'll send the set in a day or two" | Lance feeds notes to Atlas/Claude, drafts in 30 min, pressure-tests in 30 min, edits in 30 min |
| Polished email with the 18 questions | Already-locked draft pasted into a clean email format |
| Lock + measurement begins | Lance edits runner, runs once to confirm hash, registers cohort, kicks off daily cron |

The Atlas/Claude assist is invisible to the customer. The product is Lance's discipline and the locked discipline. The tooling makes that discipline scalable; it doesn't replace it.

---

## When to update this SOP

- New scoping call surfaces a question worth adding to the buyer-shape interview.
- A locked set runs and produces a weak measurement (low AI coverage, no movement); revisit the quality bar.
- A new category demands a different shape than 8 head + 10 long-tail.
- Atlas matures enough to handle the synthesis end-to-end and the post-call workflow simplifies.
- A customer flags a query they wish had been there. Add the pattern to the buyer-shape interview.
