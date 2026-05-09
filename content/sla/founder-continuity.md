---
title: "NeverRanked Founder Continuity Plan"
status: active
last_updated: 2026-05-08
audience: enterprise prospects evaluating founder-risk
---

# Founder Continuity Plan

NeverRanked has one full-time founder (Lance Roylo) and a handful of
contract specialists. Enterprise buyers reasonably ask: what happens
if you get hit by a bus? This document is the answer.

## What every customer owns the moment they sign

1. **All schema we deploy on your site.** It is yours, in your HTML,
   under your control. Removing the NeverRanked snippet leaves the
   schema intact unless you delete it. We do not retain ownership of
   any structured data we deploy on customer sites.

2. **All audit deliverables.** Every audit, roadmap, and report PDF
   is delivered to the customer's primary contact and stored in
   their dashboard for the lifetime of the subscription. PDFs are
   downloadable any time. After cancellation, the customer keeps
   access to download for 90 days at no charge.

3. **All citation tracking data.** The weekly scan results, prompt
   responses, citation observations, and benchmark comparisons for
   the customer's account are exportable as CSV/JSON from the
   dashboard at any time. After cancellation, the export is
   available for 90 days, then deleted.

4. **All custom content drafts (Amplify tier).** Content drafts
   produced by NeverRanked are work-for-hire under the standard
   subscription agreement. Customer owns the output, including the
   right to repurpose, modify, or republish.

## What the dashboard provides on demand

A "Continuity Export" button in Settings produces a single ZIP
file containing:

- All audit PDFs ever delivered to the account
- Full citation tracking history as CSV
- All deployed schema templates as JSON-LD files
- The customer's prompt corpus and brand voice fingerprint (if
  Amplify)
- Vendor's contact information for re-engagement post-recovery

This is available regardless of subscription status. It is not gated
on payment. The export does not require a support ticket.

## What happens to the platform if Lance is incapacitated

The marketing site, dashboard, and snippet runtime are deployed on
Cloudflare and continue running automatically. Customers will see
the same dashboard, the same scans, the same scheduled reports for
at least 90 days from any disruption to founder availability,
because:

- All deployment is fully automated via GitHub Actions to Cloudflare
- All scans, reports, and emails are scheduled via cron triggers
  that do not require human intervention
- Stripe billing continues unattended. Subscription renewals do not
  require manual approval
- The Cloudflare account has a designated co-administrator with
  read-only access plus billing/account-recovery rights

After 90 days, the platform may degrade as engine API contracts
require renegotiation, but the schema deployed on customer sites
remains in place permanently.

## What happens to the company if Lance is incapacitated long-term

A successor plan exists in writing with the company's legal counsel:

1. The Cloudflare account, GitHub repository, and Stripe account
   transfer to a designated successor (named in the founder
   succession agreement, available to enterprise customers under NDA)
2. All active customer contracts continue under their existing terms
   with the successor's signature on a continuation amendment
3. Customers may elect to terminate without penalty within 30 days
   of being notified of the transition
4. Schema already deployed on customer sites is unaffected

## What happens to the company if it is acquired

Acquisition triggers automatic notification to all active customers
within 7 days. Customers may:

1. Continue under existing terms (default)
2. Terminate without penalty within 30 days
3. Renegotiate terms with the acquiring entity if the acquirer
   imposes material changes

Schema already deployed on customer sites is unaffected by
acquisition.

## What happens if NeverRanked is shut down

A shutdown notice provides 90 days of continued service before
turnoff. During the 90-day window:

1. All scans, reports, and tracking continue normally
2. Customers can export their full data at any time
3. Stripe billing pauses immediately
4. Schema remains deployed on customer sites and continues
   functioning

After the 90-day window, the dashboard is taken offline but the
exported data and the deployed schema remain functional indefinitely.

## What enterprise customers may request before signing

Three options available for accounts at $10,000+ annual contract
value:

1. **Source escrow.** The codebase for the snippet runtime and
   dashboard worker is escrowed with a third-party provider (Iron
   Mountain or equivalent) and released to enterprise customers in
   the event of company shutdown.
2. **Multi-cloud failover.** For customers requiring geographic or
   provider diversification, the snippet can be deployed via the
   customer's own Cloudflare account with NeverRanked as a managed
   service rather than a hosted service. Schema deployment continues
   under customer control even if NeverRanked-the-company is
   unavailable.
3. **On-site weekly export.** Citation tracking data can be exported
   via SFTP or webhook to the customer's own data warehouse on a
   weekly schedule. This is included in any contract above the
   threshold.

Request these provisions during contract negotiation. They are
standard add-ons and do not increase the subscription price.

## Why this document exists

Most early-stage AEO vendors have no continuity plan. Asking the
question often kills the deal because the answer is "we have not
thought about it."

NeverRanked has thought about it. The structures above are not
aspirational. The dashboard export already works, the deployment
is already automated, the successor plan is already in writing.
The provisions for $10K+ contracts are standard contract addenda
ready to sign.

If you are evaluating NeverRanked for an enterprise buy and have
specific continuity requirements, send them to lance@neverranked.com.
Most can be accommodated without changing the price.
