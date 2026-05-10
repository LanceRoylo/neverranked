---
title: "State of AEO: NeverRanked tracked-universe report"
window_start: 2026-04-14
window_end: 2026-05-04
generated: 2026-05-10
sample_runs: 376
sample_clients: 2
sample_engines: 3
sample_keywords: 15
---

# State of AEO: NeverRanked tracked-universe report

*Generated 2026-05-10. Window: 2026-04-14 to 2026-05-04.*

## What this report is

A standing snapshot of what AI engines actually cite when answering
questions about NeverRanked's tracked client universe. Pulled from
live 376 citation runs across 3 engines (gemini, openai, perplexity),
15 tracked keywords, and 2 clients spanning 2 verticals.

Generated weekly. Same script, same data sources, no manual curation.
The methodology is the script (`scripts/state-of-aeo-generate.mjs`) plus
the public scoring engine at check.neverranked.com. Reproducible by
anyone with the same query against the same database.

## Headline

Across 376 captured AI engine responses, the single most-cited
third-party source is **google.com** (Google Maps / Business Profile),
appearing in 106 citation runs across
1 engine and 3 tracked keywords.

Implication: any tracked client whose category overlaps with this
source's coverage area (and whose own brand is not yet present on
it) is leaving citation share on the table. The path to closing the
gap is source-specific. See the per-client baseline section below.

## Where AI engines pull from

Distribution of citation runs by source type, excluding client-owned
URLs (which represent successful citation, not the moat-building
question of "where else are they pulling from"):

| Source type | Runs | Share |
|---|---|---|
| google-maps | 106 | 29.3% |
| news | 100 | 27.6% |
| youtube | 84 | 23.2% |
| wikipedia | 41 | 11.3% |
| directory | 17 | 4.7% |
| tripadvisor | 11 | 3.0% |
| review-aggregator | 3 | 0.8% |

## Top 15 third-party sources

The domains that appeared most often as cited references across
the dataset. Excludes client-owned domains.

| Domain | Source type | Runs | Engines | Keywords | Clients |
|---|---|---|---|---|---|
| vertexaisearch.cloud.google.com | other | 117 | 1 | 5 | 2 |
| google.com | google-maps | 106 | 1 | 3 | 2 |
| hawaiitheatre.com | other | 101 | 3 | 2 | 1 |
| prnewswire.com | news | 94 | 2 | 1 | 1 |
| youtube.com | youtube | 84 | 2 | 9 | 1 |
| geekpoweredstudios.com | other | 59 | 3 | 1 | 1 |
| orbitmedia.com | other | 55 | 1 | 2 | 1 |
| evertune.ai | other | 54 | 2 | 2 | 1 |
| greenbananaseo.com | other | 51 | 2 | 5 | 1 |
| animalz.co | other | 48 | 1 | 2 | 1 |
| arcintermedia.com | other | 46 | 1 | 2 | 1 |
| sparktoro.com | other | 43 | 1 | 1 | 1 |
| eseospace.com | other | 43 | 2 | 1 | 1 |
| generatemore.ai | other | 42 | 1 | 1 | 1 |
| en.wikipedia.org | wikipedia | 41 | 3 | 3 | 2 |

## What each engine cites differently

Top 5 sources per engine. When two engines have very different top
lists, that's a signal about how each one's retrieval differs.

### perplexity (222 runs)

- **youtube.com** -- 71 runs
- **orbitmedia.com** -- 55 runs
- **greenbananaseo.com** -- 49 runs
- **animalz.co** -- 48 runs
- **arcintermedia.com** -- 46 runs

### openai (132 runs)

- **google.com** -- 106 runs
- **prnewswire.com** -- 56 runs
- **en.wikipedia.org** -- 33 runs
- **hawaiitheatre.com** -- 32 runs
- **cited.so** -- 25 runs

### gemini (22 runs)

- **vertexaisearch.cloud.google.com** -- 117 runs
- **hawaiitheatre.com** -- 36 runs
- **vividseats.com** -- 6 runs
- **search.auw211.org** -- 3 runs
- **ticketmaster.com** -- 3 runs

## Vertical breakdown

*Verticals with at least 3 tracked clients enable category-level insights.*

Current vertical distribution:

| Vertical | Clients | Runs |
|---|---|---|
| performing arts venue | 1 | 31 |
| AEO agency | 1 | 345 |

As more clients onboard inside any vertical, this section will
populate automatically with category-level patterns.

## Per-client baselines

Each client's current citation footprint as of 2026-05-10. These
numbers are the baseline against which any future case study is
measured. Citation rate climbing from one of these starting points
to a higher one over a defined window is the case-study artifact.

### neverranked -- AEO agency

- **345** captured runs across **13** tracked keywords
- Named in **0** runs (**0%** citation rate)
- Top 5 sources cited alongside this client's queries:
  - vertexaisearch.cloud.google.com (114 runs)
  - google.com (100 runs)
  - prnewswire.com (94 runs)
  - youtube.com (84 runs)
  - geekpoweredstudios.com (59 runs)

### hawaii-theatre -- performing arts venue

- **31** captured runs across **2** tracked keywords
- Named in **30** runs (**97%** citation rate)
- Top 5 sources cited alongside this client's queries:
  - hawaiitheatre.com (101 runs)
  - tripadvisor.com (11 runs)
  - en.wikipedia.org (9 runs)
  - ticketmaster.com (8 runs)
  - google.com (6 runs)

## Methodology and sample disclosure

Every number in this report comes from `citation_runs` in the
NeverRanked production database. Each run is one query against one AI
engine for one tracked keyword, with the engine's response_text and
cited_urls captured as raw evidence.

Engines covered: gemini, openai, perplexity.

Sample size at this snapshot:

- 376 citation runs
- 2 tracked clients across 2 verticals
- 15 tracked keywords
- Window: 2026-04-14 to 2026-05-04

Honest limits: this is NeverRanked's tracked subset, not a random
sample of the AI search universe. Findings are descriptive of what
AI engines say to questions in our clients' categories. Generalizing
beyond those categories requires more data.

The script that generated this report is at
`scripts/state-of-aeo-generate.mjs` and reads no private data.
The schema for `citation_runs` is public in the migrations folder.
