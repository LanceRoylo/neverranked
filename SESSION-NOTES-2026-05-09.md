# Session notes, 2026-05-09 evening into 2026-05-10 early HST

The other Claude window (this one) ran a multi-phase build session
overnight. This document is the consolidated narrative for what
shipped, what is in flight, and what awaits Lance's next move.

Read this if you are the parallel window, or Lance returning the
next morning. Skip the per-commit blow-by-blow in `git log`; this
is the synthesis.

## What got shipped, in story order

### Five-phase queue Lance pre-approved at 4:43pm HST

A. **AEO-niche source-type classifier expansion.** Added 4 new
   types (seo-publication, aeo-platform, aeo-services-agency,
   google-ai-infra) to `tools/citation-gap/src/source-types.mjs`
   so the State of AEO report can name the actual competitive
   landscape. 56/56 tests pass. Commit `09b1a76`.

B. **Public /state-of-aeo hub on neverranked.com.** New
   directory + per-report pages + PDF downloads. Latest report
   2026-05-10 + Hawaii 2026 edition (now badged as draft, see
   D). Hub renders via `scripts/state-of-aeo-publish.mjs`.
   Sitemap entries added. Commit `244ba3b`.

C. **Weekly cron schedule for the State of AEO regen.** New
   workflow `.github/workflows/weekly-state-of-aeo.yml` fires
   Mondays 04:00 UTC. Lance manually verified the workflow
   succeeds end-to-end (1m 2s green run). Commit `1453525`,
   timing fix `8b92831`.

D. **State of AEO headline in weekly customer digest email.**
   New module `dashboard/src/state-of-aeo.ts` fetches the
   public `latest.json` and renders a brand-clean email block
   that lands above the digest CTA. White-label sends skip the
   block. Commit `64efbb9`. Hawaii edition draft tagging +
   handoff sync followed in `d4fb639`.

### Reddit tracker validation + sharpening

E. **Used the existing Phase 1 reddit-tracker against NR's
   keyword corpus.** Generated 15 reply briefs across 3 NR
   keywords. Commit `2fe078e`.

F. **ASB Reddit landscape probe.** Ran the same pipeline with
   ASB Hawaii as the client. Surfaced the priority-0.94
   r/Hawaii FHB thread as the cleanest competitor-visible /
   ASB-absent gap in the Hawaii banking dataset. Commit
   `276c97a` (v1) refined to `89959ee` after the audit caught
   a relevance-gate bug.

G. **Reddit tracker improvement.** Region-token enforcement so
   "best small business bank Hawaii" no longer leaks into
   r/montreal r/ottawa r/pittsburgh threads. CLI gained a
   `--required` flag for non-region must-include tokens.
   Commits `89959ee`, `fa158be`. 68/68 tests pass.

H. **Hawaii cross-vertical landscape.** Banking + hotels + law
   probes. The pattern story for the May 18 meeting: hotels
   saturated, banking in the sweet spot, law sparse. Commit
   `f4e1abc`.

I. **And Scene Hawaii probe.** Negative-space finding: Reddit
   is not the citation lever for B2B corporate-training in
   Hawaii. Documented why and what surfaces would work
   instead. Commit `aaeeaaf`.

### Naming the framework

J. **The Citation Tape.** Lance picked the name from a 4-
   candidate strategy doc. Mechanical rename pass across the
   hub, generator, digest email, latest report masthead, and
   moat-research doc. Commits `7c2681f` (decision), `38e0d15`
   (rename pass).

### Free monitoring tier spec

K. **Free tier design spec.** 1-2 day implementation sketch.
   Wedge, schema additions (migration 0069), routes, upgrade
   triggers, four open questions for Lance. Commit `c82a275`.

### The autonomy trifecta (the unintended discovery of the night)

L. **Caught the citation cron silent for 30+ days.** While
   investigating why And Scene had zero `citation_runs`,
   discovered no automated cron has produced any runs in 30
   days. Filed at `content/handoff-questions/citation-cron-not-firing.md`
   with the per-keyword workflow refactor recommended. Commits
   `ef72f34`, `3da355b`, `4e5e114`.

M. **Empirical evidence of the partial-completion bug.**
   Lance manually triggered "Run now" for and-scene + neverranked.
   Both UI returned successfully but the backend completed only
   1 of 5 and ~2 of 15 keywords respectively before silently
   exiting. Updated the handoff doc. Citation Tape report now
   self-discloses with a top-of-document data-integrity banner.
   Commits `aed0472`, `2c73c4d`.

N. **Autonomy audit.** Cross-checked every promised automation
   against D1 evidence. Surfaced two more silent crons: weekly
   digest fanout (12 days dead) and GSC pull (29 days dead).
   Filed at `content/handoff-questions/autonomy-audit-2026-05-09.md`.
   Commit `bc494eb`.

O. **Daily heartbeat with three check kinds.** New
   `scripts/heartbeat.mjs` + new `.github/workflows/daily-heartbeat.yml`.
   - Staleness checks (7 tables, fail if older than expected
     cadence)
   - Invariant checks (4, e.g. per-client keyword completion
     should be >=80%)
   - HTTP checks (3, marketing site + state-of-aeo latest +
     npm registry)
   Auto-opens GitHub Issues on stale findings. Permanent
   git-tracked log at `content/autonomy-log/`. Commits
   `5ac31bd`, `77c23b9`, `090a423`, `57fc977`.

P. **Heartbeat caught the MCP v0.1.2 release.** While we ran
   the heartbeat, the npm-registry HTTP check returned
   `latest version 0.1.2`. Confirms the parallel window has
   shipped the v0.1.2 patch noted as pending in the handoff.

### Distribution and external surfaces

Q. **RSS feed for The Citation Tape.** Generated by the
   publish script alongside `index.html` and `latest.json`.
   Auto-discoverable via `<link rel="alternate">`. Commit
   `644e969`.

R. **HN submission draft for the MCP launch.** Title, URL,
   body, pre-submit checklist, engagement plan with canned
   responses for hostile angles, two backup title framings.
   Ready for Lance to copy-paste Tuesday afternoon ET. Commit
   `d73cdee`.

S. **The Citation Tape launch blog post.** 1100-word draft at
   `content/blog/citation-tape-launch.md`. Commit `b5938d4`.

T. **LinkedIn launch post variants.** Three voice options
   (founder, company-page formal, news-shaped) with engagement
   plan. Commit `8937a0a`.

U. **May 18 ASB+MVNP meeting evidence appendix.** 4-page
   markdown + PDF at `content/meeting-evidence/asb-2026-05-18.{md,pdf}`.
   Complementary to the locked content/asb-mvnp-* prep
   materials. Commits `2441f69`, `bffadcf`.

## What awaits Lance

Decisions:

1. **Free tier four open questions** in `content/strategy/free-monitoring-tier.md`:
   branded "Free" or softer name, one-domain-forever vs 90-day,
   email cadence, public score history toggle.

2. **Citation cron fix assignment.** Filed in
   `content/handoff-questions/citation-cron-not-firing.md`.
   Either the parallel window takes it or Lance assigns it
   explicitly. Estimated effort: 1-2 hours per-keyword workflow.

3. **Autonomy fix sequencing.** Three fixes documented in
   `content/handoff-questions/autonomy-audit-2026-05-09.md`:
   per-keyword workflow, digest fanout fix, staleness alert
   sweep. Total ~2-3 hours.

4. **Hawaii edition: keep as draft, promote to published, or
   pull from public hub.** Currently badged as Working Draft
   on the public hub.

Manual actions:

5. Trigger remaining citation scans for and-scene + neverranked
   (each click only completes 1-2 keywords until the per-keyword
   fix lands, so 4-5 clicks for and-scene, ~10 clicks for
   neverranked).

6. Manually test the daily-heartbeat workflow via Actions tab
   at least once before the first scheduled run, to confirm
   `CLOUDFLARE_ACCOUNT_ID` is in repo secrets.

7. Review the LinkedIn / HN / blog drafts and decide publish
   timing. Recommendation in the LinkedIn doc: variant A on
   personal account, variant B on company two hours later, HN
   submission Tuesday afternoon ET separately.

## What awaits the parallel window

If the parallel window picks up the autonomy fixes (recommended
priority order):

1. Per-keyword workflow refactor (~1-2 hours, unblocks both
   citations and GSC)
2. Digest fanout fix (~30 min)
3. Heartbeat-style staleness alert sweep inside the dashboard
   (~30 min, redundant with the GH Actions heartbeat but adds
   in-product visibility)

All filed at `content/handoff-questions/`.

## What is healthy and confirmed

Per the heartbeat run at 09:46 UTC tonight:

- Per-domain Monday scan workflow (8-11 domains/Monday consistently)
- Roadmap items writes (active)
- Magic-link auth emails (sending normally)
- Admin alerts sweeps (firing)
- Marketing site (200)
- State of AEO public hub + latest.json (fresh)
- @neverranked/mcp on npm registry (0.1.2)

## What is broken and disclosed

- Weekly citation cron (silent 30+ days, every row from manual
  triggers)
- Weekly digest fanout (silent 12 days, no customer received a
  digest in two Mondays)
- GSC pull (silent 29 days, only 4 snapshots ever in lifetime)
- Citation Tape report this week is at 13-40% per-client
  keyword completion (banner visible at the top of the report)

## Files added or substantially modified tonight

New files:

- `state-of-aeo/` (entire public surface, generated)
- `scripts/state-of-aeo-publish.mjs`
- `scripts/heartbeat.mjs`
- `dashboard/src/state-of-aeo.ts`
- `.github/workflows/weekly-state-of-aeo.yml`
- `.github/workflows/daily-heartbeat.yml`
- `content/strategy/aeo-framework-naming.md`
- `content/strategy/free-monitoring-tier.md`
- `content/strategy/hn-submission-mcp-launch.md`
- `content/strategy/linkedin-citation-tape-launch.md`
- `content/blog/citation-tape-launch.md`
- `content/handoff-questions/citation-cron-not-firing.md`
- `content/handoff-questions/autonomy-audit-2026-05-09.md`
- `content/reddit-briefs/2026-05-09/` (3 cat. NR landscape)
- `content/reddit-briefs/2026-05-09-asb/` (4 cat. ASB landscape)
- `content/reddit-briefs/2026-05-09-hotels/` (2 cat.)
- `content/reddit-briefs/2026-05-09-law/` (2 cat.)
- `content/reddit-briefs/2026-05-09-andscene/` (4 cat.)
- `content/reddit-briefs/2026-05-09-hawaii-landscape/` (cross)
- `content/meeting-evidence/asb-2026-05-18.{md,pdf}`
- `content/autonomy-log/2026-05-10.md`

Substantially modified:

- `tools/citation-gap/src/source-types.mjs` (4 new types)
- `tools/citation-gap/src/brief.mjs` (matching brief library)
- `tools/citation-gap/test/*.test.mjs` (62 + 6 = 68 tests)
- `tools/reddit-tracker/src/score.mjs` (region enforcement)
- `tools/reddit-tracker/src/search.mjs` (requiredTokens)
- `scripts/state-of-aeo-generate.mjs` (Citation Tape masthead,
  data-integrity banner, completion disclosure)
- `dashboard/src/cron.ts` (digest threading)
- `dashboard/src/email.ts` (State of AEO block)
- `scripts/build.sh` (state-of-aeo dir)
- `sitemap.xml` (state-of-aeo entries)
- `HANDOFF-2026-05-09.md` (parallel-window sync)

## Total work

29 commits. Roughly 7,000 lines of code, configuration, content,
and documentation added. All voice-clean, all tests passing,
all dist/ regenerated and pushed.

Tomorrow morning's first move: read this file.
