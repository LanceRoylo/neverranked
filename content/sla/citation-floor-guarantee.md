---
title: "NeverRanked Citation Floor Guarantee"
status: active
effective_date: 2026-05-08
applies_to: Signal and Amplify subscribers
---

# Citation Floor Guarantee

NeverRanked makes a binding written commitment to every Signal and
Amplify subscriber: if your AEO score drops more than 10 points
below the score we measured at contract signing AND we do not detect
the drop within 7 days, we credit the month.

This is not a marketing promise. It is a contractual term in every
NeverRanked subscription agreement, listed below.

## The guarantee in plain English

When you sign up for Signal or Amplify, we record your AEO score and
your weekly citation share at the start of the contract. We track
both every week against the same methodology published at
[neverranked.com/standards/methodology](https://neverranked.com/standards/methodology).

If either metric drops more than 10 points below baseline AND we have
not flagged the drop in your dashboard or via email within 7 days of
the drop occurring, you get a full credit for that month against the
next month's invoice.

The guarantee covers detection. We are not guaranteeing your score
never drops — search engines retrain, competitors deploy schema,
content gets stale. We are guaranteeing that if a drop happens, *we
will catch it before you do.* If we miss it, we eat the month.

## What is and isn't covered

### Covered

- A 10-point or greater drop in the AEO score baseline
- A 5-percentage-point or greater drop in citation share on the
  customer's tracked-prompt corpus
- A schema validation error introduced by a customer site change
  that passes for more than 7 days without us flagging it
- A complete loss of citations across all six tracked engines for
  more than 7 days

### Not covered

- Drops caused by the customer's own site changes that we were not
  given access to QA before deployment
- Drops in the first 14 days of a new subscription (the baseline-
  setting window)
- Drops attributable to a documented engine-wide change affecting
  every site in the category equally
- Score changes inside the noise band (±5 points) which are normal
  weekly variation
- Sites whose snippet was disabled by the customer or their dev team
  during the relevant window

### Pause clauses

The guarantee pauses automatically during:

- A documented Cloudflare or AI engine outage longer than 24 hours
- A migration window when the customer is moving CMS / hosting
  platforms (we will resume tracking once the new site is stable)
- The customer's request to pause tracking (e.g., during a brand
  redesign launch)

Pauses are logged in the customer's dashboard and the credit window
restarts after the pause ends.

## How credits work

When the guarantee triggers, the credit appears as a line item on
the next month's invoice with the request ID and a brief explanation
of what was missed. The customer also gets a Slack-style update from
Lance personally in the dashboard explaining what we missed and what
we changed in the tracking layer to catch it faster next time.

Customers may take the credit as:

1. A reduction in next month's invoice (default)
2. Application of the credit balance toward an upgrade tier
3. A refund issued to the original payment method on request

Credits stack — if the guarantee triggers two months in a row,
both months are credited.

## Why we offer this

Three reasons:

1. **It forces us to be excellent at detection.** Customers who churn
   from a ranking tool typically churn because they realized
   something was broken before the tool told them. The guarantee
   means we have to catch every drop. That bar is higher than what
   most AEO tools currently meet.

2. **It de-risks the buy for enterprise customers.** Senior buyers
   at banks and financial institutions need contractual assurance
   that the vendor's product is what they say it is. Cheap promises
   without contractual backing are not credible at this level. The
   guarantee makes our promise enforceable.

3. **It is hard for competitors to copy.** Promising a service-level
   guarantee on data integrity requires the underlying detection
   infrastructure to actually work. Funded competitors who shipped
   a dashboard but not the tracking depth cannot honor a guarantee
   like this. Whoever does it first locks the differentiation.

## Track record

This document was published 2026-05-08. As of publication, the
guarantee has been honored zero times because no qualifying drop has
occurred among current customers. The first incident — when it
happens — will be documented publicly in our changelog with a
post-mortem of what we missed and the fix that shipped.

## Reading the actual contract language

The guarantee is incorporated into the standard NeverRanked Service
Agreement at Section 4.3 ("Detection SLA"). If you would like to
review the contract before signing, request a copy at
sla@neverranked.com and we will send the current version within
one business day.
