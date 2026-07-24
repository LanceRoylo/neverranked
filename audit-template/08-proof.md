# Proof Point: How We Measure

<!--
  REWRITTEN 2026-07-24. The prior version of this file told the retracted
  Hawaii Theatre before/after story (score movement + citation counts) and
  showcased the hosted injection snippet. Both are retired: the numbers are
  publicly retracted (see /retraction) and NeverRanked is measurement-only.
  Do not restore the old copy. HTC may be referenced as a capability
  example (what we measure and how), never as an outcome claim.
-->

The audit you just read is a snapshot. What matters is whether the numbers
in it can be trusted, and that is the part of this work we hold to a
higher standard than anyone else in this space.

## How the measurement works

Hawaii Theatre, a historic Honolulu performing arts venue, was the first
category we instrumented end to end. Every month we run the same frozen
query set against seven AI engines, five that search the live web and two
that answer from model knowledge, in repeated runs spread through the
month. Each run records which businesses each engine actually cited, per
query, with the raw responses kept on disk. The result is a per-engine
citation share for the venue and its competitor cohort that can be
recomputed from the raw data by anyone who asks.

## Why you will not see a before-and-after headline here

Early on we told a before-and-after story about this work. We retracted it
publicly, because when we tested our own claim we could not separate the
effect of the changes from ordinary movement in the engines themselves.
The full account is at neverranked.com/retraction.

That retraction is now the standard this audit is built on. When we
measure your category:

- The query set and competitor cohort are frozen before the first run.
- Engines that cannot have seen any recent site change serve as a control,
  so engine drift does not get dressed up as results.
- Any prediction about what a change will do is written down and dated
  before the change ships, not after the numbers come in.
- If the numbers move and we cannot tell why, we say so.

## What this means for your audit

The gaps listed in your roadmap are real observations from your site and
your category. Acting on them is your team's call and your team's work.
What we bring is the measurement discipline above, applied monthly, so
whatever you choose to do, you will know what the engines actually said
before and after, and you will never have to take our word for it.
