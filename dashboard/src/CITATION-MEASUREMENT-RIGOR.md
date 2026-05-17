# Citation-measurement rigor — honest assessment

**Question this answers:** is NeverRanked's outcome measurement
strong enough to *defend* the core claim ("we increase your
citation rate in AI answer engines"), or only strong enough to
*feel* true? Written 2026-05-16 as the honest sanity-check on the
business thesis, not the code.

## Verdict

The thesis is currently a **strong hypothesis with ~n=1 proof**
(Hawaii Theatre, Perplexity 14/19, one easy/low-competition
vertical). The existing measurement (`citation-lift.ts`,
`citation-drift.ts`, `competitor_citation_diff`,
`citations-google-aio.ts`) is **good for a per-client directional
signal** and is more honest than most vendors' (it already refuses
to over-claim on small samples / forming baselines). It is **not
yet good enough for a causal, generalizable claim** across the
real (harder, commodity-category) ICP. Six specific gaps, ranked.

## What it already gets right (keep)

- Per-client baseline vs current windows; rate = cited/total over
  repeated `citation_runs` (samples engine nondeterminism, not a
  single shot).
- Honesty guards: `< 4wk` baseline-forming, `< 50 runs` low
  confidence, `baseline=0 → "first citations earned"` not a fake
  multiplier. This is real intellectual honesty — preserve it.
- `citation-drift.ts` does per-keyword before/after (catches
  regressions + "cited then, not now").
- A competitor/control concept exists (`competitor_citation_diff`).

## Gaps that currently make a generalizable claim indefensible

1. **Frozen query set is not enforced (biggest).** `citation-lift`
   aggregates over ALL `citation_keywords` for the slug in each
   window. If the keyword set changes between baseline and current
   (keywords added/removed mid-engagement), the comparison is
   apples-to-oranges and gameable (add easy-win keywords later →
   "lift"). FIX: lock the keyword set at deployment time; compute
   lift only over the keyword *intersection* present in BOTH
   windows (citation-drift's per-keyword model is the right shape;
   citation-lift's aggregate is the weak one).

2. **Headline lift is not control-adjusted.** `liftPoints =
   current - baseline` attributes ALL movement to NeverRanked. If
   an engine model/index update lifts the whole category,
   that's miscredited. The data exists (`competitor_citation_diff`,
   drift) but the number doesn't subtract it. FIX: report
   **client lift minus category/competitor drift** as the headline,
   raw lift as secondary.

3. **No statistical confidence, just a binary <50 flag.** A
   cited/total rate with N runs needs an interval. "23% → 31%,
   N≈60" can be pure noise. FIX: Wilson interval per window +
   two-proportion test; only claim a number when the delta is
   distinguishable from zero AND from control drift.

4. **Baseline anchored to `engagement_started_at`, not
   schema-deployment-live.** If the snippet goes live mid-baseline
   (onboarding lag), the "baseline" already contains treatment
   effect → muddied lift. FIX: anchor baseline to the verified
   deploy-live timestamp, not contract start. (Verify which it is
   today.)

5. **No pre-declared success criterion.** Nothing defines, before
   results, what "this worked for this client" means. Without it,
   every result gets narrated favorably — the exact failure mode
   the fail-closed grader exists to prevent, not yet applied to
   the outcome claim. FIX: pre-register per client (e.g.,
   "intersection-keyword, control-adjusted citation rate rises ≥X
   pts, stat-sig, sustained ≥3wk, cited source = the deployed
   pages").

6. **Query-set provenance / self-selection.** Who picks
   `citation_keywords`? If they're chosen where the client is
   likely to win, the rate isn't representative of real category
   demand. FIX: source keywords from real category intent
   (independent of "where we expect to look good"), recorded with
   provenance.

## Minimum to make the claim defensible (priority order)

1. Frozen/intersection keyword set (gap 1) — without this nothing
   else is trustworthy.
2. Control-adjusted headline lift (gap 2) — turns "we improved"
   into "we improved *more than the category drifted*".
3. Pre-declared per-client success criterion (gap 5) — the grader
   discipline, applied to the business claim.
Then 3 (stats), 4 (anchor), 6 (provenance).

## The honest framing for Lance

The machine is excellent and the measurement is unusually honest
for the category — but "honest small-sample directional signal"
is not "validated causal product." The first paying clients in
*competitive* categories, measured with gaps 1/2/5 closed, are
what move this from n=1 hope to a defensible claim — or tell you
precisely where it doesn't work, which is just as valuable. Do
NOT let the quality of the machine stand in for proof of the
thesis; let the machine go test the thesis under these rules.
