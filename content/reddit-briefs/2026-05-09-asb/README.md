# Reddit reply briefs: ASB Hawaii landscape, 2026-05-09 (v2)

Re-run after the `tools/reddit-tracker` relevance-gate fix.
Designed as evidence material for the May 18 ASB + MVNP meeting.

## What changed from v1

The first run (v1) returned 14 threads with about 50% noise -- the
relevance gate let through r/montreal, r/ottawa, r/pittsburgh, and
similar threads about small-business owners that did not mention
Hawaii or banks. Cause: the anchor gate matched on "small" +
"business" without requiring the discriminating region token.

Fix shipped in `tools/reddit-tracker/src/score.mjs`:

1. **Region-token enforcement.** Any token that is a known US
   state, Hawaii county, or major Hawaii locale (Hawaii, Honolulu,
   Oahu, Kaneohe, Kailua, Maui, etc.) is now required to appear in
   the title. Caller can also pass explicit `requiredTokens` for
   non-region cases.
2. **Anchor matcher region-aware.** Region anchors use a looser
   matcher so "Hawaii" matches "Hawaiian", "Hawaii's", and
   "Hawaiians" naturally.
3. **Anchor floor lowered from 5 to 4 chars.** "bank", "food",
   "shop", "code", "yoga", "loan" are legitimate category nouns
   that anchor a query. The 5-char floor was previously dropping
   "bank" from "best community bank in Hawaii", forcing the gate
   to rely on weaker tokens like "community".

Six new tests cover the noise-killing behavior, including the
exact Montreal-thread case from the v1 audit. 68 tests passing.

## All 11 ranked

| # | Pri | Subreddit | Category | Thread |
|---|---|---|---|---|
| 1 | 0.94 | r/Hawaii | BOH vs FHB | [thread](https://www.reddit.com/r/Hawaii/comments/1p4b4p0/first_hawaiian_bank_continues_to_shock_me/) |
| 2 | 0.72 | r/SECWatch | best community bank Hawaii | (financial filing thread, monitor only) |
| 3 | 0.71 | r/KaneoheOahu | best bank Hawaii | [thread](https://www.reddit.com/r/KaneoheOahu/comments/1mu6zn2/part_of_the_roof_overhang_at_the_bank_of_hawaii/) |
| 4 | 0.70 | r/Oahu | best bank Hawaii | [thread](https://www.reddit.com/r/Oahu/comments/1o9fize/the_bank_of_hawaii_boh_is_offering_financial/) |
| 5 | 0.59 | r/postcrossing | best community bank Hawaii | (residual noise, postcard sub) |
| 6 | 0.52 | r/CreditCards | best bank Hawaii | BOH credit card thread |
| 7 | 0.51 | r/HawaiiUncensored | best bank Hawaii | local Hawaii sub |
| 8 | 0.48 | r/Oahu | best bank Hawaii | local |
| 9-10 | 0.45 | r/SECFilingsAI | BOH vs FHB | FHB filings (passive monitor) |
| 11 | 0.34 | r/honeymoonplanning | best community bank Hawaii | (residual: Hawaii honeymoon mentions credit cards) |

## What the meeting story is

Same as v1, sharper evidence. Two related observations that turn
into talking-tracks:

1. **In actual Hawaii consumer conversations on Reddit, FHB and BOH
   get named, ASB does not.** This is not a marketing failure --
   it is a citation infrastructure gap. The same dynamic shows up
   in the AI engine logs (see the State of AEO 2026-05-10 report:
   ASB is named in 0% of citation runs across the relevant query
   set).

2. **The "first community bank to show up in r/Hawaii conversations"
   becomes the answer AI engines return for "best community bank in
   Hawaii."** Reddit thread participation is one of the few
   citation-shifting moves community banks can make without paid
   media. Not a high-volume play, but it compounds.

The agency angle for MVNP: **Reddit reply ops are the missing
service line.** No Hawaii agency offers structured Reddit citation
work today. The Phase 1 tracker that produced this output is part
of NR's existing infrastructure -- MVNP partners get it included
in any wholesale pilot.

## The headline thread

**[r/Hawaii: First Hawaiian Bank continues to shock me](https://www.reddit.com/r/Hawaii/comments/1p4b4p0/first_hawaiian_bank_continues_to_shock_me/)**

Priority 0.94. ASB absent. FHB named, negatively. The cleanest
competitor-visible / client-absent gap in the entire Hawaii
banking dataset. Brief skeleton in `boh-vs-fhb.md`.

## Methodology

```bash
node scripts/reddit-brief-generate.mjs \
  --category "<phrase>" \
  --client-slug "asb-hawaii" \
  --client-names "American Savings Bank,ASB,ASB Hawaii" \
  --client-domains "asbhawaii.com" \
  --competitors "Bank of Hawaii,BOH,First Hawaiian Bank,FHB,Central Pacific Bank,CPB" \
  --top 5 --format markdown
```

Re-run any time -- output is reproducible from the same Reddit
search results within the day.
