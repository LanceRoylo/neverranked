# Competitor Teardown — American Savings Bank

**Auditor:** Never Ranked
**Sample date:** 2026-05-08
**Competitors analyzed:** First Hawaiian Bank (fhb.com), Bank of Hawaii (boh.com), Central Pacific Bank (cpb.bank)
**Method:** Live scans via check.neverranked.com against the published methodology at neverranked.com/standards/methodology

---

## The headline

ASB is the current AEO leader in Hawaii community banking by a
five-point margin. The three competitors below ASB have each made
exactly one of the same three foundational mistakes, but for
different reasons, and any one of them could leapfrog ASB in a
single deployment cycle. The lead is real and structural. It is
not insurmountable.

The single most actionable observation: the bank that ships
`FAQPage` schema first, on top of the existing FAQ content all four
banks already host, takes citation share on the highest-volume
buyer queries in the category for at least one engine retraining
cycle.

---

## Side-by-side comparison

### Headline numbers

| Bank | AEO Score | Grade | Schema Types Deployed |
|---|---|---|---|
| **American Savings Bank** | **55** | **D** | **Organization** |
| Bank of Hawaii | 50 | D | Organization |
| First Hawaiian Bank | 45 | D | (none) |
| Central Pacific Bank | 25 | F | (none) |

### Homepage technical signals

| Signal | ASB | FHB | BOH | CPB |
|---|---|---|---|---|
| `og:image` deployed | No | No | **Yes** | No |
| H1 count | 2 | 0 | 4 | 8 |
| Word count (homepage) | 1,700 | 1,884 | 1,364 | 1,609 |
| JSON-LD blocks present | 1 | 0 | 1 | 0 |
| Schema types deployed | Organization | (none) | Organization | (none) |

### What each bank is doing right

- **ASB** has Organization schema deployed and passes
  baseline title-tag and canonical hygiene.
- **FHB** has the highest content volume on the homepage (1,884
  words), which means the worst-case AI-engine fallback to plain
  text gives FHB more material to extract. They also have clean
  canonical structure. Their problem is they have nothing else.
- **BOH** is the only Hawaii community bank with `og:image`
  deployed sitewide. Every social share, every Slack paste, every
  AI-engine preview shows the BOH logo. That is the single piece
  of free-money work they have ahead of all three peers.
- **CPB** has the most aggressive content strategy as visible from
  H1 distribution (eight H1 tags on the homepage suggest active
  experimentation, even if it dilutes topical clarity for AI engines).

### What each bank is missing

| Missing schema | ASB | FHB | BOH | CPB |
|---|---|---|---|---|
| WebSite | No | No | No | No |
| BreadcrumbList | No | No | No | No |
| FAQPage | No | No | No | No |
| FinancialService | No | No | No | No |
| AggregateRating | No | No | No | No |
| Article / BlogPosting | No | No | No | No |

Every Hawaii community bank lacks the foundational citation-
attracting schema types. This is the open territory referenced in
the keyword gap section. Whichever bank ships these first wins the
category for the next engine training cycle.

---

## Per-bank teardown

### Bank of Hawaii (boh.com) — score 50, grade D

**What they have:**
- Organization schema with `BankOrCreditUnion` typing
- `og:image` deployed sitewide (the only Hawaii bank with this)
- A jsonld_block on the homepage (Organization type)
- Roughly 33% schema coverage based on yesterday's full audit

**What they are missing:**
- WebSite schema with `SearchAction` (disables sitelinks search box
  in Google AI Overviews)
- AggregateRating schema, despite testimonial language and rating
  text on three sampled pages
- Canonical tags site-wide (the homepage canonicalizes; interior
  pages do not)
- H1 discipline (four H1 tags on the homepage, which dilutes
  topical signal)

**Their fastest path to the lead:** deploy WebSite + AggregateRating
+ canonical hygiene in one sprint. Estimated effort: six hours of
front-end engineering. Estimated lift: +20 to +25 AEO points,
putting them at approximately 70/C and ahead of ASB's current 55.

**Probability they ship this before ASB:** moderate. BOH has the
larger marketing organization. They also have a track record of
slow deployment cycles for technical SEO work, which suggests
quarter-scale lag.

### First Hawaiian Bank (fhb.com) — score 45, grade D

**What they have:**
- Strong content foundation (1,884 words on homepage, the highest
  of the four)
- Clean canonical structure on the pages that have it
- Decent meta-description coverage

**What they are missing:**
- Zero structured data of any kind, on any sampled page
- No `og:image` configured anywhere
- No H1 detected on the homepage (a count of 0 is unusual; either
  the H1 is rendered as styled text without semantic markup, or
  the homepage relies on hero imagery without an accessibility
  fallback)

**Their fastest path to the lead:** the highest ceiling of the
three competitors. From 45 to 80+ in one cycle is achievable
because they start from zero and the deployment work compounds.
Phase 1 deployment (Organization, WebSite, BreadcrumbList,
FinancialService, FAQPage, og:image) would lift them to approximately
80/B in thirty days.

**Probability they ship this before ASB:** low to moderate. FHB
has not made AEO-aware deployment a priority through Q1 2026
based on visible scan history. Inertia favors ASB if ASB moves
first.

### Central Pacific Bank (cpb.bank) — score 25, grade F

**What they have:**
- A modern domain (cpb.bank, deployed on the new financial-services
  TLD)
- Active content marketing visible in homepage word count
- A clear "We Got You" brand position

**What they are missing:**
- Zero structured data
- Zero canonical tags
- Zero meta description on the homepage
- Eight competing H1 tags on the homepage (the worst H1 discipline
  of the four)
- 34 of 56 images missing alt text (60% of homepage imagery
  unattributed)
- No `og:image`

**Their fastest path to the lead:** longest. CPB needs to fix the
foundational HTML hygiene before schema deployment matters. The
work is not complex but it is multiple parallel workstreams. From
25 to 50 in one cycle is achievable. From 50 to ASB's current 55
takes another cycle. Realistic: two quarters to reach ASB's current
position assuming aggressive prioritization.

**Probability they ship this before ASB:** very low. CPB is the
furthest behind and the work is the most dispersed across surfaces.

---

## What ASB needs to do to widen the lead

The competitive picture argues for ASB to deploy aggressively
within the next thirty days. The window is narrow but real.

### Deploy in the next 30 days (Phase 1)

These are the deployments that lock the category lead before any
of the three competitors can mount a response.

1. **`FAQPage` schema on the Common Questions page.** The single
   highest-leverage move on the entire site. ASB's existing
   10,923-word FAQ content becomes machine-readable in one
   deployment. None of the other three Hawaii banks have this.
2. **`WebSite` schema with `SearchAction`.** Enables the sitelinks
   search box in Google AI Overviews. None of the other three
   Hawaii banks have this.
3. **`og:image` deployed sitewide.** Closes BOH's only structural
   advantage and gives every social share a branded preview.
4. **`BankOrCreditUnion` schema variants on the four highest-traffic
   product pages** (personal checking, savings, mortgages, business
   banking). Adds machine-readable category signals AI engines use
   to disambiguate.
5. **`AggregateRating`** on the homepage, sourced from existing
   customer testimonial language already on the site.

### Deploy in days 31-60 (Phase 2)

These widen the moat once Phase 1 is in production.

6. **`FinancialProduct` schema on every rate-bearing page** with
   `interestRate.value` bound to the live disclosure URL
7. **`MortgageLoan` schema on the mortgages landing page** with
   `loanType` and `loanTerm` arrays
8. **`hasCredential` block on Organization** for every government
   designation ASB holds (SBA, USDA, etc.)
9. **`LocalBusiness` blocks per branch** with `geo` and
   `openingHoursSpecification`
10. Optional: `llms.txt` published at the root with a curated map
    of ASB's most citable pages (this is the next-standard signal
    AI engines are starting to weight; see standards/llms-txt for
    the methodology)

---

## What this competitive picture is worth in real terms

If ASB ships Phase 1 in thirty days and Phase 2 in sixty, ASB's
AEO score lifts to approximately 85/B, ahead of all three Hawaii
competitors by a margin none of them can close in a single cycle.
Citation share on the twelve sampled prompts in Section 4 should
materially improve as engines retrain on the new structured data
(typical retraining window: thirty to forty-five days post-
deployment, observed across all six engines NeverRanked tracks).

The Signal-tier subscription that ships these deployments and
tracks the resulting citation movement runs $2,000/month with a
three-month minimum. The total cost of locking the Hawaii
community banking AEO category for the remainder of 2026 is
$6,000. The opportunity cost of not shipping is the category
flipping to whichever of the three competitors moves first, at
which point the same work costs ASB twelve months of catch-up
instead of ninety days of leadership.

This is not a rate-of-return calculation. It is a window-of-
opportunity calculation. The window is open now. By Q1 2027 it
will not be.
