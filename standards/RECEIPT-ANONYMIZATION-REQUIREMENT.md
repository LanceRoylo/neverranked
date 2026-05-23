# Receipt anonymization — required behavior for the receipt-page generator

**Status: requirement, awaiting implementation.** No code yet — the
public-receipt-page generator does not exist as of 2026-05-23. The
existing outreach generator (`worker/src/generator.ts`) produces
cold email bodies, not standalone public receipt pages. When the
receipt-page generator is built, it MUST implement the behavior
below from day one.

This file is the canonical spec for that behavior, locked
2026-05-22 per the AI-visibility receipts legal risk assessment.

## The two surfaces

Every receipt exists in two forms:

1. **Private 1:1 outreach email** — sent directly to the named
   subject of the receipt. Lower legal exposure (private
   communication, dramatically smaller damages model). MAY name
   non-customer competitors, provided every named claim uses
   observational framing (enforced by the grader rule shipped
   2026-05-23, commit 5a855f9 / equivalent in dashboard).

2. **Public receipt page** — lives at `/receipts/<slug>/` (or
   equivalent), `noindex` or indexed depending on pilot phase.
   Higher legal exposure (broad audience, Lanham §43(a) damages
   model). MUST anonymize all named non-customer businesses to
   "Competitor A", "Competitor B", etc.

## What the generator must do

Inputs the generator already has:
- The named subject of the receipt (the prospect being measured).
- The list of named competitors that appeared in the cohort
  measurement.
- The raw citation data per (engine, query, business).

Required behavior:
1. **Generate the private email body** with real competitor names
   inline. This is the version that goes into the outreach
   pipeline.
2. **Generate the public receipt page body** by post-processing
   the private body:
   - Build a stable competitor-name → letter map for THIS receipt:
     the first non-subject business mentioned becomes "Competitor A",
     the second becomes "Competitor B", etc. Order is the order of
     first mention in the private body.
   - Replace every occurrence of each competitor name (case-
     insensitive, word-boundary-aware) with its letter alias.
     Match against the business's legal name AND any DBAs /
     common variants in the dataset.
   - The named subject is NEVER anonymized (they're the page's
     owner).
3. **Persist both versions** to the artifact store. The grader
   runs against both before either is shipped.
4. **Render the public version on the public URL.** Render the
   private version only in the outbound email.

## Edge cases the generator must handle

- **Subject is also a "competitor" in the cohort data.** When the
  named subject's own name appears in the cohort, leave it intact
  on both versions (they ARE this page's subject).
- **A competitor opted out.** The exclusion list (per
  `/takedowns/` process) is loaded by the generator. Any
  excluded business is removed from the cohort BEFORE the
  letter-mapping step, not anonymized. They do not appear at all.
- **A competitor's name appears as a substring in unrelated text**
  (e.g., "Hilton" inside "Hilton Hawaiian Village"). Use word-
  boundary matching and ALSO check against a manual exclusion list
  per receipt to avoid false anonymization. The generator must log
  the substitution map for human review on edge cases.
- **The letter map should be stable across re-renders of the same
  receipt.** Persist the map alongside the artifact so a re-render
  produces identical anonymization. New competitors that appear in
  a future re-run extend the map alphabetically; existing letters
  do not get reshuffled.

## What the grader will check

The grader (with the receipts-phrasing pre-filter shipped
2026-05-23) already catches normative/causal/future-tense
phrasing. When the receipt-page generator ships, the grader's
checks on PUBLIC artifacts must additionally include:

- No business name appears in the public receipt that is not (a)
  the named subject of the receipt, or (b) a public-domain
  reference to a body that is not a competitor in the cohort
  (e.g., naming an engine like "Perplexity" is fine; naming a
  competitor business like "Acme Med Spa" is not).
- The letter-mapped competitors are referenced consistently
  across the artifact ("Competitor A" appears as "Competitor A"
  throughout, not "Competitor A" in one place and "the first
  competitor" in another).

This is a generator-side change; the grader is the gate that
catches mistakes if the generator misses one. Both layers
together produce the legal containment.

## Why this is not built yet

The receipts-page generator is a future product surface. As of
2026-05-23 the only generator-of-prospect-facing-content in the
pipeline is the cold-email generator, which (per the legal
assessment) MAY name competitors in private 1:1 email with
observational framing. The grader rule that landed 2026-05-23
covers that surface.

When the receipt-page generator is being built (post-launch),
this file is the spec to build against. The grader's deterministic
phrasing pre-filter is already in place; the anonymization layer
is the missing piece, and it lives in the generator side.

## Cross-reference

- `standards/RECEIPT-FOOTER-TEMPLATE.md` — canonical disclosures
- `/takedowns/` page — the opt-out / takedown SLA and process
- `memory/receipts_pilot_containment.md` — the seven rules
- 2026-05-22 legal risk assessment (delivered in chat, not yet
  written to disk)
