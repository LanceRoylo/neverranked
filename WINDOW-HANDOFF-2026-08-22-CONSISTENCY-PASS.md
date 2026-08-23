# WINDOW HANDOFF — Pre-existing consistency pass, 2026-08-22

Follow-up to WINDOW-HANDOFF-2026-08-22-COPILOT-SWEEP-AUDIT.md (complete,
verified 2026-08-22). These defects predate the Copilot sweep and were
noticed in passing during that audit. They are a different disease:
contradictions and figure drift between pages, not substitution damage.
Deliberately kept OUT of the sweep repair so each pass stays reviewable.

Severity order below. Item 1 is a regression of a documented correction
and outranks everything else.

## 1. REGRESSION — the false "cohort named in full" claim is live again

Ground truth, established from the repo: teardowns/bank-honolulu is
ANONYMIZED ("Subject brand and cohort anonymized", institutions labeled
Bank A onward). The head comment of teardowns/cross-category (:24-35)
records this exact claim being found FALSE and corrected 2026-07-17, with
the reasoning: combined with teardown 01's per-bank "Bank A / Bank B"
figures, a published roster collapses the 23-domain anonymity set to a
named handful — the same deanonymization shape as naming an island for a
boutique hotel.

It is back (or was never fully swept) in two places:

- [x] teardowns/index.html:118 — "21-bank cohort named in full." ->
      "23-domain cohort, anonymized." (also fixes item 3 here)
- [x] teardowns/cross-category/index.html:533 — "the Hawaii consumer
      banking cohort is named in full in teardown 01 because that artifact
      already established public naming for the cohort." The whole
      rationale is false; teardown 01 names no bank. -> "every category's
      cohort is anonymized here, banking included, per the rule that
      non-customer businesses appear named only in 1:1 deliverables."
- [x] Re-check the full 2026-07-17 propagation list from the cross-category
      head comment for other regressions: /faq/, /results/, /teardowns/,
      /hawaii-bank-aeo/. Grep: `grep -rn "named in full" --include='*.html'
      . --exclude-dir=dist --exclude-dir=node_modules` and judge each hit.
      LEGITIMATE uses to leave alone: "named in full inside paid
      engagements" (index.html:1543 and siblings) — that is the customer
      promise, not the cohort claim.
- [x] Gate rule so this cannot regress a third time (this is its second
      appearance). Add to scripts/check-claims.mjs RULES:

        {
          // The banking cohort was NEVER named in full. This exact claim
          // was found false and corrected 2026-07-17 (see the head comment
          // in teardowns/cross-category/index.html), then reappeared and
          // was corrected again 2026-08-22. Anonymity claims are
          // load-bearing: teardown 01 publishes per-bank figures under
          // Bank A/B labels, so a "named in full" assertion plus any
          // roster collapses the anonymity set.
          id: "false-cohort-named-in-full",
          severity: "block",
          re: /cohort (?:is )?named in full/i,
          why: 'claims a cohort is named in full. Every non-customer cohort is anonymized (teardown 01: "Subject brand and cohort anonymized"); this exact claim was corrected 2026-07-17 and regressed once already',
        },

      "named in full inside paid engagements" does not match this pattern;
      verify with a dry run before committing.

## 2. Two teardowns both claim the number 11

- Hotels-Hawaii: "Teardown 11", published 2026-06-21 (title, og:title,
  head comment) — has seniority, keep as 11.
- Agency-US: "Teardown 11. Published 2026-08-05" (head comment :3, title
  :27, og:title :30) — renumber to 12.

- [ ] teardowns/agency-us/index.html — :3 head comment, :27 title, :30
      og:title, plus any in-body "Teardown 11" self-references ->
      Teardown 12.
- [ ] Sweep for external references: `grep -rn "eardown 11" --include='*.html'
      . --exclude-dir=dist` — cross-category :473 and :489 point "teardown
      11" at hotels (CORRECT, leave); anything pointing the number 11 at
      agency-us gets renumbered.
- [ ] teardowns/index.html — confirm the catalog's ordering/numbering
      matches after the renumber.

## 3. Banking cohort count: 21 vs 23

Ground truth (cross-category:484): 23 cohort domains across about 21
distinct institutions — several banks run multiple domains. Both numbers
are real; the drift is unlabeled scope. House formulation:
"23-domain cohort (about 21 distinct institutions)".

- [ ] teardowns/index.html:118 — "21-bank cohort" (fix together with
      item 1's edit on the same line).
- [ ] index.html:1574 — "21-bank cohort." on the homepage teardown card ->
      "23-domain cohort" (or the full house formulation if it fits the
      card).
- [ ] teardowns/bank-honolulu uses "23-bank cohort" (:5, :20, :79) — the
      strictly true count is 23 DOMAINS / ~21 banks. Decide: either leave
      "23-bank" as shorthand everywhere and drop "21" from the site, or
      adopt the house formulation everywhere. Do not leave both bare
      numbers live.

## 4. Law-firm teardown disagrees with its own table

The on-page table (teardowns/law-firm-hawaii:124-125) is the authoritative
source: firm-owned 39%, third-party 58% (n=2,410). Against it:

- [ ] :133 — "law firms now sit below all of them at 35%." If 35% is the
      five-surface web pool (the comparison list there — banking 51,
      wealth 47, dental 43, CPA 45 — reads like the web pool), LABEL it
      ("35% on the web-searching pool") so it stops contradicting the
      39% all-surface table two screens up. If it is not reconstructable
      from the runs, use the table's 39%.
- [ ] :284 — "The 38%/59% firm-own / third-party split" vs table 39/58.
      One of these is a stale draft number. Verify against the run data;
      fix to match.
- [ ] Top-5 share: 64% at law-firm :21, :24, :86 vs 66% at
      teardowns/index:132. The teardown (three consistent instances, with
      1,549/2,410 shown = 64.3%) wins; fix teardowns/index:132 -> 64%.
      Note :132's "roughly three times the next firm" vs :86 "three times
      the second-tier firms" — align phrasing while in there.

## 5. Cross-page vertical figure drift (scope labels, then verify)

Same disease as the sweep's Tier 4: unlabeled five-vs-seven-surface
scopes. The sweep repair labeled the in-page cases; these are the
CROSS-page cases. For each, determine the scope of each figure from the
run data before editing (D1 neverranked-app via the dashboard repo's
emit scripts; the aggregates are not in this repo):

- [ ] Banking own-site: 51% (hawaii-bank-aeo:58 "of mentions") vs 53%
      (comparison tables on hawaii-cpa-aeo:68, hawaii-law-aeo,
      hawaii-wealth-aeo, honolulu-dental-aeo). Likely 7-surface vs
      5-surface. Label both.
- [ ] Law own-site: 35% (bank page's comparison) vs 39% (its own table) —
      resolves with item 4.
- [ ] Dental 43 vs 44, third-party 45 vs 42 across the same comparison
      tables.
- [ ] Hotels: 17% (for-hospitality headline, 7-surface) vs 11%
      (for-hvac:318 and cross-category:473, web-searching pool). for-hvac
      :318 now labels ITS OWN 40% but the neighboring "hotels hold 11
      percent / real estate 14" still reads as the same scope as
      hospitality's 17. Add the scope in-line: "hold 11 percent of the
      web-searching citations".
- [ ] Measurement-count drift: "ten categories" (hawaii-bank-aeo:55),
      "Ten measurements" (for-agencies:73, :174, index.html hero), "Eleven
      hash-locked cohorts spanning nine categories" (for-real-estate:267),
      "eleven categories" (for-real-estate:15), "11 measurements: 9 Hawaii
      verticals + Austin + national B2B" (teardowns/index:102). Ground
      truth from the teardown catalog: 12 published teardowns / 11
      measurements + Nashville control. Pick ONE formulation ("eleven
      measurements across ten categories in two states", or whatever the
      catalog supports) and apply it everywhere. The homepage hero "Ten
      measurements on the public record, across ten cohorts in two
      states" is the most visible instance.

## 6. Small and mechanical

- [ ] pitch/hawaii-theatre-center — brand-check denominators: :125 "both
      brand queries" (2 x 3 runs = 6 responses per engine) vs "all
      eighteen brand responses" and "fourteen of eighteen" nearby.
      Reconcile: 18 = 6 responses x 3 engines? State the arithmetic the
      way it was actually counted.
- [ ] pricing/index.html:323-366 — section#worth closes without closing
      the .roi-out / .roi-wrap divs opened at :326 and :348. Balance the
      tags; verify layout in the browser after.
- [ ] Four May social-post sources still carry "Copilot" in their engine
      strips (social/posts/2026-05-11-43-vs-91-company,
      2026-05-11-aeo-score-confession, 2026-05-12-hawaii-theatre-45-to-95,
      2026-05-13-aeo-not-seo-carousel). DECISION MADE: dated artifacts of
      already-published posts, leave as history. Listed here only so the
      next audit does not re-flag them. Do not re-export their PNGs.

## Done in prior passes (do not redo)

- hamada og h1 "Five things" -> fixed in the sweep repair.
- for-hvac 40% scope label, hawaii-bank-aeo:58 reframe -> sweep repair.
- linkedin/post-03 MS Copilot strip + count -> fixed 2026-08-22 (a62bae5).

## Verify at the end

    node scripts/check-claims.mjs          # green, incl. the new rule
    grep -rn "named in full" --include='*.html' . --exclude-dir=dist --exclude-dir=node_modules
    grep -rn "eardown 11" --include='*.html' . --exclude-dir=dist | grep -v hotels
    grep -rn "21-bank" --include='*.html' . --exclude-dir=dist
    # rebuild dist, all seven gates, before calling any of it verified
