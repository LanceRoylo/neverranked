# getjustice.com — internal prospect brief

**INTERNAL ONLY. Do not send. Do not put competitive claims in front of the prospect until the LLC + insurance (especially Media Liability) are in place.** This captures what we found so it's ready to turn into a fresh pitch when the gate clears.

## Who they are

The Ruth Law Team (getjustice.com). Personal injury law firm. Contingency-fee. Multi-state: Florida (St. Pete, Tampa, Clearwater, Orlando, Jacksonville, and more), Georgia (Brunswick), Minnesota (Minneapolis/St. Paul metro). Practice areas: auto/truck/motorcycle/rideshare accidents, nursing home abuse, slip-and-fall, medical malpractice, wrongful death, defective products.

## Why it's a fit

- Personal injury is one of the highest-value local-services verticals there is. A single case is worth tens of thousands in fees, so AI visibility for "best PI lawyer in [city]" carries real dollar value.
- Multi-geo / multi-office maps to per-category pricing. Could be one flagship market (Tampa/St. Pete) or several.
- Measurement-only model fits: they have marketing staff or an agency to execute the punch list.

## What we found (spot-check, 2026-06-01)

Two signals, both pointing the same way:

1. **Citation spot-check (Perplexity, 5 Tampa-area PI queries).** AI cited Ruth Law Team ZERO times across all five. It named a different set of competitor firms each time, plus directories (Super Lawyers, Justia). The field is fragmented — no single firm owns these queries (Catania & Catania appeared twice, the only repeat). Fragmented field = winnable; there's no entrenched AI-favorite to dethrone.
   - Queries: best PI lawyer Tampa; top car accident attorney St. Petersburg; truck accident Tampa; nursing home abuse Tampa Bay; rideshare accident Clearwater.

2. **Structural scan (check.neverranked.com).** Their homepage is client-side rendered (JavaScript). The HTML served to crawlers is nearly empty, so AI engines that don't execute JS see a blank page. That is why they're invisible. (This is now correctly reported by the scanner as a single "renders with JavaScript" finding.)

The two findings reinforce each other: the structural problem (invisible HTML) shows up as the real outcome (AI names competitors, never them).

## Honesty caveats (carry these into the real pitch)

- The spot-check is 5 queries, one engine, one run. It is enough to say "pursue," not enough to quote as the finished measurement.
- Before pitching, run the full frozen diagnostic: 7 engines, 18 queries, 3 runs, control-adjusted. That is the sellable artifact.
- Run it FRESH, close to the pitch. Citation data drifts; a run done weeks early is stale by pitch time.
- Recurring competitor to anchor the cohort: Catania & Catania (cataniaandcatania.com). The full cohort gets built from a proper cohort-coverage pass at measurement time.

## When the gate clears

1. LLC + insurance done.
2. Katy makes the warm intro (see intro-template.md).
3. Run the fresh full Tampa PI diagnostic. **Cohort + runner are pre-staged (2026-06-08):**
   - `cd ~/Desktop/neverranked-outreach && ./run.sh dryrun/run-pi-law-tampa.mjs` (run #1)
   - `cd dryrun/forensic && node cohort-coverage.mjs --category pi_law_tampa` → curate the surfaced Tampa PI firms into `cohorts.mjs`, hand-filter directories (Avvo, FindLaw, Justia, Super Lawyers)
   - Fire runs #2 and #3, then `node aggregate.mjs --category pi_law_tampa --json` and `node within-citation.mjs --category pi_law_tampa --json`
   - getjustice.com is registered as the owned/prospect; anchors are Catania & Catania, Morgan & Morgan, Winters & Yonker, Distasio
   - Run it FRESH, close to pitch time. Do not run early.
4. Bring the finding ("AI names these firms when someone asks for the best PI lawyer in Tampa, you're not one of them, here's the gap"), make the offer.
5. Katy's fee on close per the agreement.
