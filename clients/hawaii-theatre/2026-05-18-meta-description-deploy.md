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

### Remaining production steps (run on NeverRanked infra)

These touch the live D1 DB and Worker, so they are not run from the
dev container. From `dashboard/`:

1. Apply the schema migration to remote D1:
   `npm run db:migrate`
   (= `wrangler d1 migrations apply neverranked-app --remote`)
2. Seed Greg's approved copy (idempotent, safe to re-run):
   `wrangler d1 execute neverranked-app --remote --file=migrations/backfill-htc-meta-description.sql`
3. Deploy the Worker: `npm run deploy`
   (or let the normal `deploy-dashboard.yml` pipeline ship it).
4. Verify the snippet now carries it:
   `curl -s https://app.neverranked.com/inject/hawaii-theatre.js | grep -c 'name","description"'`
   and `curl -s https://app.neverranked.com/inject/hawaii-theatre.json | jq '.meta_descriptions'`
5. Re-run the technical-signals scan on
   `https://www.hawaiitheatre.com/` and confirm "Meta description"
   flips from Missing to present with the approved text.

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
