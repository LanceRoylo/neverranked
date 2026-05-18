---
title: "Hawaii Theatre — meta description fix: approved copy + deploy work order"
prepared-by: "Lance / NeverRanked"
prepared-on: "2026-05-18"
status: "Client-approved. Ready to deploy."
purpose: "NeverRanked technical signals scan flagged hawaiitheatre.com as missing a page meta description. This is the client-approved replacement copy plus the work order to ship it through the NR snippet. Greg approved the final dash-free version on 2026-05-18."
---

# Hawaii Theatre — meta description deploy

## Context

A NeverRanked technical signals scan of `https://www.hawaiitheatre.com/`
reported:

- Title tag: `Hawaii Theatre Center – Pride of The Pacific` (50 chars) — OK
- **Meta description: Missing** — the issue this work order fixes
- Canonical URL: `https://www.hawaiitheatre.com/` — OK

Greg (CEO, Hawaii Theatre Center) raised this and was trying to figure
out where to fix it in his CMS. He does not need to. The meta
description ships through the same one-line NeverRanked snippet that
already delivers the site's PerformingArtsTheater schema, leadership
schema, and the 5 live FAQs. No CMS changes, no engineering on the
client's end, no design risk. Same yes/edit/skip workflow as the
2026-05-14 FAQ expansion.

## Approved copy (FINAL — ship exactly this)

> Hawaii Theatre Center, the Pride of the Pacific. A restored 1922 National Register landmark in downtown Honolulu presenting concerts, theatre, comedy, dance, film, film festivals, venue rentals, and theatre education.

- Length: 218 characters.
- Greg's approval history:
  1. Approved the base line.
  2. Requested edit: add "film festivals, venue rentals and theatre
     education" after "film" — incorporated.
  3. Approved final version on 2026-05-18 after the em dash was
     removed (see voice rule below).

## Voice rule that applies (do not break this)

NeverRanked copy uses **zero em dashes, ever** — replace with a
period or comma. Documented in `content/blog/qa-checklist.md:84`,
`content/blog/README.md:52`, `content/blog/template.md:96`, and the
reddit briefs. An earlier draft used an em dash as a connector after
"Center"; that is the AI tell. The approved copy above uses a comma
after "Center," and has no em dashes, no semicolons, and no banned
filler. **Verify the deployed string contains no em dash (—) or en
dash (–) before going live.**

## Deploy work order (for Claude Code on the laptop)

Correction to the earlier draft of this doc: the snippet delivery IS
in this repo. The Worker serves `GET /inject/:client_slug.js` from
D1 (`dashboard/src/routes/inject.ts`) and that is what's live on
`hawaiitheatre.com`. It previously injected JSON-LD and FAQ HTML only
— there was no meta-description path. That path now exists.

### Code (done on branch `claude/htc-greg-inquiry-QJ35p`)

- `dashboard/migrations/0095_meta_descriptions.sql` — new
  `meta_descriptions` table (per-client, `target_pages`,
  draft/approved workflow; mirrors `schema_injections`).
- `dashboard/migrations/backfill-htc-meta-description.sql` —
  idempotent insert of the approved copy for `hawaii-theatre`,
  `status='approved'`, `target_pages='["/"]'` (homepage only).
- `dashboard/src/routes/inject.ts` — `.js` endpoint now injects a
  single `<meta name="description">` for matching pages (reuses an
  existing tag if present, else creates one — owns/replaces, never
  duplicates). `.json` sibling now returns `meta_descriptions` so
  the scanner can follow them.
- `packages/aeo-analyzer/src/extract.ts` + `report.ts` — the
  scanner's snippet-follower now fetches and applies injected meta
  descriptions, so the technical-signals scan reflects reality.
- `dashboard/src/types.ts` — `MetaDescription` type.
- `dashboard/test/inject-meta.test.ts` — coverage (Missing→present,
  no sitewide bleed, owns existing tag, no em dash). Full dashboard
  suite green (24/24); analyzer regression green (47/47).

### Deployment is fully automated (do NOT run wrangler by hand)

The dashboard's D1 (`neverranked-app`, db id `def9e1a6…`) lives in
the Cloudflare account the CI deploy token owns — NOT a founder's
personal account. A laptop on a personal OAuth login gets API error
`7403 (account not authorized)` even with a `d1 (write)` token,
because the database simply is not in that account. This is by
design: `.github/workflows/deploy-dashboard.yml` is the only thing
that may write this D1.

That workflow fires on every push to `main` touching `dashboard/**`
and runs, with the correct CI credentials:

1. `wrangler deploy --dry-run` (build check)
2. `wrangler d1 migrations apply neverranked-app --remote`
3. `wrangler deploy`

So both migrations ship themselves on merge:

- `0095_meta_descriptions.sql` — creates the table.
- `0096_seed_htc_meta_description.sql` — seeds Greg's approved copy.
  This is a numbered migration on purpose (step 2 above applies
  numbered migrations only; a separate backfill file would never run
  because no one has hand-write access to this D1).

There is nothing to run on a laptop. To confirm after the
deploy-dashboard workflow goes green on the merge commit:

- `curl -s https://app.neverranked.com/inject/hawaii-theatre.json | grep -o '"meta_descriptions":\[[^]]*\]'`
  → expect Greg's sentence with `"pages":["/"]`.
- Re-run the technical-signals scan on
  `https://www.hawaiitheatre.com/` and confirm "Meta description"
  flips from Missing to the approved text (yellow "will truncate"
  at 218 chars — the known, client-approved tradeoff).

## Acceptance criteria

- [ ] Live `https://www.hawaiitheatre.com/` serves exactly one
      `meta name="description"` tag.
- [ ] Content matches the approved copy character-for-character.
- [ ] No em dash or en dash anywhere in the deployed string.
- [ ] NeverRanked technical signals scan no longer flags meta
      description as Missing.
- [ ] No CMS change requested from or made by the client.

## Notes

- Google truncates the classic SERP snippet near 155–160 chars, so
  this 218-char description will visually clip in a Google blue-link
  result. That is cosmetic display only — it does not affect
  indexing, and AI engines (the point of the NR program) read the
  full tag. Client approved with this understood; ship as-is.
- A tighter 177-char variant exists if the classic SERP display is
  ever prioritized, but it is NOT the approved copy and should not
  be deployed without a new Greg sign-off.
