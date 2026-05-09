---
category: Hawaii community banking
status: "INTERNAL: not published"
data_collected: 2026-05-07
methodology: /leaderboards/methodology
next_update: weekly Mondays once published
---

# Hawaii Community Banking AEO Leaderboard

**As of May 7, 2026.** Live scores pulled from
check.neverranked.com using the methodology at
[methodology.md](methodology.md). Scores are reproducible.
anyone can run a domain through the public scan tool and verify.

## Current rankings

| Rank | Bank | AEO Score | Grade | Schema Types Present |
|---|---|---|---|---|
| 1 | American Savings Bank | 55 | D | Organization |
| 2 | Bank of Hawaii | 50 | D | Organization |
| 3 | First Hawaiian Bank | 45 | D | (none detected) |
| 4 | Central Pacific Bank | 25 | F | (none detected) |

## What the rankings mean

All four banks are in the bottom half of the AEO scale. The
Hawaii community banking category is materially under-served by
structured data, which means the citation surface is wide open
for whichever bank moves first.

The leader (ASB) is leading by a thin margin of 5 points over
BOH, 10 over FHB. That gap closes or widens entirely on the
next deployment. A single bank that shipped Organization +
WebSite + FinancialService + FAQPage schema in one cycle would
jump 25 points and take the category lead by an unrecoverable
margin.

## Per-bank notes

### #1 American Savings Bank: score 55, grade D

- Has Organization schema (rare in this category)
- Missing: WebSite, BreadcrumbList, FAQPage, FinancialService
- Has a 10,923-word Common Questions page with no FAQPage schema
- Zero pages have og:image deployed
- Total estimated lift available from one Phase 1 deployment: 25 points → grade B

### #2 Bank of Hawaii: score 50, grade D

- Has Organization schema and BankOrCreditUnion service blocks
- Missing: WebSite, AggregateRating, canonical tags site-wide
- Schema coverage 33%
- 3 pages have testimonial language with no AggregateRating schema
- Total estimated lift available: 22 points → grade B

### #3 First Hawaiian Bank: score 45, grade D

- Zero structured data deployed across all sampled pages
- Strong content foundation, clean H1 structure on 8 of 10 pages
- Highest ceiling. Full Phase 1 deployment would lift to grade B+ (estimated +35)

### #4 Central Pacific Bank: score 25, grade F

- Zero structured data, zero canonicals, no meta descriptions
- 8 competing H1 tags on the homepage
- 34 of 56 images missing alt text
- Largest gap to close, largest potential gain. Grade C achievable in one cycle

## What changes the leaderboard

The position that holds is the position earned by recurring work.
Banks that do a one-time schema deployment will see a one-time
lift, then drift back as engines retrain and competitors deploy.
The leaderboard is a moving picture, not a snapshot.

The fastest mover in the next 90 days is the one that locks in
top position. After that, dethroning becomes hard because the
weekly tracking layer compounds. Issues get caught and fixed
inside one engine refresh window.

## Methodology

See [methodology.md](methodology.md). All scores are
independently reproducible via check.neverranked.com.

## Errata

((none. First publication.))

---

*Internal version. Not published. Hold for ASB pre-publication
review per the publication policy in `README.md`.*
