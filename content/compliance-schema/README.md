# Compliance-Aware Schema

Schema templates for regulated industries that include the
disclosures, attribution, and structural fields that compliance
teams need before they will sign off on anything in the
production HTML.

This is a moat. Generic schema vendors ship JSON-LD that breaks
when a compliance reviewer reads it. Banks, healthcare orgs, and
law firms cannot deploy schema that lacks the right disclosures
or that implies regulated claims without backing.

## Why this matters

For an enterprise customer like ASB or a hospital system, the
schema doesn't ship until legal/compliance signs off. If our
templates already pass compliance review, the deployment timeline
shrinks from weeks to days. If our templates don't, the deal
stalls in legal forever.

## Verticals covered

- `financial-services.md`: banks, credit unions, wealth advisors,
  SBA preferred lenders. FDIC / NCUA / FINRA aware.
- *Coming when triggered:* healthcare (HIPAA-aware), legal
  (ABA / state bar marketing rules), insurance, and education.

## How to use

1. Read the relevant vertical file
2. Copy the JSON-LD template and replace the placeholder values
3. Confirm the disclosures match the customer's specific
   regulatory profile (a state-chartered bank has slightly
   different requirements than a national bank)
4. Submit through customer's compliance review with the
   methodology document attached
