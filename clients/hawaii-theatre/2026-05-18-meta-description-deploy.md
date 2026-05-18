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

The actual injection is NOT configured in the `neverranked` static
site repo — grep hits for "hawaiitheatre" there are tooling/test
harnesses only. Deployment happens in the NeverRanked snippet
delivery system that serves `hawaiitheatre.com`.

Steps:

1. Locate the per-client snippet/profile config for the
   `hawaii-theatre` client in the NeverRanked delivery codebase
   (the system that serves the live JS snippet, not this marketing
   repo). Confirm where injected `<head>` signals (schema, FAQs)
   are defined for this client — the meta description goes in the
   same place.
2. Add a `<meta name="description" content="...">` injection (or
   the delivery system's equivalent field) with the approved copy
   verbatim. If a meta description tag already exists on the page,
   the snippet must replace/own it rather than create a duplicate.
3. Sanity-check the rendered string: no em dash, no en dash, no
   smart-quote artifacts, exact 218-char copy, single `description`
   meta tag on the page.
4. Deploy to the live snippet for `hawaiitheatre.com`.
5. Re-run the NeverRanked technical signals scan on
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
