# Security Policy

Full details, including exactly what our schema snippet does, exactly which CMS endpoints we touch, and exactly what we do not touch, are published at:

**https://neverranked.com/security/**

That page is the source of truth and is updated alongside the codebase.

## Reporting a vulnerability

Email **security@neverranked.com** with reproduction details.

We commit to:

- A real human reply within **48 hours**
- A fix or mitigation timeline within **7 days** for any verified issue
- Public credit on the security page (with your permission) for responsible disclosure

We do not currently run a paid bug bounty program.

## Verifying our security claims

The codebase is public and source-available under the license at [`LICENSE`](./LICENSE). Specific files referenced on https://neverranked.com/security/:

- [`dashboard/src/routes/inject.ts`](./dashboard/src/routes/inject.ts) — the schema injection snippet generator
- [`dashboard/src/cms/drivers/`](./dashboard/src/cms/drivers/) — WordPress, Webflow, Shopify drivers
- [`packages/aeo-analyzer/src/schema-grader.ts`](./packages/aeo-analyzer/src/schema-grader.ts) — schema completeness grader
- [`dashboard/src/auth.ts`](./dashboard/src/auth.ts) — magic-link issuance, sessions, rate limiting
- [`dashboard/src/routes/checkout.ts`](./dashboard/src/routes/checkout.ts) — Stripe webhook handler

If a security claim on https://neverranked.com/security/ does not match what the code does, we treat that as a bug. Open an issue or email the address above.
