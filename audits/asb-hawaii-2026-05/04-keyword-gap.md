# Keyword & Intent Gap Analysis: American Savings Bank

**Auditor:** Never Ranked
**Sample date:** 2026-05-08
**Method:** Hawaii community banking prompt corpus (42 buyer-stage prompts) cross-referenced with current scan data and competitor positioning

---

## The headline

ASB's site has the content to rank for the queries Hawaii community
banking buyers are running on AI engines today. The structural gap
is not editorial. The site says the right things in the right tone
on the right pages. What it is missing is the machine-readable layer
that lets ChatGPT, Perplexity, Claude, Gemini, Copilot, and Google
AI Overviews extract those answers and cite them.

In keyword terms, ASB ranks because Google's blue-link index reads
the words on the page. ASB does not get cited by AI engines because
those engines read structured data first, fall back to content
second. ASB has the content. Schema is what closes the gap.

**Keyword grade: B** (strong content, weak machine-readability).

---

## How Hawaii community banking buyers search now

NeverRanked maintains a 42-prompt corpus of the queries Hawaii
community banking customers actually run on AI engines. The corpus
is grouped by buyer stage (awareness, consideration, decision) and
intent type (informational, comparison, location, branded, product-
specific, values-driven). Full corpus at
content/prompt-corpus/hawaii-community-banking.md.

For this audit, we sampled twelve prompts representing the highest-
volume and highest-intent slices:

### Broad informational

- "best community bank in Hawaii"
- "best small business bank Hawaii"
- "Hawaii bank with no monthly fees"
- "Hawaii local banks vs mainland banks"

### Location-specific

- "best bank in Kakaako"
- "ATM locator Big Island"

### Comparison (branded)

- "ASB vs First Hawaiian Bank"
- "American Savings Bank reviews"

### Product-specific

- "Hawaii bank IRA rates"
- "best Hawaii bank for first time home buyer"

### Values-driven

- "Hawaii community bank SBA preferred lender"
- "Hawaii bank that supports small business locally"

These are the queries where ASB's content is most relevant. They
are also, on inspection, the queries where ASB is least visible in
the structured data layer that determines AI citation eligibility.

---

## Where ASB ranks vs where ASB should rank

ASB's content depth is real. The site averages 2,400 words per page.
Title tags are well-optimized on 8 of 10 sampled pages. The
Common Questions page carries 10,923 words of Q&A content. Internal
linking density is high (244 internal links per page). Canonicals
are correct on all 10 sampled pages.

This is a content-rich site. In a blue-link-search world, this is
the work that wins. In an AI-engine-citation world, it is the work
that goes unread because the AI engines never get the structured
hooks they need to extract and attribute the content.

Three concrete examples of the gap:

### "Hawaii bank IRA rates"

ASB has IRA product pages with rates, terms, and the required Truth
in Savings disclosures. The page reads correctly. But because it
lacks `FinancialProduct` schema with the `interestRate` field bound
to the live disclosure, AI engines querying "Hawaii bank IRA rates"
have no machine-readable rate to cite. Bank of Hawaii, which also
lacks this schema, has the same problem. First Hawaiian Bank,
likewise. The first community bank in Hawaii to deploy
`FinancialProduct` schema with rate fields takes citation share on
this query for the duration of the rate cycle.

### "best Hawaii bank for first time home buyer"

ASB has a residential mortgage product line covering conventional,
FHA, and VA loans. The mortgage page describes the products. It
does not expose `MortgageLoan` schema with `loanType` arrays. AI
engines answering "best Hawaii bank for first time home buyer" have
no machine-readable signal that ASB lends across the product types
a first-time buyer would need. Engines fall back to whatever blog
content they can extract, which puts ASB on equal footing with
mortgage brokers and aggregator sites that have less local
authority.

### "Hawaii community bank SBA preferred lender"

If ASB is a Small Business Administration Preferred Lender (verify
via SBA.gov), this should be exposed via the
`hasCredential / EducationalOccupationalCredential` pattern with a
`recognizedBy` reference to the SBA. Right now the credential is
not machine-readable, so AI engines querying for SBA Preferred
Lenders in Hawaii cannot reliably surface ASB even when ASB is in
fact preferred.

---

## What gets fixed in Phase 1

Each of the three queries above has a specific schema deployment
that closes the citation gap. Each fix is between thirty minutes
and two hours of front-end engineering work. None require new
content. None require copy changes. None require legal or
compliance review beyond the standard disclosure language already
on the underlying pages.

The ranked list:

1. `FinancialProduct` schema on the rate-bearing pages (savings
   APYs, CD rates, mortgage rates, HELOC rates) with
   `interestRate.value` bound to the live disclosure URL
2. `MortgageLoan` schema on the mortgages landing page with
   `loanType` and `loanTerm` arrays
3. `hasCredential` block on the Organization schema for any
   government designations ASB holds (SBA Preferred Lender, USDA
   Rural Development authority)
4. `FAQPage` schema on the Common Questions page (the highest
   single-page impact on the site, given the existing 10,923
   words of Q&A content)
5. `BankOrCreditUnion` `LocalBusiness` blocks on each branch page
   with `geo` and `openingHoursSpecification` for the "ATM locator"
   and "best bank in Kakaako" type location-specific queries

After Phase 1, ASB is competing on machine-readability against the
other three Hawaii banks. We expect ASB's AEO score to move from
55 to 80+ in one cycle and citation share on the twelve sampled
prompts to materially improve within thirty to forty-five days
(the AI engine retraining cycle).

---

## Why this matters now

The Hawaii community banking AEO category is open territory.
Across all four major banks, deployed schema is shallow. As of
2026-05-08, NeverRanked's live scans show:

| Bank | AEO Score | Schema Types Deployed |
|---|---|---|
| American Savings Bank | 55 | Organization |
| Bank of Hawaii | 50 | Organization |
| First Hawaiian Bank | 45 | (none) |
| Central Pacific Bank | 25 | (none) |

ASB is leading by five points. The lead is real. The lead is also
narrow enough that any of the three banks behind ASB could close
the gap with one Phase 1 deployment cycle. The window to lock the
category leader position is a single quarter, not a year.

---

## What the production tracking layer adds

This audit is a snapshot of ASB's keyword and intent gap on a
single day. The Signal-tier subscription replaces the snapshot with
a weekly pull across all seven AI engines on the full forty-two-prompt
corpus. The weekly pull captures the actual citations engines are
making, attributes deployment changes to citation movement at p<0.05
statistical significance, and surfaces engine behavior changes
within the same week they happen.

A snapshot tells you where you are. The tracking layer tells you
where you are going and which deployments moved you there.
