# NeverRanked Dashboard

The customer-facing product. Everything a client sees or receives is served from
here (`dashboard/`), a Cloudflare Worker over D1 `neverranked-app`.

## The monthly deliverable is a live URL, not a document

The client's monthly research memo IS:

    https://app.neverranked.com/c/<client_slug>/readouts/<YYYY-MM>

It renders on demand from measurement data. There is no PDF to assemble and no
prose to hand-write. Answer questions about "the memo" from this file, not from
anything in the outreach repo.

Code path:
- `dashboard/src/index.ts:1127` matches `/c/:slug/readouts/:YYYY-MM` and calls
  `routes/customer-readouts.ts` `handleReadoutView`. Bare `/c/:slug/readouts`
  is the archive index.
- `lib/report-facts.ts` assembles facts from `citation_snapshots`.
- `lib/report-notes.ts` `writeAnalystNotes` auto-writes the analyst prose with
  `claude-sonnet-5`, called from `report-facts.ts:299`.
- Readouts are NOT stored in a table. They render from snapshots each request.

The section titled "Where AI's answers come from" is what the code calls the
off-site punch list. That IS the prioritized action list promised in client
contracts.

## The hallucination guard is load-bearing

`allowedNumbers(facts)` in `lib/report-notes.ts:38` builds the set of numbers
the prose is permitted to mention (measured values, prior values, deltas, row
counts) and `cleanNote()` strips anything outside it. The writing layer cannot
invent a figure.

This is the May retraction discipline enforced in code, not a style filter. Do
not widen the allowed set to make prose read better, and do not bypass
`cleanNote()`.

## Positioning constraint

NeverRanked MEASURES. It does not deploy to, or touch, client sites. Hosted
schema injection was retired 2026-07-24. Nothing in this repo should reintroduce
a write path to a client's site.

## Client provisioning

A client needs a `client_slug` plus a competitor cohort in `domains`, and an
active row in `measurement_registry`. Until those exist, no readout URL exists
for them. HTC and Montaic are provisioned. Prince Waikiki is NOT, as of
2026-07-27.
