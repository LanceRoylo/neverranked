---
title: "State of AEO: NeverRanked tracked-universe report"
window_start: 2026-04-14
window_end: 2026-05-11
generated: 2026-05-11
sample_runs: 754
sample_clients: 3
sample_engines: 5
sample_keywords: 42
---

# State of AEO: NeverRanked tracked-universe report

*From The Citation Tape, NeverRanked's standing AI-citation measurement system.*

*Generated 2026-05-11. Window: 2026-04-14 to 2026-05-11.*

## What this report is

A standing snapshot of what AI engines actually cite when answering
questions about NeverRanked's tracked client universe. Pulled from
live 754 citation runs across 5 of 7 tracked engines (bing, gemini, google_ai_overview, openai, perplexity),
42 tracked keywords, and 3 clients spanning 3 verticals.

Generated weekly. Same script, same data sources, no manual curation.
The methodology is the script (`scripts/state-of-aeo-generate.mjs`) plus
the public scoring engine at check.neverranked.com. Reproducible by
anyone with the same query against the same database.

## Headline

Across 754 captured AI engine responses, the single most-cited
third-party source is **youtube.com** (YouTube),
appearing in 190 citation runs across
5 of 7 tracked engines and 22 tracked keywords.

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
| aeo-services-agency | 551 | 26.8% |
| seo-publication | 323 | 15.7% |
| aeo-platform | 245 | 11.9% |
| youtube | 190 | 9.2% |
| google-maps | 168 | 8.2% |
| google-ai-infra | 163 | 7.9% |
| news | 118 | 5.7% |
| reddit | 95 | 4.6% |
| wikipedia | 62 | 3.0% |
| social | 57 | 2.8% |
| directory | 50 | 2.4% |
| tripadvisor | 24 | 1.2% |

## Top 15 third-party sources

The domains that appeared most often as cited references across
the dataset. Excludes client-owned domains.

| Domain | Source type | Runs | Engines | Keywords | Clients |
|---|---|---|---|---|---|
| youtube.com | youtube | 190 | 5 | 22 | 3 |
| google.com | google-maps | 168 | 2 | 10 | 3 |
| vertexaisearch.cloud.google.com | google-ai-infra | 163 | 1 | 5 | 2 |
| hawaiitheatre.com | other | 148 | 4 | 12 | 1 |
| prnewswire.com | news | 111 | 4 | 2 | 1 |
| reddit.com | reddit | 95 | 2 | 19 | 3 |
| geekpoweredstudios.com | aeo-services-agency | 88 | 4 | 1 | 1 |
| eseospace.com | aeo-services-agency | 73 | 3 | 3 | 1 |
| orbitmedia.com | seo-publication | 64 | 3 | 3 | 1 |
| arcintermedia.com | aeo-services-agency | 63 | 3 | 6 | 1 |
| sparktoro.com | seo-publication | 63 | 1 | 1 | 1 |
| evertune.ai | aeo-platform | 62 | 3 | 4 | 1 |
| animalz.co | seo-publication | 61 | 3 | 4 | 1 |
| greenbananaseo.com | aeo-services-agency | 61 | 3 | 8 | 1 |
| generatemore.ai | aeo-platform | 59 | 2 | 4 | 1 |

## What each engine cites differently

Top 5 sources per engine. When two engines have very different top
lists, that's a signal about how each one's retrieval differs.

### perplexity (306 runs)

- **youtube.com** -- 108 runs
- **eseospace.com** -- 63 runs
- **sparktoro.com** -- 63 runs
- **geekpoweredstudios.com** -- 61 runs
- **orbitmedia.com** -- 59 runs

### openai (200 runs)

- **google.com** -- 167 runs
- **prnewswire.com** -- 61 runs
- **hawaiitheatre.com** -- 48 runs
- **en.wikipedia.org** -- 34 runs
- **nrlc.ai** -- 30 runs

### gemini (103 runs)

- **vertexaisearch.cloud.google.com** -- 163 runs
- **hawaiitheatre.com** -- 55 runs
- **builtin.com** -- 21 runs
- **20northmarketing.com** -- 20 runs
- **higoodie.com** -- 13 runs

### bing (81 runs)

- **merriam-webster.com** -- 36 runs
- **dictionary.cambridge.org** -- 21 runs
- **myapplications.microsoft.com** -- 18 runs
- **mychart.org** -- 13 runs
- **collinsdictionary.com** -- 12 runs

### google_ai_overview (64 runs)

- **reddit.com** -- 82 runs
- **youtube.com** -- 47 runs
- **linkedin.com** -- 34 runs
- **onely.com** -- 10 runs
- **eventbrite.com** -- 10 runs

## Vertical breakdown

*Verticals with at least 3 tracked clients enable category-level insights.*

Current vertical distribution:

| Vertical | Clients | Runs |
|---|---|---|
| AEO agency | 1 | 639 |
| performing arts venue | 1 | 88 |
| corporate training | 1 | 27 |

As more clients onboard inside any vertical, this section will
populate automatically with category-level patterns.

## Per-client baselines

Each client's current citation footprint as of 2026-05-11. These
numbers are the baseline against which any future case study is
measured. Citation rate climbing from one of these starting points
to a higher one over a defined window is the case-study artifact.

### neverranked -- AEO agency

- **639** captured runs across **23** tracked keywords
- Named in **0** runs (**0%** citation rate)
- Top 5 sources cited alongside this client's queries:
  - youtube.com (187 runs)
  - vertexaisearch.cloud.google.com (160 runs)
  - google.com (145 runs)
  - prnewswire.com (111 runs)
  - reddit.com (89 runs)

### hawaii-theatre -- performing arts venue

- **88** captured runs across **14** tracked keywords
- Named in **53** runs (**60%** citation rate)
- Top 5 sources cited alongside this client's queries:
  - hawaiitheatre.com (148 runs)
  - tripadvisor.com (23 runs)
  - en.wikipedia.org (21 runs)
  - ticketmaster.com (20 runs)
  - eventbrite.com (15 runs)

### and-scene -- corporate training

- **27** captured runs across **5** tracked keywords
- Named in **0** runs (**0%** citation rate)
- Top 5 sources cited alongside this client's queries:
  - google.com (14 runs)
  - theknowledgeacademy.com (11 runs)
  - theyimprov.com (8 runs)
  - radicalagreement.com (7 runs)
  - businesstrainingworks.com (6 runs)

## Methodology and sample disclosure

Every number in this report comes from `citation_runs` in the
NeverRanked production database. Each run is one query against one AI
engine for one tracked keyword, with the engine's response_text and
cited_urls captured as raw evidence.

Engines covered: bing, gemini, google_ai_overview, openai, perplexity.

Sample size at this snapshot:

- 754 citation runs
- 3 tracked clients across 3 verticals
- 42 tracked keywords
- Window: 2026-04-14 to 2026-05-11

### Keyword completion this window

Per-client share of active tracked keywords with at least one citation run in the window. Below 100% means the producer did not complete the full keyword set. A known infrastructure issue causes partial completions on multi-keyword clients (filed in `content/handoff-questions/`); numbers will rise as the fix lands.

| Client | Active keywords | Keywords with runs | Completion |
|---|---|---|---|
| and-scene | 5 | 5 | 100% |
| hawaii-theatre | 14 | 14 | 100% |
| neverranked | 15 | 15 | 100% |

Honest limits: this is NeverRanked's tracked subset, not a random
sample of the AI search universe. Findings are descriptive of what
AI engines say to questions in our clients' categories. Generalizing
beyond those categories requires more data.

The script that generated this report is at
`scripts/state-of-aeo-generate.mjs` and reads no private data.
The schema for `citation_runs` is public in the migrations folder.
