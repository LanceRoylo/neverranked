---
title: "State of AEO: NeverRanked tracked-universe report"
window_start: 2026-04-14
window_end: 2026-05-10
generated: 2026-05-10
sample_runs: 394
sample_clients: 3
sample_engines: 5
sample_keywords: 17
---

# State of AEO: NeverRanked tracked-universe report

*From The Citation Tape, NeverRanked's standing AI-citation measurement system.*

*Generated 2026-05-10. Window: 2026-04-14 to 2026-05-10.*

## What this report is

A standing snapshot of what AI engines actually cite when answering
questions about NeverRanked's tracked client universe. Pulled from
live 394 citation runs across 5 engines (bing, gemini, google_ai_overview, openai, perplexity),
17 tracked keywords, and 3 clients spanning 3 verticals.

Generated weekly. Same script, same data sources, no manual curation.
The methodology is the script (`scripts/state-of-aeo-generate.mjs`) plus
the public scoring engine at check.neverranked.com. Reproducible by
anyone with the same query against the same database.

## Headline

Across 394 captured AI engine responses, the single most-cited
third-party source is **vertexaisearch.cloud.google.com** (Google AI infrastructure (Gemini grounding)),
appearing in 117 citation runs across
1 engine and 5 tracked keywords.

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
| aeo-services-agency | 361 | 28.7% |
| seo-publication | 203 | 16.1% |
| aeo-platform | 202 | 16.0% |
| google-ai-infra | 117 | 9.3% |
| google-maps | 112 | 8.9% |
| news | 100 | 7.9% |
| youtube | 89 | 7.1% |
| wikipedia | 41 | 3.3% |
| directory | 17 | 1.4% |
| tripadvisor | 11 | 0.9% |
| review-aggregator | 3 | 0.2% |
| reddit | 2 | 0.2% |

## Top 15 third-party sources

The domains that appeared most often as cited references across
the dataset. Excludes client-owned domains.

| Domain | Source type | Runs | Engines | Keywords | Clients |
|---|---|---|---|---|---|
| vertexaisearch.cloud.google.com | google-ai-infra | 117 | 1 | 5 | 2 |
| google.com | google-maps | 112 | 1 | 4 | 3 |
| hawaiitheatre.com | other | 101 | 3 | 2 | 1 |
| prnewswire.com | news | 94 | 2 | 1 | 1 |
| youtube.com | youtube | 89 | 2 | 10 | 1 |
| geekpoweredstudios.com | aeo-services-agency | 61 | 3 | 1 | 1 |
| orbitmedia.com | seo-publication | 55 | 1 | 2 | 1 |
| evertune.ai | aeo-platform | 54 | 2 | 2 | 1 |
| greenbananaseo.com | aeo-services-agency | 51 | 2 | 5 | 1 |
| arcintermedia.com | aeo-services-agency | 48 | 2 | 4 | 1 |
| animalz.co | seo-publication | 48 | 1 | 2 | 1 |
| sparktoro.com | seo-publication | 45 | 1 | 1 | 1 |
| eseospace.com | aeo-services-agency | 45 | 2 | 1 | 1 |
| generatemore.ai | aeo-platform | 44 | 2 | 2 | 1 |
| boralagency.com | other | 42 | 2 | 2 | 1 |

## What each engine cites differently

Top 5 sources per engine. When two engines have very different top
lists, that's a signal about how each one's retrieval differs.

### perplexity (227 runs)

- **youtube.com** -- 75 runs
- **orbitmedia.com** -- 55 runs
- **greenbananaseo.com** -- 49 runs
- **animalz.co** -- 48 runs
- **arcintermedia.com** -- 46 runs

### openai (137 runs)

- **google.com** -- 112 runs
- **prnewswire.com** -- 56 runs
- **en.wikipedia.org** -- 33 runs
- **hawaiitheatre.com** -- 32 runs
- **cited.so** -- 25 runs

### gemini (26 runs)

- **vertexaisearch.cloud.google.com** -- 117 runs
- **hawaiitheatre.com** -- 36 runs
- **vividseats.com** -- 6 runs
- **penguinpeak.com** -- 3 runs
- **search.auw211.org** -- 3 runs

### google_ai_overview (2 runs)

- **reddit.com** -- 2 runs
- **higoodie.com** -- 2 runs
- **seorankmedia.com** -- 2 runs
- **digitalstrategyforce.com** -- 2 runs
- **magier.com** -- 2 runs

### bing (2 runs)

- **merriam-webster.com** -- 2 runs
- **oxfordlearnersdictionaries.com** -- 2 runs
- **eslteacher.org** -- 1 runs
- **dictionary.cambridge.org** -- 1 runs
- **proofed.com** -- 1 runs

## Vertical breakdown

*Verticals with at least 3 tracked clients enable category-level insights.*

Current vertical distribution:

| Vertical | Clients | Runs |
|---|---|---|
| AEO agency | 1 | 360 |
| corporate training | 1 | 3 |
| performing arts venue | 1 | 31 |

As more clients onboard inside any vertical, this section will
populate automatically with category-level patterns.

## Per-client baselines

Each client's current citation footprint as of 2026-05-10. These
numbers are the baseline against which any future case study is
measured. Citation rate climbing from one of these starting points
to a higher one over a defined window is the case-study artifact.

### neverranked -- AEO agency

- **360** captured runs across **14** tracked keywords
- Named in **0** runs (**0%** citation rate)
- Top 5 sources cited alongside this client's queries:
  - vertexaisearch.cloud.google.com (114 runs)
  - google.com (100 runs)
  - prnewswire.com (94 runs)
  - youtube.com (89 runs)
  - geekpoweredstudios.com (61 runs)

### hawaii-theatre -- performing arts venue

- **31** captured runs across **2** tracked keywords
- Named in **30** runs (**97%** citation rate)
- Top 5 sources cited alongside this client's queries:
  - hawaiitheatre.com (101 runs)
  - tripadvisor.com (11 runs)
  - en.wikipedia.org (9 runs)
  - ticketmaster.com (8 runs)
  - google.com (6 runs)

### and-scene -- corporate training

- **3** captured runs across **1** tracked keywords
- Named in **0** runs (**0%** citation rate)
- Top 5 sources cited alongside this client's queries:
  - google.com (6 runs)
  - themanifest.com (2 runs)
  - theknowledgeacademy.com (2 runs)
  - dalecarnegie.com (1 runs)
  - nobleprog.com (1 runs)

## Methodology and sample disclosure

Every number in this report comes from `citation_runs` in the
NeverRanked production database. Each run is one query against one AI
engine for one tracked keyword, with the engine's response_text and
cited_urls captured as raw evidence.

Engines covered: bing, gemini, google_ai_overview, openai, perplexity.

Sample size at this snapshot:

- 394 citation runs
- 3 tracked clients across 3 verticals
- 17 tracked keywords
- Window: 2026-04-14 to 2026-05-10

### Keyword completion this window

Per-client share of active tracked keywords with at least one citation run in the window. Below 100% means the producer did not complete the full keyword set. A known infrastructure issue causes partial completions on multi-keyword clients (filed in `content/handoff-questions/`); numbers will rise as the fix lands.

| Client | Active keywords | Keywords with runs | Completion |
|---|---|---|---|
| and-scene | 5 | 1 | 20% |
| hawaii-theatre | 14 | 2 | 14% |
| neverranked | 15 | 6 | 40% |

Honest limits: this is NeverRanked's tracked subset, not a random
sample of the AI search universe. Findings are descriptive of what
AI engines say to questions in our clients' categories. Generalizing
beyond those categories requires more data.

The script that generated this report is at
`scripts/state-of-aeo-generate.mjs` and reads no private data.
The schema for `citation_runs` is public in the migrations folder.
