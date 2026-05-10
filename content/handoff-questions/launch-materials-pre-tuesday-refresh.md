# Tuesday launch materials: present-tense "data is partial" → past-tense?

**To:** parallel session
**From:** Claude Code (this session)
**Date:** 2026-05-10 ~01:55 HST

The Tuesday May 12 launch material you drafted references the
partial-data state of the 2026-05-10 report as a transparency lever.
The framing is good. The tense is now stale because the underlying
fix shipped 48 hours before launch.

## Specific lines worth a refresh pass

### `content/blog/citation-tape-launch.md` line 47

Current:

> The 2026-05-10 weekly report carries a banner at the top: this
> week's data is partial. Three of three tracked clients fell
> below 80% keyword completion due to a known infrastructure
> issue. The numbers in the report should be read as a lower
> bound on what AI engines actually retrieve, not the final
> picture.

Could become (post-fix story):

> The 2026-05-10 weekly report carries a banner at the top: this
> week's data was partial. Three of three tracked clients fell
> below 80% keyword completion due to a Cloudflare Workflows
> subrequest budget issue we hadn't seen before. We diagnosed and
> shipped the fix the same day. From 2026-05-11 forward, the
> Citation Tape produces 7 samples per (keyword, engine) per
> week across all 6 engines, daily. The 2026-05-10 report's
> numbers should be read as a lower bound; everything published
> from next Monday onward is the real shape.

### `content/strategy/email-citation-tape-nurture.md` line 61

Current:

> 2. This week's data is partial. We caught a bug in our
>    infrastructure while building the tape. The report ships
>    with a banner above the headline disclosing the issue. We'd
>    rather publish honest than wait.

Could become:

> 2. This week's data was partial -- we caught a bug in our
>    infrastructure while building the tape, then shipped the
>    fix 48 hours before this email. Detection > pretending the
>    pattern doesn't happen, every time. The 2026-05-10 report's
>    banner notes the issue; the 2026-05-17 report won't need one.

### `content/strategy/email-citation-tape-nurture.md` line 139

Current reference to "the audit doc that documents the data
integrity caveat" should probably also link
`content/handoff-questions/citation-cron-fix-landed.md` as the
resolution evidence.

## Why this matters

The "we caught and fixed it" framing is a stronger flex than "we
published honest about partial data." Both are transparency
levers, but one is an apology and one is a demonstration. For a
launch positioning NR as the AEO measurement framework, the
demonstration version is on-brand.

It's also factually correct: the fix is live, verified, monitored
by the heartbeat. The previous framing assumes broken; the new
framing assumes fixed-and-watched.

## What I did NOT do

I didn't edit your launch material directly. Voice is yours,
launch material owns its own tense. Flagging for your next pass.

If you don't get to this before Tuesday morning ET, Lance and I
will default to leaving your copy as-is -- the original framing
isn't wrong, just slightly behind the data.

## Quick fact check for your reference

- Fix commit: `ca719b3` (per-keyword workflow dispatch) +
  `7de4872` (reconciler follow-up)
- First production verification: 89/90 expected rows on
  neverranked slug, 2026-05-10 ~01:00 HST
- Daily cron now dispatches `CitationKeywordWorkflow` per
  active (client, keyword) at 06:00 UTC; snapshot rollup
  Mondays only
- Architecture documented in `content/handoff-questions/citation-cron-fix-landed.md`
