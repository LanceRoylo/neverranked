# AEO Analyzer -- Assumptions and Known Limits

This document is the analyzer's honest list of what it does and doesn't
do. Every check in this package is constrained by these assumptions. When
a user reports "the tool missed X," the first step is to ask: was it a
bug inside an assumption, or was it outside our assumed scope?

Keep this list accurate. If you add a check that breaks one of these
assumptions, update the relevant section.

## What the analyzer reads

The analyzer fetches a single URL and extracts signals from the returned
HTML. It does not execute JavaScript, does not crawl additional pages,
and does not authenticate.

Specifically:

- **Static HTML only.** Pages rendered entirely client-side (React, Vue,
  Angular apps without SSR) will appear empty to the analyzer. A page
  that ships schema only after JS hydration will be reported as having
  no schema even if it is technically "correct" in a headless browser.
- **Single page per scan.** We do not crawl sitemap, follow links, or
  check subdomains. "No Organization schema" means "not on this URL."
- **No authentication.** We send an anonymous GET. Pages behind
  paywalls, geo-fences, or bot walls are scanned as whatever the wall
  returns (often a redirect or an interstitial).
- **GET, no JS rendering.** No POST, no form fills, no link hover.

## Schema detection

Schema is detected exclusively from JSON-LD blocks (`<script type="application/ld+json">`).

- **Microdata (`itemscope` / `itemprop`) is NOT scanned.**
- **RDFa (`typeof` / `property`) is NOT scanned.**
- **HTML5 `<link rel="author">` and similar are NOT treated as schema.**

If a site uses microdata exclusively, we will report "no schema." This
is a known blind spot. The tradeoff: microdata and RDFa are rare in
modern web practice (Google itself recommends JSON-LD), and adding
support would add significant complexity and false-positive risk.

## Schema type matching

Type matching uses the hierarchy defined in `src/hierarchy.ts`. When we
check "does the page have Organization schema," we match against the
target AND all its subtypes (ProfessionalService, LocalBusiness, Dentist,
etc.).

- **Case-sensitive.** Schema.org type names are case-sensitive by spec.
  `organization` (lowercase) does not match `Organization`.
- **Prefix tolerant.** The normalizer strips `https://schema.org/` and
  `schema:` prefixes before matching.
- **`@graph` arrays are walked.** Types nested inside `@graph` are
  collected the same as top-level types.
- **`@type` arrays are handled.** `@type: ["LocalBusiness", "Dentist"]`
  is treated as two types.
- **Unknown types are logged, not failed.** If a page declares a type we
  don't know about, `buildReport()` logs it so we can extend
  `hierarchy.ts`. The type is not counted toward any parent check.

## Signal heuristics

Each signal check is a heuristic. None of them are authoritative.

- **Title length bounds (30-65).** SERPs may render more or less
  depending on pixel width, device, and engine. 30-65 is a practical
  sweet spot for Google, not a universal rule.
- **Meta description bounds (80-160).** Same reasoning as title.
- **H1 count == 1.** HTML5 technically allows multiple H1s inside
  different sectioning elements. We still flag multiple H1s because most
  sites don't use sectioning correctly and the heuristic catches real
  problems.
- **Word count >= 300.** Thin content is a citability heuristic, not a
  hard rule. Product pages and landing pages legitimately have fewer
  words.
- **External links >= 2.** Linking out is an authority signal for AI
  engines. Some valid pages (legal, single-purpose landing pages) don't
  have external links by design.

## Scoring weights

Score weights are opinionated and stable for comparability. Current
weights live in `src/score.ts`. Grades (A-F) are bucketed from score.

These weights prioritize AEO (answer engine citation readiness), not
traditional SEO ranking. A page can have a low AEO score and rank well
organically, and vice versa.

## How to close a blind spot

1. Add a fixture to `src/__tests__/hierarchy.test.ts` that reproduces
   the missing case. Include an `origin` note with where you heard about
   it.
2. Run the test harness and confirm it fails.
3. Fix the underlying code (add the missing type to `hierarchy.ts`, add
   a new check, etc.).
4. Re-run the harness and confirm it passes.

This is the regression discipline. We can't prevent the first miss; we
can guarantee we never re-miss the same thing.

## Out of scope (for now)

- Core Web Vitals measurement (we don't render or paint)
- Image analysis beyond alt text (no pixel analysis)
- Backlink or off-site authority signals
- Translation / language correctness
- Accessibility beyond alt text + heading structure
- Schema validation against Google's Rich Results rules (we check
  presence, not field-level correctness)
