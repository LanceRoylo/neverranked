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

## Figure scopes and engine taxonomy (2026-08-22 reclassification)

The measurement is 7 surfaces: 4 citation-grade AI engines (Perplexity,
ChatGPT search, Gemini grounded, Google AI Overviews) + 2 model-knowledge
(Claude, Gemma) + 1 classic-search control (Bing organic top-5). Prose form:
"six AI tools plus a Bing organic control — seven measured surfaces." The
control is not an AI tool, does not "cite" or "answer" (it "returns"), and
no copy may attribute behavior to Copilot: there is no Copilot data.

Published percentages exist in TWO scopes and every figure must name its
scope: pooled web-searching (banking 51, dental 43, law 35, hotels 11) vs
all-surface (53, 44, 39, 17). Wealth is 47 in both. The reference table is
in teardowns/cross-category/. Unlabeled figures are how the 2026-08 drift
happened.

All non-customer cohorts are anonymized, banking included ("named in full"
applies only to 1:1 paid deliverables). scripts/check-claims.mjs blocks the
retired claims and scans audits/, content/, reports/, linkedin/ and social/
in addition to dist/ — it walks dist for site pages, so no fix is verified
until rebuild.

## Client provisioning

**Run `node scripts/preflight-client.mjs <slug>` rather than reasoning about
this from memory.** It asserts every requirement and exits non-zero when one
is missing. Updated 2026-08-28.

Provisioning is FIVE things, and four of them fail silently when absent:

1. `client_slug` + own domain + competitor cohort in `domains`
2. a row in `measurement_registry`, **and `active = 1`** — arms the watchdog,
   the pass-cadence digest, Atlas context and the customer view
3. rows in `citation_keywords`, **and `active = 1`** — this is a SEPARATE
   flag. `planCitationRun` filters `WHERE active = 1`, so arming only the
   registry gives you a watchdog over an empty pipeline
4. at least one row in `users`, or `handleReadoutView` bounces the customer
   to `/login` for an account that does not exist
5. a row in `customers` with `status IN ('active','pilot')` and
   `plan_markdown` set — `memo-generator` selects FROM this table, so a
   client absent from it never gets the contracted monthly memo

None of 2 through 5 raise anything when missing. An inactive or absent client
is not failing, it is skipped.

Status: HTC and Montaic provisioned. **Prince Waikiki provisioned 2026-08-28**
(registry, 18 keywords, domains, 2 logins, customers row, plan_markdown) with
both `active` flags deliberately still 0 — they flip on 2026-09-01, his start
date. Arming in August fires a false OVERDUE alarm for a month he was not a
client.
