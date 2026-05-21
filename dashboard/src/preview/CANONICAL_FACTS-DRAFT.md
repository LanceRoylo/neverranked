# CANONICAL_FACTS — draft, ready for review before the grader rewrite

Drafted 2026-05-20 alongside the lockdown of the existing
`gradeProspectOutput` and `generatePreview` functions. This file is
the source of truth for the eventual rewrite. Until the grader and
generator are rewritten against this list, both throw on invocation.

## Why this file exists

The old `CANONICAL_FACTS` block enforced "Hawaii Theatre score went
from 45 to 95 in ten days" as a fact the grader *required* every
generated artifact to honor. That claim implied schema-injection
caused the citation lift, which we tested and could not
substantiate. Re-enabling the grader against the old facts would
have shipped the retracted claim into every prospect inbox.

The new fact list below is shorter on purpose. Every line is
defensible to a hostile reader. Anything that is not on this list
is forbidden in generated content.

## Permitted facts (the only customer/result claims allowed)

### About the company
- NeverRanked is a research engagement that measures what AI answer
  engines cite for a category. Output is a forensic memo plus a
  prepped punch list for the team executing.
- Based in Hawaii. Founder-led. Bootstrapped. Profitable on first
  paying customer by design.
- Until May 2026, NeverRanked sold a JavaScript snippet that was
  claimed to drive AI citations. A pre-registered kill test against
  our own domain returned zero citations. We retracted the product
  and rebuilt the company around the measurement layer. This
  retraction may be referenced in any artifact. It is a strength, not
  a weakness.

### About what we measure
- We watch seven AI surfaces every day. Five citation-grade engines
  that search the live web (Perplexity, ChatGPT search, Gemini
  grounded, Microsoft Copilot via Bing, Google AI Overviews). Two
  model-knowledge engines that answer purely from training data
  (Claude, Gemma).
- Permitted phrasing for the layered claim:
  - "Five engines that search the live web and cite their sources,
    plus two engines that answer from model knowledge alone."
  - "Citation-grade and model-knowledge layers across seven surfaces."
- Forbidden phrasing: any unqualified "seven engines" without the
  5+2 split visible nearby.

### About what we deliver
- Forensic readout. Per query, per engine, per competitor, per
  source type.
- Prepped punch list ordered by impact.
- Daily measurement. Monthly delta memo on ongoing engagements.
- Source-type analysis using the classifier in `dryrun/forensic/
  classify.mjs` (YouTube, Reddit, Wikipedia, forum, social,
  review_directory, owned, competitor, independent_web).

### About pricing
- $4,500 kickoff per category. One time. Includes query set design,
  three weeks of daily measurement, competitive cohort analysis,
  source-type analysis, the research memo, and the prepped punch
  list.
- $1,500 per month per category, ongoing. Continued daily
  measurement, monthly delta memo, drift monitoring, punch list
  refreshes.
- Per category, not per client.
- Forbidden: any reference to "Pulse," "Signal," "Amplify," "$497,"
  "$2,000/mo," "$750 audit," or any prior pricing tier or audit
  credit flow.

### About the boundary
- We measure. We do not execute. No content writing, no website
  edits, no schema deploys, no profile updates. The labor stays with
  the customer's team or their agency.
- Permitted phrasing for the boundary:
  - "We measure. Your team executes."
  - "Force multiplier for the agency, not a competitor for their
    hours."
  - "We diagnose and prep the punch list. The execution stays yours."

### About security and data
- The research engagement does not require access to customer
  systems. No code on customer property. No data flowing from the
  customer side. We observe public AI engines from outside.
- This is a research engagement, not a software install. Customer's
  security review surface is an NDA and a vendor intake form, not a
  SOC 2 audit.

### About the named customer reference
- Hawaii Theatre Center is one named customer reference we may
  cite. The work surfaces we may describe:
  - We surfaced an expired Charity Navigator profile (last updated
    2023).
  - We surfaced a BBB profile last updated 1999.
  - We surfaced misconfigured authority backlinks to trusted
    institutions.
  - We surfaced the absence of a Bing Business Profile.
  - We collaborated on meta description rewrites.
- Forbidden HTC claims:
  - We did NOT cause the 45-to-95 AEO score jump in any causal
    sense that can be substantiated. The score jump measured DOM
    presence of schema, which LLM crawlers do not execute. Do not
    cite this as evidence of our work.
  - We did NOT cause Hawaii Theatre to be cited by Perplexity for
    14 of 19 queries. That citation behavior pre-existed and is
    authority-driven, not snippet-driven.
  - Do not use HTC as a "before and after" or "score lift" example.
- The HTC reference, when used, is a *capability* example: "we find
  things normal scans miss," not a *causation* example.

### About the data moat
- We aggregate patterns across categories. The Nth customer in a
  category gets told "we have observed N-1 prior readouts in your
  category, here are the source patterns that hold."
- Pattern claims require >=3 runs in the category (the moat
  discipline in `dryrun/forensic/MOAT.md`).
- Aggregate-level claims may name a category. Customer-specific
  claims may never name a competitor's data or another customer's
  data.

## Forbidden facts (will be rejected by the grader)

1. Any claim that schema deployment, snippet installation, or any
   on-page change causes AI citations to increase.
2. The "45 to 95 in ten days" framing as evidence of NeverRanked's
   work.
3. Specific citation lift predictions ("we'll get you to X% citation
   share in Y days").
4. Any named customer other than Hawaii Theatre Center.
5. Reference to "Pulse," "Signal," "Amplify," or "Enterprise" as
   active products.
6. Reference to a "$750 audit" or "audit credit toward first month."
7. Reference to an agency reseller / wholesale program ("$800/mo per
   Signal slot," "Founding Partner Terms," etc.).
8. Reference to a snippet, JavaScript injection, or schema
   auto-deploy as an active product.
9. The phrase "We DEPLOY THE FIX" or any variant claiming we do the
   execution work.
10. Claims about AI engines we do not actually measure.

## Template fragments the generator may use

When the generator is rewritten, these are sentence fragments the
new prompt can lean on. Each one is graded-allowed as written.

- "We previously sold a snippet that we claimed drove AI citations.
  We tested it and could not substantiate the claim. We stopped
  selling it and rebuilt the company around the measurement layer
  that does work."
- "We watch seven AI surfaces every day. Five citation-grade engines
  that search the live web, plus two model-knowledge engines."
- "The output is a research memo, not a dashboard. Per query, per
  engine, per competitor, per source type."
- "We diagnose. Your team executes. We do not touch the work."
- "$4,500 kickoff per category. $1,500 per month ongoing."
- "This isn't a security review project. We observe public AI
  engines from outside. No code on your property, no data flowing
  in from your side."
- "The kinds of gaps we surface are the ones a standard SEO scan
  misses. Stale third-party profiles, dead authority backlinks,
  absent directory presence, misconfigured entity references."

## When this file changes

- Any new permitted fact requires a substantiation pointer (the run
  that produced the data, the customer that approved the reference,
  the document that locks the claim).
- Removing a forbidden fact requires the same.
- The grader rewrite will load the permitted/forbidden lists from
  this file or a derived const. The lists in this file are the
  source of truth.

## What needs to happen next

1. Lance reviews this file in daylight and modifies what feels off.
2. The lists here are converted into TypeScript consts and pasted
   into the relevant grader files (both `dashboard/src/preview/
   output-grader.ts` and `neverranked-outreach/worker/src/output-
   grader.ts`).
3. The generator prompts are rewritten to reference the permitted
   sentence fragments and explicitly avoid the forbidden ones.
4. The throw guards in the locked files are removed.
5. End-to-end test: generate a sample preview, run it through the
   grader, verify pass.
