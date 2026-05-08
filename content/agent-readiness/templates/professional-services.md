# Agent-Ready Schema for Professional Services

The agent task surfaces that matter for law firms, accounting practices,
medical practices, and consultancies are *consultation booking* and
*contact*. Agents that need to schedule a discovery call, request a
quote, or initiate a client engagement will reward sites that expose
these as structured actions.

## ReserveAction — discovery call / consultation

Goes on the engagement landing page or contact page.

```json
{
  "@context": "https://schema.org",
  "@type": "ReserveAction",
  "name": "Schedule a Free Consultation",
  "description": "30-minute consultation with a partner. No fee for the initial conversation. Held same-day or next-business-day in most cases.",
  "target": {
    "@type": "EntryPoint",
    "urlTemplate": "https://www.example-firm.com/schedule?practiceArea={practiceArea}&date={date}&time={time}&source=agent",
    "httpMethod": "GET"
  },
  "query-input": [
    {
      "@type": "PropertyValueSpecification",
      "valueName": "practiceArea",
      "valueRequired": false,
      "valueName": "estate-planning|business-formation|real-estate|litigation|family-law"
    },
    {
      "@type": "PropertyValueSpecification",
      "valueName": "date",
      "valueRequired": true,
      "valuePattern": "\\d{4}-\\d{2}-\\d{2}"
    },
    {
      "@type": "PropertyValueSpecification",
      "valueName": "time",
      "valueRequired": true,
      "valuePattern": "\\d{2}:\\d{2}"
    }
  ],
  "object": {
    "@type": "LegalService",
    "@id": "https://www.example-firm.com/#organization"
  },
  "result": {
    "@type": "Reservation",
    "reservationStatus": "Pending"
  }
}
```

## ContactAction — request a quote

Goes on the relevant practice page.

```json
{
  "@context": "https://schema.org",
  "@type": "ContactAction",
  "name": "Request a Quote",
  "description": "Tell us about the matter and we will respond within one business day with a flat-fee or hourly estimate.",
  "target": {
    "@type": "EntryPoint",
    "urlTemplate": "https://www.example-firm.com/quote?matter={matterType}&urgency={urgency}&source=agent",
    "httpMethod": "GET"
  },
  "query-input": [
    {
      "@type": "PropertyValueSpecification",
      "valueName": "matterType",
      "valueRequired": true
    },
    {
      "@type": "PropertyValueSpecification",
      "valueName": "urgency",
      "valueRequired": false,
      "valueName": "routine|expedited|emergency"
    }
  ]
}
```

## What to NEVER expose

- **Anything that could constitute legal advice through an automated
  channel.** ReserveAction for a consultation is fine. AskAction that
  promises an answer to a legal question is not — the bar association
  rules in most states prohibit unauthorized practice of law via
  automated systems.
- **Privileged-information collection.** The schema target URL must
  not collect attorney-client privileged details before an engagement
  letter is signed. The intake form on that page should be careful
  about what it asks.
- **Specific outcome predictions.** "We win 95% of cases" type claims
  in the schema (or anywhere) trigger marketing rule violations under
  most state bars.

## Practice-area specific patterns

### Medical practices

ReserveAction for *appointment scheduling* is appropriate. Do NOT
expose any action that involves prescription refill, lab order, or
clinical advice via agent. These require provider-patient relationship
and direct authentication.

### Accounting / tax

ContactAction for *engagement intake* is appropriate. Do NOT expose
any action that involves tax filing on the user's behalf without an
authenticated session and signed engagement letter — IRS Circular 230
and state CPA rules govern this strictly.

### Management consulting

Both ReserveAction (for discovery call) and ContactAction (for
proposal request) work well. No regulatory restrictions specific to
agent flows beyond standard consumer protection.

## Customer review / approval workflow

Same as the financial services and hospitality templates. Three
sign-offs:

1. Engineering — target URLs work and accept the parameters
2. Compliance — the action does not exceed what your professional
   license permits
3. Marketing — the action is consistent with how you want agents to
   represent your firm

## Why this is a moat

Professional services categories are slow to adopt new schema. Most
firms are still on year-old templates that lack basic Organization
schema, let alone Action surfaces. A firm that ships agent-readiness
in 2026 is positioning before any of their direct competitors —
typically by 12+ months.
