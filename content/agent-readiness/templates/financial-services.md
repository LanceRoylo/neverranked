# Agent-Ready Schema for US Financial Services

The most consequential agent task surface for banks, credit unions,
and wealth advisors is the *application*. Account opening, loan
application, credit card application, mortgage pre-qualification.
Sites that expose these as structured `ApplyAction` blocks will
capture the agent-driven application volume; sites that do not will
lose share to whoever did.

This document is the canonical NeverRanked template set for agent-
readiness on US financial sites.

## ApplyAction — account opening

Goes on the dedicated account-opening page (e.g. `/personal/checking/open`).

```json
{
  "@context": "https://schema.org",
  "@type": "ApplyAction",
  "name": "Open a Personal Checking Account",
  "description": "Apply online for a personal checking account. Funded in 1-3 business days. Member FDIC.",
  "target": {
    "@type": "EntryPoint",
    "urlTemplate": "https://www.example.com/personal/checking/open?source=agent",
    "actionPlatform": [
      "https://schema.org/DesktopWebPlatform",
      "https://schema.org/MobileWebPlatform"
    ],
    "httpMethod": "GET",
    "contentType": "text/html",
    "encodingType": "application/x-www-form-urlencoded"
  },
  "object": {
    "@type": "BankAccount",
    "name": "Personal Checking Account",
    "accountMinimumInflow": {
      "@type": "MonetaryAmount",
      "value": 100,
      "currency": "USD"
    }
  },
  "potentialAction": {
    "@type": "ProvideAction",
    "name": "Provide identity verification",
    "object": [
      { "@type": "Person", "@id": "#applicant" }
    ]
  },
  "result": {
    "@type": "BankAccount",
    "name": "Funded checking account, member FDIC"
  },
  "agent": {
    "@type": "Person",
    "description": "Applicant must be at least 18 years old and a US resident with a valid SSN or ITIN."
  }
}
```

### Compliance notes on ApplyAction

- **Identity verification is required for account opening.** The
  schema cannot promise that an agent can complete the application
  end-to-end without a human-in-the-loop step (KYC, OFAC, CIP). The
  `potentialAction` field signals the verification gate.
- **State licensing.** If the institution can only accept applicants
  in certain states, the EntryPoint should expose `eligibleRegion`
  with the licensed states. Agents in unlicensed states will skip the
  action.
- **Disclosure linking.** The application page itself must link to
  Truth in Savings, Truth in Lending, Privacy Policy, and the patriot
  act customer identification notice. Agent flows must surface these
  to the user before submission.

## ApplyAction — loan / mortgage pre-qualification

Goes on the dedicated pre-qualification page.

```json
{
  "@context": "https://schema.org",
  "@type": "ApplyAction",
  "name": "Mortgage Pre-Qualification",
  "description": "Get pre-qualified for a mortgage. Soft pull only. No impact to credit score. NMLS-licensed loan officers respond within one business day.",
  "target": {
    "@type": "EntryPoint",
    "urlTemplate": "https://www.example.com/mortgages/prequalify?source=agent",
    "httpMethod": "GET",
    "contentType": "text/html"
  },
  "object": {
    "@type": "MortgageLoan",
    "loanTerm": [
      {
        "@type": "QuantitativeValue",
        "value": 15,
        "unitText": "year"
      },
      {
        "@type": "QuantitativeValue",
        "value": 30,
        "unitText": "year"
      }
    ],
    "loanType": ["Conventional", "FHA", "VA", "USDA"]
  },
  "result": {
    "@type": "LoanOrCredit",
    "name": "Pre-qualification letter"
  }
}
```

## ContactAction — speak with an advisor

Goes on the contact page or the wealth-advisory landing page.

```json
{
  "@context": "https://schema.org",
  "@type": "ContactAction",
  "name": "Speak with a Wealth Advisor",
  "description": "Schedule a 30-minute consultation with a CFP-certified advisor. No fee for the initial conversation.",
  "target": {
    "@type": "EntryPoint",
    "urlTemplate": "https://www.example.com/wealth/schedule?source=agent",
    "httpMethod": "GET"
  },
  "object": {
    "@type": "Service",
    "name": "Initial wealth advisory consultation"
  },
  "result": {
    "@type": "Reservation",
    "reservationStatus": "Pending"
  }
}
```

## ReserveAction — branch visit appointment

For banks with appointment-required branch services (notary, safe
deposit, complex transactions).

```json
{
  "@context": "https://schema.org",
  "@type": "ReserveAction",
  "name": "Reserve a Branch Appointment",
  "description": "Book a 30-minute appointment at any branch for notary, safe deposit, or complex transactions.",
  "target": {
    "@type": "EntryPoint",
    "urlTemplate": "https://www.example.com/branches/appointment?source=agent",
    "httpMethod": "GET"
  },
  "object": {
    "@type": "Service",
    "provider": {
      "@id": "https://www.example.com/#organization"
    }
  },
  "result": {
    "@type": "Reservation",
    "reservationStatus": "Pending"
  }
}
```

## What to NEVER expose as agent actions

- **Wire transfers, ACH transfers, or any irrevocable money
  movement.** The fraud surface is too large. Banks should require
  a logged-in session with an authenticated user before any movement
  of funds; an unauthenticated `Action` schema invites abuse.
- **Investment trading actions.** Agents executing trades on behalf
  of users without explicit per-trade consent is regulated by SEC
  Rule 15c3-5 and is not safe to ship.
- **Account closure actions.** Same fraud surface as wire transfer.
  Closure must require authenticated session + identity confirmation.
- **Loan or credit-decisioning actions that issue a hard pull.**
  Agents cannot meaningfully consent to a hard pull on the user's
  behalf today. The action schema can promise *pre-qualification*
  (soft pull only) but not *application submission* without an
  intermediate consent step.

## Customer review / approval workflow

1. NeverRanked drafts the agent-readiness schema using these templates
   with customer-specific values and endpoints
2. Customer engineering team confirms the target URLs are real,
   reachable, and respect the agent-friendly query parameters
3. Customer compliance team reviews against their internal
   regulatory checklist (or against this doc)
4. NeverRanked snippet deploys schema to live site after sign-off
5. NeverRanked weekly tracking confirms the schema parses, validates,
   and is being read by the agent crawlers we observe (currently
   ChatGPT-User and Anthropic-Claude-User as of May 2026)

## Why this is a moat

Generic AEO tools are not yet shipping agent-readiness work. The
Schema.org Action vocabulary is documented but rarely audited. A
customer who deploys these templates in 2026 with a NeverRanked-
shaped audit trail will be referenceable in two ways no competitor
can match:

1. They were *first* in their category to be agent-ready
2. The templates pass compliance review on day one because we wrote
   them to anticipate it
