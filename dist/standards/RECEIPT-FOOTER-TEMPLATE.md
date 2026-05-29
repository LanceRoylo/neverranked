# Receipt footer template — canonical disclosures for every AI-visibility receipt

**Status: canonical, mandatory.** Every NeverRanked receipt — whether
published on a public URL, sent as cold outreach email, or shared as
a PDF — includes the disclosures below. This file is the single
source of truth. Generators and templates pull from here, not from
inline copies.

The disclosures are short by design. The point is that they appear
in every artifact, not that they are decorative.

## The three required disclosures

Every receipt artifact (public page + email + PDF) MUST include all
three of the following, in this order, in the footer position of
the artifact.

### 1. Measurement window

> Measured between {{START_DATE}} and {{END_DATE}}. AI engine
> behavior changes weekly. We will re-run on request.

Where:
- `{{START_DATE}}` is the earliest measurement timestamp in the
  underlying dataset, formatted `Month D, YYYY`.
- `{{END_DATE}}` is the latest measurement timestamp, same format.

If the measurement is a single-day snapshot, use a single date:
"Measured on {{DATE}}."

### 2. Methodology link

> Methodology, queries, and engines polled: neverranked.com/methodology

Always the full URL, never a relative path, since receipts travel
via email and PDF where relative paths break.

### 3. Takedown and opt-out

> To request removal or opt out of future measurement, email
> takedown@neverranked.com. 24-hour SLA. Full process:
> neverranked.com/takedowns

Always the dedicated takedown address, never the general inbox.
Always the full takedowns URL alongside.

## Variant: cold-outreach email footer

Cold outreach has additional CAN-SPAM requirements on top of the
three disclosures above. The complete email footer is:

```
---

Measured between {{START_DATE}} and {{END_DATE}}. AI engine behavior
changes weekly. We will re-run on request.

Methodology, queries, and engines polled:
https://neverranked.com/methodology

To request removal or opt out of future measurement, email
takedown@neverranked.com. 24-hour SLA. Full process:
https://neverranked.com/takedowns

---

NeverRanked is research, not software. We do not install anything
on your property. This message is from a real person. If you would
rather not hear from us, reply with "stop" or click here:
{{UNSUBSCRIBE_URL}}

Lance Roylo
NeverRanked
{{POSTAL_ADDRESS}}
Honolulu, Hawaii
```

Where:
- `{{UNSUBSCRIBE_URL}}` is the per-recipient unsubscribe URL produced
  by the outreach worker.
- `{{POSTAL_ADDRESS}}` is the CAN-SPAM-required postal address
  currently on file for NeverRanked.

## Variant: public receipt page footer

Public receipt pages (published at `/receipts/<slug>/` or similar)
include the three disclosures plus the standard site footer. The
three disclosures sit ABOVE the standard site footer, in a visually
distinct block (gold left-border style, matching the takedown notice
block on `/takedowns/`).

## Anonymization rule (interacts with this template)

Per the legal risk assessment dated 2026-05-22, every business named
on a publicly-indexed receipt page that is NOT the subject of the
receipt (i.e., named competitors) MUST be anonymized to
"Competitor A", "Competitor B", etc.

The 1:1 outreach email to the named subject MAY name competitors,
provided every named claim is fact-framed:

> On {{N}} of {{M}} observed queries between {{START_DATE}} and
> {{END_DATE}}, {{ENGINE}} cited {{NAMED_COMPETITOR}}.

Never the normative phrasing ("AI recommends X", "X is preferred",
"X is the top result"). Always the observational phrasing.

The grader rejects any receipt where:
- A non-customer business is named on the public version of the page.
- Any claim uses normative language ("recommends", "prefers",
  "endorses", "is preferred", "top result") rather than observational
  ("cited", "appeared in", "was returned by").
- Any claim asserts causation ("citation → revenue", "presence → ranking").

## Versioning

This template is versioned with the repo. Material changes require:
1. A commit updating this file.
2. A corresponding update to the receipt generator and outreach
   worker so the change propagates.
3. An entry in the pilot scope memo recording the change and the
   date it took effect.

Minor wording changes (date format, link format) follow the same
process but do not require pilot scope memo entry.

## What this file is for

The single source of truth for receipt disclosures, so the legal
posture is identical across every surface a receipt appears on.
Generators reference this file; this file is not a draft that gets
copied into generators.
