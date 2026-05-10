---
title: "State of AEO: NeverRanked tracked-universe report"
window_start: 2026-04-14
window_end: 2026-05-10
generated: 2026-05-10
sample_runs: 437
sample_clients: 3
sample_engines: 5
sample_keywords: 17
---

# State of AEO: NeverRanked tracked-universe report

*From The Citation Tape, NeverRanked's standing AI-citation measurement system.*

*Generated 2026-05-10. Window: 2026-04-14 to 2026-05-10.*

> ## Data integrity notice
>
> This week's data is partial. 3 of 3 tracked clients fell below 80% keyword completion due to a known infrastructure issue (filed at `content/handoff-questions/citation-cron-not-firing.md`). Numbers below should be read as a lower bound on what AI engines actually retrieve until the fix lands.
>
> Affected this week:
> - **and-scene**: 1 of 5 keywords queried (20%)
> - **hawaii-theatre**: 2 of 14 keywords queried (14%)
> - **neverranked**: 6 of 15 keywords queried (40%)
>
> The full per-client completion table appears in the methodology section at the end of this report.

## What this report is

A standing snapshot of what AI engines actually cite when answering
questions about NeverRanked's tracked client universe. Pulled from
live 437 citation runs across 5 engines (bing, gemini, google_ai_overview, openai, perplexity),
17 tracked keywords, and 3 clients spanning 3 verticals.

Generated weekly. Same script, same data sources, no manual curation.
The methodology is the script (`scripts/state-of-aeo-generate.mjs`) plus
the public scoring engine at check.neverranked.com. Reproducible by
anyone with the same query against the same database.

## Headline

Across 437 captured AI engine responses, the single most-cited
third-party source is **vertexaisearch.cloud.google.com** (Google AI infrastructure (Gemini grounding)),
appearing in 132 citation runs across
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
| aeo-services-agency | 417 | 29.6% |
| seo-publication | 227 | 16.1% |
| aeo-platform | 203 | 14.4% |
| google-ai-infra | 132 | 9.4% |
| google-maps | 112 | 8.0% |
| youtube | 108 | 7.7% |
| news | 108 | 7.7% |
| wikipedia | 41 | 2.9% |
| reddit | 18 | 1.3% |
| directory | 17 | 1.2% |
| tripadvisor | 11 | 0.8% |
| social | 11 | 0.8% |

## Top 15 third-party sources

The domains that appeared most often as cited references across
the dataset. Excludes client-owned domains.

| Domain | Source type | Runs | Engines | Keywords | Clients |
|---|---|---|---|---|---|
| vertexaisearch.cloud.google.com | google-ai-infra | 132 | 1 | 5 | 2 |
| google.com | google-maps | 112 | 1 | 4 | 3 |
| youtube.com | youtube | 108 | 3 | 10 | 1 |
| prnewswire.com | news | 102 | 4 | 1 | 1 |
| hawaiitheatre.com | other | 101 | 3 | 2 | 1 |
| geekpoweredstudios.com | aeo-services-agency | 74 | 4 | 1 | 1 |
| eseospace.com | aeo-services-agency | 58 | 3 | 1 | 1 |
| orbitmedia.com | seo-publication | 55 | 1 | 2 | 1 |
| sparktoro.com | seo-publication | 54 | 1 | 1 | 1 |
| evertune.ai | aeo-platform | 54 | 2 | 2 | 1 |
| greenbananaseo.com | aeo-services-agency | 52 | 2 | 5 | 1 |
| arcintermedia.com | aeo-services-agency | 48 | 2 | 4 | 1 |
| animalz.co | seo-publication | 48 | 1 | 2 | 1 |
| generatemore.ai | aeo-platform | 44 | 2 | 2 | 1 |
| boralagency.com | other | 42 | 2 | 2 | 1 |

## What each engine cites differently

Top 5 sources per engine. When two engines have very different top
lists, that's a signal about how each one's retrieval differs.

### perplexity (236 runs)

- **youtube.com** -- 83 runs
- **orbitmedia.com** -- 55 runs
- **geekpoweredstudios.com** -- 54 runs
- **sparktoro.com** -- 54 runs
- **eseospace.com** -- 52 runs

### openai (146 runs)

- **google.com** -- 112 runs
- **prnewswire.com** -- 59 runs
- **en.wikipedia.org** -- 33 runs
- **hawaiitheatre.com** -- 32 runs
- **cited.so** -- 25 runs

### gemini (34 runs)

- **vertexaisearch.cloud.google.com** -- 132 runs
- **hawaiitheatre.com** -- 36 runs
- **builtin.com** -- 6 runs
- **20northmarketing.com** -- 6 runs
- **vividseats.com** -- 6 runs

### bing (11 runs)

- **myapplications.microsoft.com** -- 8 runs
- **mychart.org** -- 5 runs
- **mypay.dfas.mil** -- 5 runs
- **merriam-webster.com** -- 5 runs
- **mytax.hasil.gov.my** -- 4 runs

### google_ai_overview (10 runs)

- **reddit.com** -- 18 runs
- **linkedin.com** -- 8 runs
- **semrush.com** -- 5 runs
- **farandwide.io** -- 4 runs
- **runningfish.net** -- 3 runs

## Vertical breakdown

*Verticals with at least 3 tracked clients enable category-level insights.*

Current vertical distribution:

| Vertical | Clients | Runs |
|---|---|---|
| AEO agency | 1 | 403 |
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

- **403** captured runs across **14** tracked keywords
- Named in **0** runs (**0%** citation rate)
- Top 5 sources cited alongside this client's queries:
  - vertexaisearch.cloud.google.com (129 runs)
  - youtube.com (108 runs)
  - prnewswire.com (102 runs)
  - google.com (100 runs)
  - geekpoweredstudios.com (74 runs)

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

- 437 citation runs
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
