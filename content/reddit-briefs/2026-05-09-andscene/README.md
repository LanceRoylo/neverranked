# And Scene Hawaii Reddit landscape, 2026-05-09

Reddit citation gap probe for And Scene Hawaii (corporate training,
applied improvisation, team building, leadership development) using
the five keywords already in the citation tracking corpus plus two
exploratory looser phrasings.

## The honest finding: Reddit is not the play here

Across five tracked categories and two exploratory variants:

| Category | On-topic threads | Briefs |
|---|---|---|
| best corporate training Honolulu | 1 | 1 (poor fit, car-mechanic thread) |
| team building workshops Hawaii | 0 | 0 |
| improv based corporate training (with `--required improv`) | 0 | 0 |
| corporate improv training (looser phrasing) | 20 raw, 0 actually about improv | 5 (all noise) |
| leadership development training Honolulu | 0 | 0 |

Hawaii-anchored corporate-training queries return effectively zero
Reddit conversations. National improv-specific queries are
similarly thin once you require the word "improv" in the title.

This is real signal, not a tool failure. It tells us two things:

1. **And Scene's audience is not on Reddit asking these
   questions.** Corporate L&D buyers, HR leadership, executive
   coaches, and improv-curious managers tend to use LinkedIn,
   private Slack communities, Substack newsletters, and
   conference circuits, not Reddit.
2. **AI engines that cite Reddit heavily for B2C consumer
   questions don't pull from Reddit much for corporate-training
   topics.** Reddit's contribution to the citation footprint for
   queries like "best leadership development Hawaii" is likely
   minimal compared to LinkedIn posts, training-industry
   publications, conference proceedings, and YouTube workshop
   content.

## Strategic implication

And Scene's citation strategy should not lean on Reddit reply ops.
Better surfaces, ranked by likely citation lift per hour invested:

1. **LinkedIn thought leadership.** Lance already posts there.
   The audience is exactly And Scene's buyers. AI engines pull
   LinkedIn heavily for B2B queries.
2. **YouTube workshop demos.** Short clips of improv exercises
   in corporate settings. AI engines pull YouTube for
   "what does X look like" queries.
3. **HR / training trade publications.** Training Industry
   magazine, ATD's TD magazine, Chief Learning Officer.
   Contributed pieces or quotes.
4. **Conference circuits.** ATD, SHRM, and Hawaii-specific HR
   association events. Speaker slots produce blog post coverage
   that AI engines cite.
5. **Reddit (low priority).** Maybe one well-placed reply per
   month in r/managers or r/ExperiencedDevs when an
   improv-as-soft-skills thread actually surfaces. But not the
   focus.

## What to do with this for State of AEO

Once the citation_runs cron is fixed (see
`content/handoff-questions/citation-cron-not-firing.md`) and
And Scene's tracker fires for the first time, compare:

- Where AI engines DO pull from for "best corporate training
  Honolulu" type queries -- per the actual citation_runs data,
  not Reddit
- Whether And Scene shows up in any of those sources
- Which specific surfaces (LinkedIn? YouTube? specific trade
  pubs?) carry the most citation share for this vertical

That's the real And Scene baseline. The Reddit probe done
tonight is the negative-space finding: it tells us where the
demand is NOT.

## Files in this directory

- `best-corporate-training-honolulu.md` -- 1 brief, weak fit
- `team-building-workshops-hawaii.md` -- empty (zero threads)
- `improv-based-corporate-training.md` -- 0 threads with
  `--required improv` (correct gate result)
- `corporate-improv-training.md` -- 5 briefs but all noise
  (no improv-specific threads in the dataset)
- `leadership-development-honolulu.md` -- empty

## Methodology and the bug surfaced

These probes also surfaced and motivated a tracker improvement:
the `--required` CLI flag (commit fa158be) lets the caller
demand specific tokens in the title. Without it, anchor
extraction was letting "corporate" + "training" matches through
even when the actual subject required word ("improv") was
missing.

The flag is general -- callers can pass `--required` for any
must-include token. The auto-derived region tokens (Hawaii,
Honolulu, etc.) layer on top automatically.
