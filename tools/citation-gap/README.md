# @nr/citation-gap

Per-source AEO citation gap audit. Reads what AI engines actually
cite for a client's tracked keywords (from the dashboard's
`citation_runs` D1 table), classifies each cited URL by source type
(Wikipedia / TripAdvisor / Google Business Profile / press wires /
reddit / etc.), identifies where the client is missing or weakly
named, and produces source-appropriate action briefs to close the
gap.

For reddit-specific forward-looking discovery (predicting which
threads will be cited before they show up in `citation_runs`), see
the sister package `@nr/reddit-tracker`.

## Why it exists

The reddit tracker was built first, on the assumption that AI
engines lean heavily on reddit for citation. Auditing real
production data (695 captured runs across 4 engines for current
clients) found zero reddit citations -- the citation pattern for
local-business and venue queries is Wikipedia / TripAdvisor / Maps
/ press / brand-owned, not reddit.

This package is the universal version. Same gap-analysis pattern
as the reddit tracker, applied to every source type AI engines
actually cite. Works on the data the dashboard already has, so the
output is empirical rather than predictive.

## What's built

One CLI. Takes a client slug, queries D1 via wrangler, runs the
analyzer, generates source-appropriate briefs:

```bash
node scripts/citation-gap-scan.mjs \
  --client-slug "hawaii-theatre" \
  --client-domains "hawaiitheatre.com" \
  --since-days 90 \
  --top 8 \
  --format markdown
```

Formats: `markdown` (default), `json`, `summary`.

## Output structure

The CLI returns:

1. **Top-line summary.** How many runs were captured, how many named
   the client, how many unique source domains were cited.
2. **Most-active keywords.** The keywords driving citation volume.
3. **Source-level action briefs.** For each source where there's a
   meaningful gap (gap_score > 0.3 and not client-owned), a
   structured brief: action / gap / angle / tone notes / don't-do /
   evidence panel.
4. **Full source table.** Every cited domain with type, run count,
   client-named count, gap score, engines.

## Source taxonomy

Eleven source types plus client-owned and catchall:

- **wikipedia** -- entity entry edits and notability sourcing
- **tripadvisor** -- review density and recency
- **google-maps** -- Google Business Profile completeness
- **yelp** -- listing claim and consumer reviews
- **reddit** -- thread discovery via the sister package
- **youtube** -- video / transcript / description signals
- **news** -- wire services + earned press, including Hawaii-local
  outlets (Star-Advertiser, Civil Beat, Pacific Business News)
- **directory** -- aggregators (Ticketmaster, BBB, Manta, Yelp's
  cousins)
- **social** -- LinkedIn, Instagram, X, Facebook, TikTok
- **review-aggregator** -- G2, Capterra, Trustpilot, SoftwareAdvice
- **industry-publication** -- HBR, TechCrunch, Verge, Wired, etc.

Each type has its own action / angle / tone notes / don't-do
library. Adding a new type is a one-place change in `source-types.mjs`
and `brief.mjs`.

The classifier matches domains with proper boundary logic:
"x.com" matches `x.com` and `*.x.com` but not `ommax.com`.
"google.com/maps" matches `/maps` URLs only, not `/search`.
Homoglyph attacks (`reddit.com.fake`) and fake subdomains
(`fakegoogle.com`) classify as "other".

## Gap scoring

For each source domain, given total citation runs and how many of
those named the client:

```
ratio = client_named_runs / total_runs

ratio >= 0.8        -> low gap (0.10)
0.4 <= ratio < 0.8  -> mid gap (0.40)
ratio < 0.4         -> high gap (0.80)
```

Plus signal-weight bonuses for runs >= 3 (+0.10) and runs >= 10
(+0.10). Client-owned domains short-circuit to gap = 0 since the
client appearing on their own site is not a gap to close.

Briefs are generated only for sources with gap_score > 0.3 and at
least `--min-runs` citations.

## Real findings

`hawaii-theatre` (last 90 days, 31 runs):
- 97% citation rate (excellent overall)
- 17 unique sources cited
- 1 meaningful gap: `search.auw211.org` (Aloha United Way 211
  directory) cites them 3x but only names them 2x. NAP-consistency
  action.

`neverranked` (last 180 days, 345 runs):
- 0% citation rate (the AEO problem we sell against)
- 203 unique sources
- 5 prioritized gaps: Google Business Profile (100x), PRNewswire
  (94x), YouTube (84x), Wikipedia (32x), G2 (3x). Each with a
  source-appropriate action brief.

## Phase 2 backlog

Ordered by impact:

1. **Dashboard surface.** Per-client gap panel in the dashboard
   itself, not just a CLI. Same data, presented inline alongside
   the existing citations view.
2. **Direct D1 access.** Currently shells out to wrangler. The
   dashboard would query directly.
3. **Competitor extraction.** The `--competitors` flag in the
   reddit tools is manual. We can mine `citation_runs.response_text`
   to populate the competitive set per category automatically.
4. **More source-type classifiers.** Domains that currently fall to
   "other" (`vertexaisearch.cloud.google.com`, `airial.travel`,
   etc.) should be classified as patterns emerge across more clients.
5. **Source-prior weighting.** Wikipedia citations are weighted the
   same as a tiny niche directory in current scoring. In reality
   they're worth much more. A per-source-type multiplier on
   gap_score would surface the right priorities.

## Known limitations

- **CLI shells out to wrangler.** Adds ~1.5s overhead per query and
  requires the user to run from repo root (cwd is hard-coded).
- **Single-client per invocation.** No cross-client batch mode.
- **No memory bound on result sets.** A client with 100k runs would
  load all of them. None come close right now (largest is ~350).
