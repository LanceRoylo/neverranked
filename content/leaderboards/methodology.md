# NeverRanked AEO Score Methodology

The AEO Score is a 0-100 rating of how citable a website is to
the six AI engines that now answer most informational queries:
ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, and
Google AI Overviews.

The score is computed from publicly observable signals on the
homepage and the most-linked interior pages. No private data,
no scraping behind paywalls, no proprietary feeds.

## What gets scored

The score is the weighted combination of five components.

### 1. Schema coverage (40 points)

Presence and correctness of structured-data types AI engines read
when they pick sources to cite.

- Organization or LocalBusiness — entity disambiguation (8 points)
- WebSite with SearchAction — sitelinks search box (4 points)
- BreadcrumbList — navigation context (4 points)
- FAQPage — direct citation feed for question-style queries (8 points)
- A category-appropriate primary type — FinancialService,
  RealEstateAgent, MedicalOrganization, etc. (8 points)
- AggregateRating or Review — social proof signal (4 points)
- Article, BlogPosting, or HowTo on content pages (4 points)

A type counts as "present" only if the JSON-LD parses, validates
against schema.org, and contains required properties. Stub schema
with missing required fields scores zero.

### 2. Social preview readiness (15 points)

og:image, og:title, og:description on every public-facing page.
Missing on any sampled page is a partial deduction. Sites without
any og:image site-wide score zero on this component, regardless
of other signals.

### 3. Heading and canonical hygiene (15 points)

- Single H1 per page (5 points)
- Canonical tag present and self-referential where appropriate
  (5 points)
- Descriptive title and meta description (5 points)

### 4. Citation observation (20 points)

The site is queried against a category-specific prompt set on
all six engines. Each cited mention counts toward the score.
Sites with zero observed citations across the prompt set score
zero on this component, regardless of how strong their schema is.

### 5. Content depth signal (10 points)

Word count and topical depth of homepage and primary service
pages. Sites with under 300 words on the homepage score zero on
this component. Sites with 1500+ words and clear topical
organization score full marks.

## How sampling works

We sample 10 pages per site by default: the homepage, the most
internally linked navigation pages, and the most-linked interior
pages discovered by crawl. Sites with fewer than 10 unique pages
are scored on what exists.

## How often scores update

Weekly. Every Sunday at 02:00 UTC the prompt set runs and the
schema scan re-runs. Scores published Monday morning Hawaii time.

## What changes a score

- Deploying new schema types correctly: typically 4-8 point lift
  per type, observed within one weekly update.
- Removing a schema type that was scoring zero (because of stub
  fields): zero impact on score, but improves citation share
  because partial schema actively penalizes citation eligibility
  per the 730-citation Search Engine Land study.
- A competitor outranks you on a contested query: their citation
  observation score goes up, yours stays the same. Citation share
  is a relative measure even though the AEO score is absolute.

## What does NOT change the score

- Domain Authority, Page Rank, or any backlink metric. AI engines
  weight schema and content over link graph for citation choice.
- Site speed beyond a basic-loadability threshold. Slow sites
  are still cited if their schema is right.
- Mobile rendering (assumed; sites that fail mobile load entirely
  are excluded from the leaderboard).

## Independence

NeverRanked computes these scores using the same engine that runs
at check.neverranked.com. Anyone can independently verify a score
by running their domain through the public scan tool.

## Errata and disputes

If a site disputes its score, we re-scan within 24 hours and
publish the second scan publicly alongside the first. Scores
that move more than 5 points between scans get manual review
and either a corrected number or a temporary "review pending"
flag.

## What the score does NOT claim

The AEO Score does not predict revenue, conversion, brand value,
customer satisfaction, or financial fitness. It is a measurement
of one specific thing: whether AI engines have the structured
signals they need to cite the site. Sites with low scores often
have excellent businesses underneath. The score measures the
machine-readable layer, not the business.
