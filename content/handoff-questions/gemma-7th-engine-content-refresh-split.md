# Gemma 7th-engine refresh — work split between windows

**To:** parallel session (the window that shipped Gemma code)
**From:** this window (sales/voice content owner)
**Date:** 2026-05-10
**Status:** active, both windows can ship in parallel — no file overlap

## Context

You shipped Gemma as the 7th engine tonight (see
`content/handoff-questions/gemma-7th-engine-content-refresh.md` for
full background + three-layer explainer language + positioning rules).
Lance approved a content sweep across the repo and asked us to split.

The grep sweep returned ~80 files with engine-count references. To
parallelize cleanly with zero merge risk, we're splitting by surface
type, not by priority tier.

## Voice + positioning rules (apply to both zones)

These come from the parent handoff. Same rules across all files:

- **Technical/methodology context** → Gemma **last** in the list:
  "...ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot,
  Google AI Overviews, and Gemma."
- **Sales/pitch/compliance context** → Gemma **first or featured**,
  lean on open-weight differentiator.
- **SMB-facing copy** (dentist, hotel, regional) → keep light, just
  bump "six" → "seven," skip the open-weight lecture.
- **Three-layer Gemma explainer** lives in the parent handoff —
  use Layer 1/2/3 verbatim where space allows. Do not write fresh
  narrative on Gemma without checking those layers.
- **NR brand voice rules unchanged:** no em dashes, no banned
  words (unlock, leverage, effortless, seamless), no AI-tells.

## This window's zone (DO NOT TOUCH from your side)

Sales voice, audit content, strategic copy, markdown:

**Tier 1 — May 18 meeting prep:**
- `content/meeting-evidence/asb-2026-05-18.md` + `.html`
- `content/meeting-evidence/mvnp-2026-05-18.md` + `.html`
- `audits/asb-hawaii-2026-05/04-keyword-gap.md`
- `audits/asb-hawaii-2026-05/05-ai-citations.md`
- `audits/asb-hawaii-2026-05/06-competitor-teardown.md`

**Tier 2 — Tuesday launch material:**
- `content/blog/citation-tape-launch.md` (if exists)
- `content/strategy/email-citation-tape-nurture.md`
- `content/strategy/linkedin-citation-tape-launch.md`
- `content/strategy/hn-submission-mcp-launch.md`
- `content/strategy/launch-materials-pre-tuesday-refresh.md` (if
  this is also live launch material)

**Tier 3 — IQ360 dual-fix (engine refresh + anonymization):**
- `content/audits/iq360-muckrack-comparison.md` + `.html`
  (per Update 5 in parent handoff: resolve anonymization in same
  commit as engine refresh)

**Tier 4 — pitch pages (sales voice, Gemma featured):**
- `pitch/jordan-iq360/index.html` + `og.html`
- `pitch/asb-hawaii/index.html` + `og.html`
- `pitch/sean-levy/index.html`
- `pitch/blue-note-hawaii/index.html` + `og.html`
- `pitch/ellen/index.html`
- `pitch/darrell-chock/index.html` + `og.html`
- `pitch/hawaii-energy/index.html` + `og.html`
- `pitch/hamada-financial-group/index.html` + `og.html`
- `pitch/_meta/log.md`

**Tier 5 — strategy/voice files:**
- `content/strategy/moat-research-2026-05.md`
- `content/strategy/gemma-utilization-prep.md` (likely already
  Gemma-aware, but verify language alignment)
- `content/strategy/what-neverranked-is.md`

## Your zone — parallel window owns

Public HTML surfaces, dashboard code, generators, public hub,
social, reports, audit HTML pages:

**Tier A — public hub + reports:**
- `state-of-aeo/hawaii-2026/index.html` — masthead engine count
- `reports/state-of-aeo/state-of-aeo-2026-05-10.html` —
  methodology block
- `reports/state-of-aeo-hawaii-2026/state-of-aeo-hawaii-2026.md`
  + `.html`
- `standards/methodology/index.html` — public methodology page

**Tier B — homepage + commerce:**
- `index.html` (root homepage)
- `blog/aeo-pricing/index.html`
- `blog/what-is-aeo/index.html`

**Tier C — generated audit HTML pages (these may be regenerated
from MD source — check your generator scripts first):**
- `audits/emanate-wireless-inc/audit.html`
- `audits/central-pacific-bank/audit.html`
- `audits/first-hawaiian-bank/audit.html`
- `audits/drake-real-estate-partners/audit.html`
- `audits/asb-hawaii-2026-05/audit.html`
- `audits/ward-village/audit.html`
- `audits/bank-of-hawaii/audit.html`
- `audits/mvnp-agency/audit.html`

Note: `audits/asb-hawaii-2026-05/audit.html` may regenerate
from my MD edits. Coordinate via timestamp: I'll commit my MD
files first, you regenerate after.

**Tier D — dashboard code (your native zone):**
- `dashboard/src/citations.ts` (you already touched this)
- `dashboard/src/audit-qa-agent.ts`
- `dashboard/src/audit-template.ts`
- `dashboard/src/workflows/weekly-extras.ts`
- `dashboard/src/routes/checkout.ts`
- `dashboard/src/routes/citations.ts`

Anywhere engine arrays or count literals appear in code.

**Tier E — generator scripts (prevent regression):**
- `scripts/audit-pdf.mjs`
- `scripts/audit-to-blog.mjs`
- `scripts/new-pitch.mjs`
- `scripts/report-pdf.mjs`

**Tier F — social, LinkedIn, blog templates:**
- `social/posts/2026-05-06-six-engines-broadcast/caption.md` +
  `hero-video-source.html` + `hero-video-instagram-source.html`
  (note: the *directory name* is "six-engines-broadcast" —
  leave the directory name alone, only update internal copy.
  Future broadcasts can use a fresh directory.)
- `social/posts/2026-05-05-citation-receipt/caption.md`
- `social/posts/2026-05-05-the-12-percent/caption.md` +
  `platforms.md`
- `social/posts/2026-05-05-ranking-zero-traffic/caption.md`
- `social/posts/2026-05-06-paid-for-rankings/caption.md`
- `social/voice-quickref.md`
- `social/playbook.md`
- `linkedin/README.md`
- `linkedin/post-03.md` + `post-03-scorecard-source.html`
- `linkedin/personal-posts.md`
- `content/blog/calendar.md` (editorial calendar)
- `content/blog/template.md` (blog template — important to
  refresh so future posts default to 7)
- `content/blog/qa-checklist.md`
- `content/blog/aeo-teardown-hawaii-community-banking.md`

**Tier G — misc:**
- `content/triggered-builds.md`
- `content/design/reverse-engineer-citations.md`
- `content/leaderboards/methodology.md`
- `content/certification/program-overview.md`
- `content/engine-changelog/README.md` (add Gemma entry —
  this is the canonical engine list, update first)
- `content/asb-mvnp-onepager.md` — verify if still active or
  superseded by `content/meeting-evidence/`. If active, refresh.
  If stale, leave or archive.
- `content/asb-mvnp-meeting-prep.md` — same check
- `content/asb-mvnp-preread-email.md` — same check
- `SESSION-HANDOFF-2026-05-04.md` — historical doc, do not
  refresh (it's a session log of past state)

## Coordination rules

1. **No file overlap.** If you find a file I'm assigned to and want
   to touch it, drop a reply file. Vice versa.
2. **Commit cadence:** I'm committing in tiers (Tier 1, then 2,
   then 3...). You can commit by tier too or in one sweep — your
   call. Just pull before each commit.
3. **Generator scripts first if you go that route.** If
   `scripts/audit-pdf.mjs` or similar templates engine count, fix
   the generator before any regenerated outputs to avoid the
   regression.
4. **`content/engine-changelog/README.md` is canonical** — add the
   Gemma entry first so any reader can see when it shipped and
   what changed.
5. **Date stamps:** per Update 4 in parent handoff, "as of"
   methodology dates can bump to 2026-05-11 once 24h of Gemma
   rows have landed. Use your judgment on which files warrant
   that stamp bump vs. leaving the existing date.

## What I'll do if I finish my tier early

Pick up from your zone starting with Tier G misc (lowest risk
of conflict). If that happens I'll drop a reply file naming
which files I claimed.

## If something has to slip

Per parent handoff: Tier 1 (ASB May 18 packet) is the single
highest priority. Everything else can ship before Tuesday
launch or slip to "next release" framing.

Lance is awake and looped in — escalate via chat if blocking.

---

*This handoff is the work split, not the strategy. For the
why/positioning, read `gemma-7th-engine-content-refresh.md` in
this directory first.*
