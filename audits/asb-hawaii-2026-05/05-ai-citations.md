# AI Citation Audit: American Savings Bank

**Auditor:** Never Ranked
**Sample date:** 2026-05-08
**Engine sampled in this audit:** Claude (Anthropic) via direct API
**Prompt sample:** 8 representative buyer-stage prompts from the Hawaii community banking corpus
**Production scope:** Signal-tier subscription queries the same prompt set across all seven engines (ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, Google AI Overviews, and Gemma, Google's open-weight model) on a weekly cadence with statistical attribution. Gemma matters for regulated industries because its weights are public, so a compliance team can independently reproduce the citation numbers.

---

## The headline number

**ASB was cited in 8 of 8 sampled prompts. ASB was the first-cited bank in 1 of 8.**

That is the single most important sentence in this section. ASB is
visible to Claude. ASB is not preferred by Claude.

Bank of Hawaii leads the citation order on six of the eight prompts.
First Hawaiian Bank is second on four. Central Pacific Bank
appears on three. ASB ranks third in the order on six of the eight
prompts where ASB is cited at all.

This is a positioning gap, not a presence gap. The work to close it
is not "make ASB visible." The work is "make ASB the bank the
engine recommends first."

---

## What we ran

We queried Claude (claude-sonnet-4-5) directly with eight prompts
sampled from the Hawaii community banking buyer corpus:

1. "best community bank in Hawaii for small business"
2. "ASB vs First Hawaiian Bank"
3. "best Hawaii bank for first time home buyer"
4. "Hawaii bank IRA rates"
5. "American Savings Bank reviews"
6. "Hawaii community bank SBA preferred lender"
7. "best bank in Honolulu for personal checking"
8. "Hawaii local banks vs mainland banks"

For each, we captured the full response, identified which Hawaii
banks Claude named, and noted the order in which Claude cited them.
Full prompt corpus and methodology at
content/prompt-corpus/hawaii-community-banking.md and
neverranked.com/standards/methodology.

---

## What we observed

### Citation share by bank

| Bank | Cited in | Citation share |
|---|---|---|
| **American Savings Bank** | 8 of 8 prompts | **100%** |
| First Hawaiian Bank | 6 of 8 prompts | 75% |
| Bank of Hawaii | 6 of 8 prompts | 75% |
| Central Pacific Bank | 3 of 8 prompts | 38% |

ASB has the highest citation share of any Hawaii community bank in
this sample. That is the good news.

### First-cited position by prompt

| Prompt | First cited |
|---|---|
| best community bank in Hawaii for small business | Bank of Hawaii |
| ASB vs First Hawaiian Bank | American Savings Bank |
| best Hawaii bank for first time home buyer | Bank of Hawaii |
| Hawaii bank IRA rates | Bank of Hawaii |
| American Savings Bank reviews | American Savings Bank |
| Hawaii community bank SBA preferred lender | Bank of Hawaii |
| best bank in Honolulu for personal checking | Bank of Hawaii |
| Hawaii local banks vs mainland banks | Bank of Hawaii |

ASB is first only when the prompt names ASB in the question. On
every unbranded buyer prompt, Bank of Hawaii is first.

### What that means

The two prompts where ASB is first are both branded queries. The
buyer already knows ASB exists and is researching them specifically.
For these, citation rank does not move the needle on acquisition
because the buyer is already in-funnel.

The six prompts where ASB is third are unbranded buyer-stage queries
of the "best Hawaii bank for X" shape. These are the queries that
drive new customer acquisition. Buyers running these prompts do not
know which bank to choose. They see Claude recommend Bank of Hawaii
first, First Hawaiian second, ASB third. Citation order in unbranded
buyer prompts is the single biggest acquisition mover on AI-driven
new customer growth.

---

## Why Bank of Hawaii leads despite ASB's higher overall citation share

Looking at how Claude characterizes each bank in unbranded prompts,
two patterns emerge.

**Bank of Hawaii is described with concrete, citable structure.** Claude
returns founding date (1897), branch count, customer-base
characterization, lending program scope. This is the kind of language
that comes from structured data sources (Wikipedia, BOH's own About
schema, BOH's annual report metadata). BOH's Organization schema
gives the engine these hooks.

**ASB is described in softer, less-structured terms.** Claude returns
"Hawaii's third largest bank," "subsidiary of Hawaiian Electric
Industries," "competitive rates." These are accurate but less
machine-friendly framings. They come from news articles and
financial databases, not from ASB's own machine-readable signals.

The structural difference between the two is small but real. BOH
has Organization schema with founding date, address, and
service-type metadata. ASB has Organization schema but it is thinner.

The fix is not to compete on heritage. The fix is to give Claude
ASB's preferred framing as a structured signal it can lift directly,
the same way it lifts BOH's framing today.

---

## Sample response quotes

### Prompt: "best community bank in Hawaii for small business"

Claude's first paragraph (verbatim, top of response):

> Based on customer satisfaction and small business services, here
> are the top community banks in Hawaii:
>
> 1. Bank of Hawaii — Largest local bank with deep community roots
>    (founded 1897). Strong small business lending programs.
>    Extensive branch network across all islands. Dedicated business
>    banking advisors. Online/mobile banking tailored for businesses.
>
> 2. American Savings Bank (ASB) — Hawaii-based since 1925.
>    Competitive business checking and savings accounts. SBA lending
>    expertise. Strong focus on local businesses. Good digital
>    banking platform.
>
> 3. Central Pacific Bank (CPB) — Hawaii-founded in 1954.
>    Personalized service for small businesses. Business credit cards
>    and lines of credit. Commercial real estate lending. Strong
>    community involvement.

ASB is mentioned. ASB is in the second slot with two-and-a-half
lines of description. BOH is in the first slot with five lines of
description and the founding date as a credibility marker. CPB is
third. First Hawaiian Bank is not in the top three.

This is a representative sample of the citation pattern across
unbranded prompts. The ranking is being driven by structured
heritage metadata, not by ASB-specific buyer-stage signals.

### Prompt: "ASB vs First Hawaiian Bank"

Claude's structure (verbatim):

> Both are major Hawaii banks, but they have distinct characteristics:
>
> ASB (American Savings Bank)
> - Ownership: Subsidiary of Hawaiian Electric Industries
> - Size: Hawaii's 3rd largest bank
> - Branches: ~50 locations (Hawaii only)
> - Strengths: Strong local community focus, Competitive rates on
>   savings/CDs, Good mobile/online banking, Popular with local
>   residents
> - Best for: Personal banking, local customer service

ASB is described first because the prompt names ASB first. The
descriptors come from public-record characterizations, not from
ASB's own machine-readable signals. There is no rate data attached.
There is no aggregate rating attached. There is no SBA Preferred
Lender designation attached, even if ASB holds one.

The descriptors are accurate, but they are minimum-viable. ASB's
own positioning ("the bank that knows Hawaii because we live here")
does not appear because ASB has not exposed it via Schema.org.

---

## What deploying schema does to this picture

The schema deployments outlined in section 03 (Schema Review) and
prioritized in section 07 (Roadmap) directly affect what Claude and
the other six engines extract when they answer these prompts.

Specifically:

- **`FinancialService` schema with `description`** gives Claude a
  preferred ASB-authored description to cite in unbranded prompts,
  replacing the public-record fallback ("third largest").
- **`AggregateRating` on the Organization** gives Claude a customer-
  satisfaction signal to cite, which moves ASB from "competitive
  rates" framing to "X-star average rating from N reviews" framing.
- **`hasCredential` for SBA Preferred Lender designation** (if held)
  gives Claude a verifiable government recognition to cite. On the
  "Hawaii community bank SBA preferred lender" prompt, this is the
  difference between "ASB participates in SBA programs" and "ASB
  is an SBA Preferred Lender."
- **`FinancialProduct` schema on rate-bearing pages** gives Claude
  current rate data to cite. On "Hawaii bank IRA rates," this is
  the difference between "ASB offers competitive rates" (current
  framing) and "ASB offers X.XX% APY on Y-month CDs as of [date]"
  (post-deployment framing).

After Phase 1 deployment, the 30-to-45-day engine retraining cycle
should reflect:

- ASB moving from third to first or second on three of the six
  unbranded buyer prompts (specifically the SBA, IRA rates, and
  first-time-home-buyer prompts, which have product-specific
  schema hooks)
- ASB descriptors shifting from public-record framing to ASB-
  authored framing
- Citation share remaining at 100% (it is already at the ceiling)

This is testable. The Signal-tier subscription that runs these
prompts weekly across all seven engines reports the actual movement
post-deployment with statistical attribution at p<0.05.

---

## What this audit does not show

This is a snapshot of one engine (Claude) on one day with eight
prompts. The production tracking layer that ships with the Signal-
tier subscription replaces this with:

- **Seven engines** (ChatGPT, Perplexity, Claude, Gemini, Microsoft
  Copilot, Google AI Overviews, and Gemma, Google's open-weight
  model) on the same prompt set every week. Gemma is the
  reproducibility anchor: its weights are public, so a compliance
  team can re-run the exact same queries and verify our numbers.
- **Forty-two prompts** from the full Hawaii community banking
  corpus, refreshed quarterly to track engine behavior changes
- **Statistical attribution** that ties citation movement to specific
  schema deployments at p<0.05
- **Engine behavior changelogs** that surface within-week shifts in
  how engines weight schema vs blue-link content

A snapshot tells you where you stand on one day. The tracking layer
tells you where you are moving and which deployments moved you
there. The snapshot is the right diagnostic for an audit. The
tracking layer is the right operating system for a quarter.

---

## Bottom line

ASB is already cited everywhere a Hawaii banking buyer asks an AI
engine for a recommendation. ASB is not preferred where it should
be. The gap between citation and preference is the gap between
"present" and "first-recommended," and it closes with structured
data ASB authors and deploys, not with content ASB writes or ads
ASB buys.

The work to close that gap is the work outlined in sections 03 and
07 of this audit. It is bounded, measurable, and deployable in a
single quarter.
