---
vertical: Financial services (US, retail and small business banking)
regulatory_frame: FDIC, NCUA, FINRA, CFPB, Reg DD, Reg E, Truth in Savings, Equal Housing Lender
last_updated: 2026-05-07
status: ready for compliance review
---

# Compliance-Aware Schema for US Financial Services

This document is the canonical NeverRanked template set for
deploying structured data on US bank, credit union, and
wealth-management websites. Every JSON-LD block here has been
written to anticipate the questions a bank's compliance team
will ask before signing off.

If the customer is a state-chartered institution, a national
bank, or a credit union, swap the placeholder regulatory
identifiers accordingly. Federal credit unions use NCUA, not
FDIC. Wealth advisors using SEC or state registration use the
FinancialService.disambiguatingDescription field to disclose
their registration status.

## Organization / FinancialService block

The foundational block. This goes in the site-wide layout
header. Every page inherits it.

```json
{
  "@context": "https://schema.org",
  "@type": ["BankOrCreditUnion", "FinancialService"],
  "@id": "https://www.example.com/#organization",
  "name": "Example Community Bank",
  "alternateName": "Example Bank",
  "url": "https://www.example.com",
  "logo": {
    "@type": "ImageObject",
    "url": "https://www.example.com/static/logo-1200x630.png",
    "width": 1200,
    "height": 630
  },
  "image": "https://www.example.com/static/og-default.png",
  "description": "Example Community Bank is a state-chartered commercial bank serving Hawaii since 1925, offering personal banking, business banking, mortgages, and SBA-preferred lending across all Hawaiian Islands.",
  "foundingDate": "1925",
  "memberOf": [
    {
      "@type": "Organization",
      "name": "FDIC",
      "url": "https://www.fdic.gov/"
    },
    {
      "@type": "Organization",
      "name": "Federal Reserve System"
    }
  ],
  "isicV4": "6419",
  "naics": "522110",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Bishop St",
    "addressLocality": "Honolulu",
    "addressRegion": "HI",
    "postalCode": "96813",
    "addressCountry": "US"
  },
  "telephone": "+1-808-555-0100",
  "areaServed": {
    "@type": "State",
    "name": "Hawaii"
  },
  "currenciesAccepted": "USD",
  "paymentAccepted": ["Cash", "Credit Card", "Debit Card", "ACH", "Wire Transfer"],
  "knowsAbout": ["Personal Banking", "Business Banking", "SBA Lending", "Residential Mortgage", "Commercial Real Estate Lending"],
  "slogan": "(brand tagline goes here)",
  "disambiguatingDescription": "Member FDIC. Equal Housing Lender. NMLS ID #XXXXXXX."
}
```

### Compliance notes on this block

- `disambiguatingDescription` carries the FDIC member statement,
  Equal Housing Lender designation, and NMLS ID. These are
  required disclosures under federal law for any external-facing
  marketing material that names the institution. AI engines also
  cite this field when asked about regulatory standing.
- `memberOf` makes the FDIC relationship machine-readable. If
  a customer asks ChatGPT "is X bank FDIC insured," this is the
  block that lets the engine answer correctly without
  hallucinating.
- `naics` (522110 = commercial banking) and `isicV4` are
  optional but help engines disambiguate commercial bank from
  credit union from broker-dealer.
- For credit unions, replace `BankOrCreditUnion` with just
  `BankOrCreditUnion` (already correct), and replace FDIC with
  NCUA in `memberOf`.

## FAQPage block (rate-disclosure aware)

For the Common Questions or FAQ page. The trick is that any
FAQ that mentions a rate, fee, or APY triggers Truth in Savings
disclosure requirements. The schema must include the disclosure
within the answer text, not as a separate block.

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is the current APY on your savings account?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "As of the date posted, our standard savings account earns 0.10% APY. Rates are variable and may change at any time without notice. APY assumes interest remains on deposit until maturity. A withdrawal will reduce earnings. See the full Truth in Savings disclosure at /disclosures/savings for current rates, fees, and terms."
      }
    },
    {
      "@type": "Question",
      "name": "Are deposits FDIC insured?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Example Community Bank is a Member FDIC. Deposits are insured up to $250,000 per depositor, per insured bank, for each account ownership category. Investment products, including mutual funds and stocks, are not deposits, are not FDIC insured, and may lose value."
      }
    },
    {
      "@type": "Question",
      "name": "What is your routing number?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Our ABA routing number is XXXXXXXXX. Verify your routing number on your printed checks or in your online banking account before initiating any transfer."
      }
    }
  ]
}
```

### Compliance notes on FAQPage

- Every rate or APY answer MUST include the variable-rate
  disclosure ("rates are variable and may change at any time
  without notice") or be qualified as "as of the date posted"
  with a link to the live disclosure document.
- The investment-products carve-out language ("not FDIC insured,
  may lose value") is required by federal law on any FDIC
  marketing where investment products are mentioned in
  proximity. Even if your FAQPage doesn't mention investment
  products, including the carve-out preemptively is a compliance
  best practice.
- Do NOT put dollar-specific fee amounts in the FAQ schema if
  the fees can change. Reference the live fee schedule by URL
  instead. ("See current fee schedule at /disclosures/fees.")

## FinancialProduct block (per-product page)

For each product page (savings, checking, CDs, mortgages, SBA).
This is the highest-leverage block for buyer-stage queries.

```json
{
  "@context": "https://schema.org",
  "@type": "FinancialProduct",
  "@id": "https://www.example.com/savings/high-yield-savings#product",
  "name": "High Yield Savings Account",
  "category": "Savings Account",
  "description": "A variable-rate savings account with no monthly maintenance fee, $100 minimum opening deposit, and online and mobile access.",
  "provider": {
    "@id": "https://www.example.com/#organization"
  },
  "url": "https://www.example.com/savings/high-yield-savings",
  "termsOfService": "https://www.example.com/disclosures/savings",
  "feesAndCommissionsSpecification": "https://www.example.com/disclosures/fees",
  "interestRate": {
    "@type": "QuantitativeValue",
    "name": "APY",
    "value": "0.10",
    "unitText": "% APY"
  },
  "isRelatedTo": [
    {
      "@type": "FinancialProduct",
      "name": "Money Market Account",
      "url": "https://www.example.com/savings/money-market"
    }
  ],
  "annualPercentageRate": {
    "@type": "QuantitativeValue",
    "value": "0.10",
    "unitText": "% APY (variable, as of the date posted)"
  }
}
```

### Compliance notes on FinancialProduct

- Always tie `interestRate` and `annualPercentageRate` to the
  live disclosure URL via `termsOfService`. AI engines that cite
  the rate will cite the disclosure URL alongside it, which is
  exactly what compliance wants.
- `feesAndCommissionsSpecification` is a separate URL, not text.
  Keep fee schedules out of the schema body so they can be
  updated without re-deploying schema.
- For mortgages, add `loanTerm` and `loanType` (e.g. "30-year
  fixed conventional", "VA", "FHA"). These get cited heavily
  in "best Hawaii mortgage lender" type queries.

## SBA preferred lender disclosure

If the institution is an SBA Preferred Lender (PLP), this is
worth its own structured block because AI engines surface PLP
status in "best SBA loan Hawaii" queries.

Add to the Organization block:

```json
"hasCredential": [
  {
    "@type": "EducationalOccupationalCredential",
    "credentialCategory": "Government Designation",
    "name": "SBA Preferred Lender",
    "recognizedBy": {
      "@type": "GovernmentOrganization",
      "name": "U.S. Small Business Administration",
      "url": "https://www.sba.gov/"
    }
  }
]
```

### Compliance notes on SBA designation

- Only include this block if the institution is currently a PLP.
  Status is verifiable via SBA.gov. AI engines cross-check.
- If the institution is also a Community Advantage lender or has
  USDA Rural Development authority, add separate
  `hasCredential` entries for each.

## Branch / ATM (LocalBusiness per location)

For multi-branch institutions, deploy a separate LocalBusiness
block per physical location. AI engines use these heavily for
"nearest bank Honolulu" type queries.

```json
{
  "@context": "https://schema.org",
  "@type": "BankOrCreditUnion",
  "@id": "https://www.example.com/branches/bishop-square#branch",
  "name": "Example Community Bank — Bishop Square Branch",
  "branchOf": {
    "@id": "https://www.example.com/#organization"
  },
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "999 Bishop St",
    "addressLocality": "Honolulu",
    "addressRegion": "HI",
    "postalCode": "96813",
    "addressCountry": "US"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "21.3099",
    "longitude": "-157.8581"
  },
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "opens": "08:30",
      "closes": "16:00"
    },
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": "Saturday",
      "opens": "09:00",
      "closes": "13:00"
    }
  ],
  "amenityFeature": [
    {"@type": "LocationFeatureSpecification", "name": "Drive-Through ATM", "value": true},
    {"@type": "LocationFeatureSpecification", "name": "Safe Deposit Boxes", "value": true},
    {"@type": "LocationFeatureSpecification", "name": "Notary Service", "value": true}
  ]
}
```

## What to NEVER put in financial schema

- Specific marketing claims about rates being "the highest" or
  "lowest" — superlative claims require substantiation under
  the FTC Act and CFPB UDAAP rules
- Customer testimonials with specific dollar outcomes ("saved
  $5,000") — triggers endorsement disclosure requirements
- Promotional offers with expiration dates, unless paired with
  a `validThrough` field that the CMS auto-updates
- AggregateRating from third-party review platforms unless
  legally licensed to display them
- ABA routing numbers for accounts that are no longer active

## Customer review / approval workflow

1. NeverRanked drafts the schema using these templates with
   customer-specific values from the audit
2. Customer compliance team reviews against their internal
   regulatory checklist (or against this doc)
3. NeverRanked snippet deploys schema to live site only after
   compliance sign-off in writing
4. NeverRanked weekly tracking confirms schema is parsing
   correctly and being cited
5. Any change to rates, fees, or product terms triggers a
   schema update via the snippet within 24 hours

## Why this is a moat

A vendor pitching a bank with generic schema will lose six weeks
in legal review. A vendor showing up with this template, marked
up against the bank's specific charter type and pre-approved by
the bank's compliance team, can deploy in a week. The compliance
review IS the sales cycle in regulated verticals. Solving it
upfront is the moat.
